# AI Conversation Import + MCP Connector — Design Plan

**Status:** Draft  
**Date:** 2026-04-14  
**Author:** Engineering planning session

---

## Overview

This document designs two interconnected features:

1. **Conversation Import** — Export a Claude conversation about a property as structured markdown, then import it into the app to auto-populate maintenance tasks, inventory items, purchase lists, and notes.
2. **MCP Connector** — A local MCP server that wraps the property manager's data layer, enabling Claude Desktop/Code to query and write property data directly via tool calls.

---

## 1. Conversation Export Format (CCSF — Claude Conversation Summary Format)

### Design decision: Hybrid prose + fenced typed blocks

Pure JSON/YAML is reliable for machines but fights Claude's natural output style. Pure prose is readable but requires expensive extraction every time. The solution: fenced code blocks with typed headers embedded in readable prose.

**Format:**

```markdown
---
property: Tannerville Farmhouse
property_id: tannerville
date: 2026-04-14
participants: [Pete, Claude]
session_topic: Spring 2026 planning
---

## Summary

[Prose summary of the conversation...]

## Outcomes

### Maintenance Tasks

```task
title: Chimney inspection and cleaning
category: fireplace_chimney
due: 2026-09-15
estimated_cost: 250
recurrence: annually
notes: Last done fall 2024. Creosote buildup concern.
confidence: high
```

```task
title: Replace pressure tank bladder — well system
category: well_water
due: 2026-06-01
estimated_cost: 400
priority: high
confidence: medium
raw_text: "Pete mentioned the pressure tank is short-cycling"
```

### Needed Purchases / Future Inventory

```purchase
title: Generac whole-home transfer switch
category: electrical
estimated_cost: 1200
vendor: local electrician
notes: Required before generator can power well pump
confidence: high
```

### Completed Work (to log)

```completed
title: Replaced kitchen faucet
category: plumbing
date_completed: 2026-03-15
cost: 280
notes: Delta Leland single-handle, installed by Pete
```

### Notes / Plans

```note
title: Evaluate propane vs natural gas for backup heat
body: Current oil system is aging. Discussed switching to propane in 3-5 year horizon. Get quotes spring 2027.
```
```

**Why fenced blocks:**
- Fast-path parser with zero API calls if blocks are well-formed
- Prose sections stay readable in GitHub/Drive
- Fallback extraction still works against prose if Claude produces imperfect blocks
- `confidence` + `raw_text` fields enable review UI to show evidence for each extraction

**Supported block types:** `task`, `purchase`, `completed`, `inventory`, `note`, `insurance`, `permit`

---

## 2. Import UI

**Location:** Dedicated "Import" route accessible from the main nav (or property context menu). Also accessible from a floating action button on Dashboard.

**Input methods:**
1. File picker (`.md` files)
2. Paste raw markdown into a textarea
3. Drive inbox folder (app polls `PropertyManager/inbox/` on startup — auto-imports any `.md` files found there)

**Extraction flow:**
1. User selects/pastes content → app shows raw preview
2. Single OpenRouter call extracts all typed items (one call, not per-section — cross-section relationships matter)
3. Review screen shows each extracted item with: type badge, confidence indicator (green/amber/red), raw_text evidence, dedup warning if similar item exists in localIndex
4. User can: approve all, approve individually, edit before saving, discard
5. Approved items write to localIndex as `pending_upload`, sync engine picks them up

**Deduplication:** Compare against existing localIndex records using title similarity (Levenshtein) + category match. Flag probable dupes but never auto-discard — user decides.

---

## 3. OpenRouter Extraction Pipeline

### Schema

```typescript
const ConversationImportSchema = z.object({
  property_id: z.string().optional(),
  tasks: z.array(z.object({
    title: z.string(),
    category: z.string(),
    due: z.string().optional(),
    estimated_cost: z.number().optional(),
    recurrence: z.enum(['once','weekly','monthly','quarterly','annually']).optional(),
    priority: z.enum(['low','medium','high']).optional(),
    notes: z.string().optional(),
    confidence: z.enum(['high','medium','low']),
    raw_text: z.string().optional(),
  })),
  purchases: z.array(/* similar shape */),
  completed: z.array(/* with date_completed, cost */),
  inventory: z.array(/* equipment records */),
  notes: z.array(z.object({ title: z.string(), body: z.string() })),
});
```

### Call strategy
- **One call** with full markdown as input
- System prompt: "You are extracting structured property management records from a conversation summary. Extract ALL actionable items. Be conservative with confidence scores — only 'high' if explicitly stated."
- Model: `anthropic/claude-sonnet-4-6` (same as rest of app)
- Max tokens: 4096 output — typical planning summary fits in one call
- Fast-path: if fenced blocks are present and well-formed, parse them directly without LLM call (saves cost + latency)

---

## 4. Connector Architecture

### Options evaluated

| Option | Pros | Cons |
|--------|------|------|
| Browser extension message handler | No install beyond extension | Chrome-only, no Claude Desktop reach, complex postMessage API |
| Local HTTP sidecar (Node/Express) | Standard REST, works everywhere | Port management, CORS, process lifecycle, offline gap |
| **MCP server (recommended)** | Native Claude Desktop/Code integration, no ports/CORS, standard tool protocol | Requires `~/.config/claude/claude_desktop_config.json` entry |
| Drive-only | Zero infrastructure | High latency, 401 offline, no query capability |

### Recommended: Local MCP server

**Why MCP wins:**
- Pete is already using Claude Desktop/Code — zero new tooling
- MCP tools are first-class in Claude conversations, enabling natural "add this task" interactions
- No HTTP server means no port conflicts, no CORS, no `netsh` firewall rules
- Drive is the shared data layer — MCP server reads/writes Drive files directly, PWA syncs from Drive on next open
- `dry_run: true` parameter on import tool gives safe conversational preview before committing

**Architecture:**

```
Claude Desktop
    ↓ tool calls
property-manager-mcp (Node.js, stdio transport)
    ├── reads: Drive API (list files, fetch markdown)
    ├── writes: Drive API (upload markdown, create folders)
    └── Drive folder: PropertyManager/
            ├── tannerville/equipment/*.md
            ├── tannerville/maintenance/*.md
            ├── inbox/*.md  ← MCP drops imports here, PWA picks up
            └── ...

PWA (browser)
    ├── localIndex (localStorage) — primary working store
    └── syncEngine — pulls from Drive on startup, pushes pending on auth
```

**MCP tools to implement:**

```typescript
// Query tools
get_property_summary(property_id: string) → { tasks, inventory_count, overdue, upcoming }
list_maintenance_tasks(property_id: string, status?: 'open'|'overdue'|'upcoming') → Task[]
list_equipment(property_id: string, category?: string) → Equipment[]
get_utility_history(property_id: string, account?: string) → UtilityBill[]

// Write tools  
add_maintenance_task(property_id, task: TaskInput) → { id, status }
add_equipment(property_id, equipment: EquipmentInput) → { id, status }
import_conversation_summary(property_id, markdown: string, dry_run?: boolean) → ImportPreview | ImportResult
log_completed_work(property_id, record: CompletedWorkInput) → { id, status }
```

**Install:** `npm install -g property-manager-mcp` then one JSON config entry. Or local path for dev.

---

## 5. ADR — MCP Server as Connector

**ADR-008: Use local MCP server for Claude connector**

**Context:** Need a way for Claude to query and write property manager data without a backend.

**Decision:** Build a local MCP server (stdio transport) that uses Drive API directly as its data layer, independent of the PWA's localStorage.

**Consequences:**
- (+) Works with Claude Desktop and Claude Code with zero new infrastructure
- (+) Drive as shared data layer means PWA and MCP server are naturally in sync on next PWA open
- (+) `dry_run` import flow gives safe preview before committing
- (-) Drive API requires OAuth — MCP server needs its own credentials (service account or separate PKCE flow)
- (-) PWA must handle external Drive writes gracefully — syncEngine pull-on-startup must not overwrite local pending changes (conflict resolution needed)
- (-) Offline: MCP server can't write to Drive without connectivity (queue to local file)

**Mitigation for Drive conflict risk:** PWA's `pullFromDrive` should compare `driveUpdatedAt` vs `localUpdatedAt` before overwriting. Records with `syncState: pending_upload` are never overwritten by pull.

---

## 6. Implementation Plan

### Phase A — MVP (Conversation Import UI only, ~1 week)
- `ImportScreen.tsx` with file picker + paste input
- Fast-path fenced block parser (no LLM call for well-formed docs)
- OpenRouter fallback extraction with `ConversationImportSchema`
- Review UI with confidence badges and dedup warnings
- Writes to localIndex → syncs to Drive via existing syncEngine
- Add "Export Summary" button to any property conversation (generates CCSF template)

**Value:** Lets Pete paste a Claude conversation summary and have tasks/purchases auto-populated immediately. No MCP needed.

### Phase B — Drive inbox polling (~3 days, after Phase A)
- `syncEngine` checks `PropertyManager/inbox/` folder on startup
- Auto-imports any `.md` files found, moves them to `inbox/processed/`
- Enables Claude to drop a file in Drive and have it appear in the app

### Phase C — MCP server (~1 week)
- New repo: `property-manager-mcp`
- Implements all query + write tools above
- OAuth: reuse existing Google OAuth app, add `offline_access` scope for refresh token
- README with one-command install and Claude Desktop config snippet

### Phase D — Direct entry tools (~3 days, after Phase C)
- `add_maintenance_task`, `add_equipment`, `log_completed_work` tools
- Write directly to Drive markdown files (not through inbox)
- PWA picks up on next sync

---

## 7. Key Risks

1. **Drive sync conflict** — MCP writes while PWA is open. Mitigation: PWA conflict detection in `pullFromDrive`, user-facing conflict resolution UI.
2. **MCP OAuth credentials** — separate auth flow needed for server. Use a stored refresh token after one-time PKCE flow.
3. **Extraction accuracy** — LLM may misclassify items or miss them. Mitigation: mandatory review step, `confidence` scores, `raw_text` evidence shown in UI.
4. **Drive inbox latency** — up to 30s between MCP write and PWA pickup (sync interval). Acceptable for this use case.

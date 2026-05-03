# Property Manager — Integration Test Plan

This document is the authoritative QA reference for verifying every
registered module end-to-end. It is structured so each H2 section can be
followed manually as a checklist or driven by an automation harness
(`tests/modules.spec.ts` already automates the highest-leverage cross-
module scenarios — see Part 4 below).

## How to use this plan

- **Manual walkthrough.** For pre-release smoke tests, work through the
  module sections in order. A clean run takes ~45 minutes for the full
  suite. Check the boxes as you go; any failure should be filed against
  the offending module's branch label.
- **Per-module.** When working in one module's branch, run only that
  section before requesting review. Cross-module integration scenarios
  (Part 4) are owner-of-master's responsibility — they run on every
  merge to master.
- **Playwright automation.** A subset of these scenarios are encoded in
  `tests/modules.spec.ts`. Run with `npx playwright test
  tests/modules.spec.ts`. The spec covers the highest-value flows
  (toggle-and-cascade, settings UI, route availability, required-module
  lock, enable-all/reset). Manual scenarios stay in the plan because UI
  affordances and visual checks resist automation.
- **Regression watch.** When a bug is filed against a module, add a
  numbered case to the relevant section so the next pass catches it.

## Test environment setup

1. **Dev server.** `npm run dev -- --port 5173` (or pick any free port
   in 5170–5179 if you're working in a worktree). The server reads
   `.env` from the repo root for `VITE_GOOGLE_CLIENT_ID`,
   `VITE_GOOGLE_CLIENT_SECRET`, and `VITE_OPENROUTER_KEY`.
2. **Test property.** The bundled mock seed (`src/data/mockData.ts`)
   includes Tannerville, Camp, E2E, and R2. Tannerville is the standard
   integration target — it has a configured Drive root, seeded tasks,
   capital items, and equipment.
3. **Drive mock mode.** Sign in with `dev_token` to route every Drive
   call through `localDriveAdapter` (storage key `pm_dev_drive_v1`).
   This avoids touching real Drive while exercising the full sync
   pipeline. Set `localStorage.pm_token = 'dev_token'` and
   `localStorage.pm_token_expires = Date.now() + 86400000` to skip the
   OAuth flow.
4. **Reset between scenarios.** `localStorage.clear()` followed by a
   reload re-seeds everything. For module-toggle tests, use the
   Settings → Modules screen (`/settings/modules`) rather than editing
   `pm_property_modules_<id>` directly — the UI runs the dep cascade
   for you.

---

## Module test suites

### Core (`core`)

**Preconditions:** None (always-on baseline).

**Happy path:**

- [ ] **C-1 Dashboard renders without auth errors.** Navigate to `/`.
      Expect: greeting, property cards, today's tasks, no error
      boundary visible.
- [ ] **C-2 Settings panel reachable.** Click Settings in the sidebar.
      Expect: route resolves to `/settings`, Settings screen renders.
- [ ] **C-3 Sync screen reachable.** Navigate to `/sync`. Expect: sync
      controls (Push, Pull, Sync All) visible.
- [ ] **C-4 Search reachable.** Navigate to `/search`. Expect: search
      input and recent results panel render.

**Edge cases:**

- [ ] **C-E1 Empty property set.** Clear `pm_properties_v1` →  reload.
      Expect: app recovers (no crash), seeds from mock.
- [ ] **C-E2 Disabled core blocked.** Open `/settings/modules`, attempt
      to toggle Core off. Expect: the toggle is locked / shows a "core
      module required" indicator.

**Integration points:**

- All other modules require core's routes (Dashboard) and its property
  record type. Verify by disabling one optional module and confirming
  the dashboard still renders.
- Expected result for each case: routes resolve, no thrown exceptions.

---

### Maintenance (`maintenance`)

**Preconditions:** Tannerville selected; seeded tasks present (mock
seed runs on first load if `pm_tasks_seeded_v1` is unset).

**Happy path:**

- [ ] **M-1 Task list renders.** `/maintenance` shows Due, Upcoming,
      and History sections. Overdue items have a red badge.
- [ ] **M-2 Mark complete.** Click a task → "Mark Complete" → fill the
      form → Save. Expect: task moves to History, `completed_event`
      record is created (visible via DevTools `localStorage.pm_index_v1`).
- [ ] **M-3 Voice memo flow.** On Mark Complete, click "Record voice
      memo" → grant mic permission → speak 5 sec → stop. Expect:
      transcript fills the notes field via OpenAI (or the
      placeholder if OpenRouter key isn't set).
- [ ] **M-4 Checklist run.** Navigate to `/checklists` → start any
      template → complete each item → finish. Expect: a `checklist`
      record + N `checklist_item` records.
- [ ] **M-5 Guided checklist (Phase 3).** From a run page, click
      "Guided mode". Expect: a stepper UI walking through items one at
      a time with photo/note prompts.

**Edge cases:**

- [ ] **M-E1 Empty state.** Disable maintenance → re-enable → verify
      seed re-runs.
- [ ] **M-E2 Offline complete.** Go offline (DevTools → Network →
      Offline) → mark complete. Expect: completed record queues
      locally; on reconnect it pushes to Drive.
- [ ] **M-E3 Concurrent edit.** With a task open in two tabs, edit
      both, save both. Expect: second save lands in `conflict` state;
      ConflictsModal opens with field-level resolution.

**Integration points:**

- Writes to `task` and `completed_event` (consumed by Calendar for
  upcoming-due rendering).
- Voice-memo flow integrates with the AI module if enabled (transcript
  + extraction); if AI is disabled, the recorder still saves audio
  blob but skips extraction.

---

### AI (`ai`)

**Preconditions:** OpenRouter key set in Settings (`VITE_OPENROUTER_KEY`
or via the Settings screen) — AI features warn but don't crash without
it.

**Happy path:**

- [ ] **AI-1 Advisor screen.** `/advisor` opens; type a question →
      Submit. Expect: a streaming response from OpenRouter.
- [ ] **AI-2 Equipment inspection.** `/equipment/<id>/inspect` opens
      the inspection flow → take photo → submit. Expect: AI returns a
      structured `condition_assessment` record.
- [ ] **AI-3 Risk Brief generation.** `/risk-brief` → "Generate brief"
      → wait for completion. Expect: a structured `property_risk_brief`
      record persisted to local index.

**Edge cases:**

- [ ] **AI-E1 Missing API key.** Clear OpenRouter key → reload. Expect:
      console warns (`[ai module] OpenRouter API key is not configured`)
      and AI screens render a "configure your key" call-to-action.
- [ ] **AI-E2 Network failure.** Block requests to `openrouter.ai` →
      submit. Expect: error toast, no record persisted.

**Integration points:**

- `assessCondition` (lib/conditionAssessment.ts) is consumed by the
  inventory inspection flow.
- `generateRiskBrief` (lib/riskEngine.ts) is consumed by the risk
  module.
- Required by: `contents`, `import`, `risk` (the dep cascade auto-
  enables AI when any of these is enabled).

---

### Capital (`capital`)

**Preconditions:** None.

**Happy path:**

- [ ] **CAP-1 Budget view.** `/budget` renders the capital plan with
      seeded items (HVAC replacement, roof, etc.).
- [ ] **CAP-2 Add capital item.** Click "+ Add" → fill form → Save.
      Expect: item appears in the list, persists across reload.
- [ ] **CAP-3 Mark complete.** Open an item → status → "Completed" →
      cost actuals → Save. Expect: progress bar updates, completedAt
      stamped.

**Edge cases:**

- [ ] **CAP-E1 Override.** Edit a seeded item. Expect: an override is
      written to `pm_capital_overrides`, leaving the seed pristine.

**Integration points:**

- Items with a `dueAt` in the next 30 days surface in the Calendar
  module.

---

### Insurance (`insurance`)

**Preconditions:** None.

**Happy path:**

- [ ] **INS-1 Policy list.** `/insurance` shows current policies.
- [ ] **INS-2 Add policy.** New → fill carrier, policy number,
      effective + expiry dates → Save. Expect: policy persisted, expiry
      visible on `/expiry` if the expiry module is enabled.
- [ ] **INS-3 Renewal reminder.** Set expiry 30 days out. Expect: the
      Expiry tracker badge shows the count.

**Integration points:**

- Writes feed `expiry` module's badge.
- Insurance docs uploaded via Drive contribute to Home Book if
  homebook module is enabled.

---

### Permits (`permits`)

**Preconditions:** None.

**Happy path:**

- [ ] **PER-1 Permit list.** `/permits` shows seeded permit records.
- [ ] **PER-2 Add permit.** New → fill type, status, expiry → Save.
      Expect: persisted; expiring permits show on `/expiry`.
- [ ] **PER-3 Status transitions.** Edit permit → status: Open →
      Closed. Expect: history reflects the change.

**Integration points:**

- Feeds `expiry` module.
- Linked from inspection-time prompts in the AI module.

---

### Mortgage (`mortgage`)

**Preconditions:** None.

**Happy path:**

- [ ] **MTG-1 Loan view.** `/mortgage` shows the loan summary +
      amortization preview.
- [ ] **MTG-2 Edit principal/rate.** Change rate → Save → Recalculate.
      Expect: amortization table updates.
- [ ] **MTG-3 Record payment.** New payment → fill amount, date →
      Save. Expect: payment listed; principal/interest split derived.

**Edge cases:**

- [ ] **MTG-E1 Zero balance.** Pay off remaining principal. Expect:
      summary shows "Paid in full".

---

### Fuel (`fuel`)

**Preconditions:** None.

**Happy path:**

- [ ] **FUEL-1 Delivery list.** `/fuel` renders deliveries.
- [ ] **FUEL-2 Log delivery.** New → vendor, gallons, cost → Save.
      Expect: persisted; per-gallon trend recomputed on the chart.

**Integration points:**

- Burn-rate analysis can be surfaced on the Dashboard.

---

### Utility (`utility`)

**Preconditions:** None.

**Happy path:**

- [ ] **UTIL-1 Account list.** `/utilities` shows accounts (electric,
      gas, water).
- [ ] **UTIL-2 Add bill.** Open account → New bill → fill period and
      amount → Save. Expect: bill persisted; YTD chart updates.

**Integration points:**

- Bills feed monthly burn analysis on the Dashboard.

---

### Tax (`tax`)

**Preconditions:** None.

**Happy path:**

- [ ] **TAX-1 Assessment view.** `/tax` shows the tax assessment
      record.
- [ ] **TAX-2 Add payment.** New payment → year, amount → Save.
      Expect: payment listed.
- [ ] **TAX-3 YoY assessment trend.** Add at least three years of
      assessments. Expect: a trend graph renders.

---

### Road (`road`)

**Preconditions:** None.

**Happy path:**

- [ ] **RD-1 Road log.** `/road` shows maintenance log.
- [ ] **RD-2 Add maintenance event.** New → grade gravel → cost →
      Save. Expect: persisted.

---

### Well (`well`)

**Preconditions:** None.

**Happy path:**

- [ ] **WL-1 Test list.** `/well-tests` renders past tests.
- [ ] **WL-2 Add test.** New → test date, results → Save. Expect:
      persisted; PFAS / coliform flagged if positive.

---

### Septic (`septic`)

**Preconditions:** None.

**Happy path:**

- [ ] **SEP-1 Pump-out log.** `/septic-log` renders past pump-outs and
      next-due date.
- [ ] **SEP-2 Add pump-out.** New → date → Save. Expect: next-due
      recomputed.

---

### Generator (`generator`)

**Preconditions:** None.

**Happy path:**

- [ ] **GEN-1 Log view.** `/generator` shows transfer-switch exercises
      and runtime.
- [ ] **GEN-2 Log run.** New → date, duration → Save.

---

### Vendor (`vendor`)

**Preconditions:** None.

**Happy path:**

- [ ] **VEN-1 Directory.** `/vendors` renders contacts.
- [ ] **VEN-2 Add vendor.** New → name, trade, phone → Save.
- [ ] **VEN-3 Search.** Filter by trade → expected vendors visible.

---

### Calendar (`calendar`)

**Preconditions:** None.

**Happy path:**

- [ ] **CAL-1 Calendar render.** `/calendar` shows month grid with task
      due dates.
- [ ] **CAL-2 Cross-module overlay.** Capital items with due dates,
      permits expiring, well-test schedules all appear as colored
      events.
- [ ] **CAL-3 Click event → record.** Click a task event → navigates
      to the source record (e.g. `/maintenance`).

**Integration points:**

- Reads from maintenance, capital, permits, expiry — verify all four
  contribute when enabled.

---

### Map (`map`)

**Preconditions:** None.

**Happy path:**

- [ ] **MAP-1 Map render.** `/map` renders Leaflet tiles centered on
      the active property.
- [ ] **MAP-2 Property pins.** All properties show as pins. Click a pin
      → switches active property.

**Edge cases:**

- [ ] **MAP-E1 Missing coordinates.** Property with no lat/lng → pin
      hidden, no crash.

---

### Inventory (`inventory`)

**Preconditions:** None.

**Happy path:**

- [ ] **INV-1 List.** `/inventory` shows equipment cards by category.
- [ ] **INV-2 Capture.** Click "+" → category → fill form → Save.
      Expect: equipment record persisted; appears in list.
- [ ] **INV-3 Detail.** Click a card → `/equipment/<id>` shows full
      detail, service history, condition history.
- [ ] **INV-4 Inspect.** Click "Inspect" → camera flow → submit.
      Expect: AI condition assessment persisted (requires AI module).

**Integration points:**

- Inspection flow requires AI module — verify error message if AI is
  disabled.
- Equipment records feed Home Book section when homebook is enabled.

---

### Contents (`contents`)

**Preconditions:** **Requires AI module** (auto-enabled by dep
cascade).

**Happy path:**

- [ ] **CON-1 Contents list.** `/contents` shows insurance-grade
      contents inventory.
- [ ] **CON-2 Add item.** New → photo → AI extracts brand/model/value →
      Save. Expect: persisted with AI-derived fields.
- [ ] **CON-3 Export.** Click "Export CSV" → file downloads.

**Edge cases:**

- [ ] **CON-E1 Disable AI.** Toggle AI off via `/settings/modules`.
      Expect: contents module also disappears from nav (cascade off).
- [ ] **CON-E2 Re-enable AI.** Toggle AI on. Expect: contents
      re-appears in nav (re-cascade — note: contents stays disabled
      until explicitly re-enabled).

---

### HomeBook (`homebook`)

**Preconditions:** None for navigation; population requires data from
other modules.

**Happy path:**

- [ ] **HB-1 Builder.** `/home-book` renders the section list with
      data-presence indicators.
- [ ] **HB-2 Generate PDF.** Click "Export PDF" → wait for
      generation. Expect: download triggered.
- [ ] **HB-3 Section coverage.** Each section corresponds to a registered
      record type (property, equipment, permit, insurance, etc.).
      Disable one source module → its section grays out as "no data".

---

### Risk (`risk`)

**Preconditions:** **Requires AI module.**

**Happy path:**

- [ ] **RISK-1 Brief.** `/risk-brief` generates a property-level risk
      summary using AI on aggregated records.
- [ ] **RISK-2 Re-generate.** Click "Re-generate". Expect: timestamp
      updates, brief refreshed.

**Integration points:**

- Aggregates inputs from inventory (equipment), permits, insurance,
  well-tests. Disable any of these and verify the brief notes the
  missing dimension instead of crashing.

---

### Import (`import`)

**Preconditions:** **Requires AI module.** Drive token configured (or
dev token).

**Happy path:**

- [ ] **IMP-1 Inbox poll.** `/import` shows the Drive inbox queue with
      a "Refresh" button.
- [ ] **IMP-2 Process candidate.** Drop a PDF in the inbox folder →
      Refresh. Expect: AI extracts → candidate appears with
      pre-filled fields. Approve → record persisted.
- [ ] **IMP-3 Reject candidate.** Reject. Expect: removed from queue,
      original file moved to a "rejected" sub-folder.

**Edge cases:**

- [ ] **IMP-E1 Dedup.** Re-poll after approval. Expect: already-imported
      file is filtered out.
- [ ] **IMP-E2 Bad parse.** Drop a malformed file. Expect: error item
      with a parse-failure reason.

**Integration points:**

- Nav badge reads `pm_import_queue_<propertyId>` directly via the
  module's `useInboxQueueBadge` hook.

---

### Search (`search`)

**Preconditions:** Records exist locally.

**Happy path:**

- [ ] **SEA-1 Search query.** `/search` → type "boiler" → results group
      by record type.
- [ ] **SEA-2 Click result.** Click → navigates to record's owning
      route (e.g. equipment → `/equipment/<id>`).

**Edge cases:**

- [ ] **SEA-E1 No results.** Search for "zzzzzz". Expect: empty-state
      message, no crash.

---

### HA (`ha`)

**Preconditions:** Home Assistant URL + token configured in Settings.
(Without these, lifecycle hooks no-op and the dashboard widgets render
empty states.)

**Happy path:**

- [ ] **HA-1 Live state.** Dashboard shows the HA Live Status panel
      with current entity readings.
- [ ] **HA-2 Bulk import.** Open `Settings` → "HA: Import Entities" →
      select a few sensors → import. Expect: equipment records created
      with `haEntityId` linkage.
- [ ] **HA-3 Per-entity threshold.** Open an HA-linked equipment →
      threshold panel → set min/max → Save. Expect: alert fires when
      reading crosses threshold.
- [ ] **HA-4 Sparkline.** Equipment detail → 24h history sparkline
      renders with sensible bounds.
- [ ] **HA-5 Automations list.** Settings → "HA Automations" →
      read-only list of HA's enabled automations.

**Edge cases:**

- [ ] **HA-E1 Token revoked.** Invalidate the HA long-lived token →
      reload. Expect: panel shows "HA unreachable", no crash, retry
      backoff active.
- [ ] **HA-E2 onDeactivate without onActivate.** Disable HA module
      before HA was ever connected. Expect: `uninstallFocusPolling()`
      doesn't throw.

**Integration points:**

- Records `ha_threshold` and `ha_alert` are local-only (`syncable:
  false`). Verify they don't appear in the sync push queue.
- Alert badge on the dashboard nav row is contributed by HA.

---

### Narrative (`narrative`)

**Preconditions:** None.

**Happy path:**

- [ ] **NAR-1 Settings panel.** Settings → Narrative section visible.
      The module declares no routes; its surface is the embedded
      panel.
- [ ] **NAR-2 Add narrative entry.** Save text. Expect: persisted as
      `narrative_entry` record, surfaced in HomeBook builder when
      enabled.

---

### Expiry (`expiry`)

**Preconditions:** Records with expiry dates exist (insurance, permits,
warranties).

**Happy path:**

- [ ] **EXP-1 Tracker view.** `/expiry` aggregates everything expiring
      in the next 90 days across all properties.
- [ ] **EXP-2 Badge count.** Sidebar nav badge shows the count;
      decreases as items expire or are renewed.
- [ ] **EXP-3 Click → source.** Click an entry → navigates to the
      owning record (insurance / permit / etc.).

**Edge cases:**

- [ ] **EXP-E1 Empty.** Clear all expiry records. Expect: empty-state
      message, no badge.

---

## Cross-module integration scenarios

These end-to-end flows exercise multiple modules together. They are
the most valuable scenarios to keep green — automate where feasible
(see `tests/modules.spec.ts`).

### X-1: AI dep cascade ON/OFF

1. Open `/settings/modules`.
2. Disable AI. Expect: `contents`, `import`, and `risk` toggles also
   flip off (cascade), their nav entries disappear, and navigating to
   `/contents` redirects to dashboard.
3. Re-enable AI. Expect: `contents` / `import` / `risk` re-appear in
   the nav (their stored enabled flag is restored — they're back
   because they were already on before the cascade flipped them off).
4. Re-disable just `contents` (leaving AI on). Expect: AI stays on,
   only contents disappears.

### X-2: Equipment → voice memo → contents inventory

1. From `/inventory`, capture a new piece of equipment (e.g.
   "TestBrand HVAC").
2. From `/maintenance`, mark a task complete with a voice memo →
   transcript captured.
3. From `/contents`, add a contents item via photo capture. Expect: AI
   extraction populates fields.
4. From `/home-book` → "Generate PDF". Expect: equipment, completed
   task, and contents item all appear in the PDF.

### X-3: Capital due-date → Calendar overlay

1. From `/budget`, create a capital item with a `dueAt` 14 days out.
2. Navigate to `/calendar`. Expect: the capital item shows on its due
   date with the capital event color.
3. Click the event → navigates to `/budget` with the item highlighted.

### X-4: Permit expiry → Expiry tracker → Calendar

1. Add a permit with expiry 30 days out via `/permits`.
2. Verify it appears in `/expiry` and contributes to the sidebar badge
   count.
3. Verify it appears in `/calendar` on the expiry date.
4. Renew the permit (new expiry 1 year out). Expect: it falls out of
   the 90-day expiry view but is still visible in `/permits`.

### X-5: HA alert → Equipment detail → ConflictsModal

1. With HA configured, set a low threshold on a temperature sensor.
2. Wait for the focus-polling tick or trigger via `Refresh HA` button.
   Expect: alert fires, badge appears in nav, dashboard banner shows.
3. Open `/equipment/<id>` for the linked equipment. Edit notes locally.
4. Simultaneously: with the dev Drive adapter, write a divergent
   vclock entry for the same record (modeling another device's edit).
5. Trigger Sync. Expect: record lands in `conflict` state, the
   ConflictsModal opens with field-level Mine/Theirs choices, and
   resolving each field flips `syncState` back to `pending_upload`.

### X-6: Disable everything optional → Core still works

1. From `/settings/modules`, disable everything except Core. Expect:
   nav rail collapses to the static Capture tile + Dashboard +
   Settings.
2. Navigate to `/`, `/settings`, `/sync`, `/search`, `/capture` — all
   resolve.
3. Navigate to `/maintenance` (now disabled). Expect: catch-all
   redirect to `/`.
4. Re-enable a single optional module (e.g. maintenance). Expect: nav
   reflects the change immediately, route resolves.

---

## Notes for QA

- **Module-toggle UI smoke** is automated in `tests/modules.spec.ts` —
  prioritize manual time on the integration scenarios above.
- **Conflict resolution** has dedicated coverage in
  `src/vault/__tests__/syncEngine.test.ts` and `tests/multi-device.spec.ts`;
  the X-5 scenario above is the user-facing surface.
- When adding a new module, copy a section from this plan as the
  template, fill in the preconditions and happy-path cases, and add a
  cross-module scenario if its records feed another module.

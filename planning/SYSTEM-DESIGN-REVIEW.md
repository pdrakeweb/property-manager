# System Design Review — Property Manager PWA

**Reviewed by:** Claude (Sonnet 4.6)  
**Date:** April 12, 2026  
**Specs reviewed:** `property-capture-tool-spec.md` (v1), `property-manager-full-spec.md` (v2, supersedes)  
**Scope:** Architecture review across data flow, auth, offline strategy, HA integration, multi-property scaling, and gap analysis

---

## Executive Summary

The overall architecture is sound for a personal-use PWA: no backend, Drive as durable storage, PKCE auth, IndexedDB offline queue. The design decisions made on April 11 (OpenRouter, Zod schemas, Zustand, `drive` scope) are all correct calls. What follows are the issues that will cause real pain during implementation or as the system grows — not a lecture on the obvious stuff.

---

## 1. Data Flow: Photo → OpenRouter → Form Fill → Drive Upload

### The Happy Path Is Underspecified

The flow diagram shows a clean linear sequence but a single "Save" operation involves multiple independent Drive API calls:

1. Upload photo 1
2. Upload photo 2 (if multiple)
3. Upload `{category}_{timestamp}.md`
4. Read `_index.md` from Drive
5. Modify it (append new record row)
6. Re-upload `_index.md`

That's up to N+3 network operations with no transaction semantics. The current `uploadStatus` field sits at the `EquipmentRecord` level — it doesn't track which individual files succeeded. **If connectivity drops after photos 1–2 upload but before the MD file and index update, your retry logic re-uploads everything or figures out what's missing.** This needs per-file tracking:

```typescript
interface EquipmentRecord {
  // ... existing fields
  uploadStatus: 'draft' | 'pending' | 'uploaded' | 'error';
  driveFileId?: string;                   // MD file ID — set when MD uploaded
  drivePhotoIds: string[];                // IDs of successfully uploaded photos
  pendingPhotoIndices: number[];          // which photos still need uploading
  indexUpdated: boolean;                  // whether _index.md was updated
}
```

Retry logic should skip already-uploaded photos by checking `drivePhotoIds.length` against `photoFilenames.length`. Otherwise a 5-photo record can waste Drive API calls and produce duplicate files on re-upload (Drive will create a new file, not overwrite, since you're using `files.create` with `parents`).

### The `_index.md` Write Pattern Is the Weakest Link

`_index.md` is read-modify-write with no optimistic locking. The write sequence:

```
GET _index.md → parse Markdown table → append row → PUT _index.md
```

This fails silently in at least two scenarios:

**Scenario A — Flapping connectivity:** Record uploads succeed, then connectivity drops before index update. Queue retries the index update tomorrow. Meanwhile, app reads the stale index and checklist shows the category as incomplete. Confusing.

**Scenario B — Two offline records syncing:** You capture a generator record and an HVAC record while offline. Both sync at once. Both read the same `_index.md` from Drive. Both append their row. One PUT wins; the other's changes are lost. Not a common case for a single user, but possible (phone + desktop, both catching up after camp trip).

**Recommendation:** Treat `_index.md` as a *derived artifact*, not a write target. The canonical app state is `_app_index.json`. The app writes structured JSON (defined below), then regenerates `_index.md` from it on demand. Serializing JSON is safer than string-manipulating a Markdown table.

```typescript
// _app_index.json schema — define this explicitly
interface AppIndex {
  version: number;
  propertyId: string;
  lastUpdated: string;
  records: {
    id: string;
    categoryId: string;
    displayName: string;      // "Generac 22kW"
    driveFileId: string;
    timestamp: string;
    recordType: string;
  }[];
  maintenanceTasks: MaintenanceTask[];
  capitalItems: CapitalItem[];
  serviceHistory: { date: string; system: string; cost?: number; driveFileId: string }[];
}
```

Writes to `_app_index.json` still have the same race condition, but JSON merging is at least automatable (last-write-wins on a structured object vs. corrupting a Markdown table).

### Image Pipeline Ambiguity

The spec says "resized to 1200px max" before the OpenRouter call. Good. But it doesn't specify whether the *original* or the *resized* image goes to Drive. For nameplate photos, resolution matters — serial numbers and model numbers in the AI output need to be verifiable against the photo. 

**Recommendation:** Send resized (1200px max) to OpenRouter for extraction. Store original-resolution JPEG to Drive. These are two different blobs in memory — don't conflate them.

Also: `<input type="file" capture="environment">` on iOS returns JPEG in most configurations, but the spec should explicitly call `.convertToBlob('image/jpeg', 0.85)` on the canvas after resize to guarantee JPEG and control quality. HEIC will come through in some Safari versions and crash the base64 pipeline.

### OpenRouter JSON Extraction Failure Modes

The spec handles the obvious failure (JSON.parse throws) but not:

- **Schema mismatch**: OpenRouter returns valid JSON but with keys the Zod schema doesn't recognize. Zod's `.parse()` throws; `.safeParse()` returns the error. Use `safeParse` and gracefully populate what you can, flagging unmatched keys.
- **Partial extraction**: AI returns `{ brand: "Generac", model: null, serial_number: null }` because the nameplate is partially obscured. This is correct behavior — don't retry, show the form with partially filled fields and let the user complete.
- **Rate limiting from OpenRouter**: HTTP 429. The spec has no retry with backoff for AI calls. Add exponential backoff (3 retries, 1/2/4 second delays) before surfacing the error toast.

---

## 2. Auth Flow: PKCE, Token Refresh, Drive Scope

### The Refresh Token Exchange Is Correct But Described Wrong

The spec says "silent re-auth using stored refresh token via `prompt=none`." `prompt=none` is an authorization endpoint parameter — it's for re-authorization redirects, not token refresh. What you actually want (and what your implementation should do) is a **token endpoint call**:

```typescript
const refreshAccessToken = async (refreshToken: string): Promise<string> => {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    }),
  });
  const { access_token } = await response.json();
  return access_token;
};
```

Google's token endpoint is CORS-enabled, so this works from the browser. No redirect required. This is the correct path and it's actually simpler than what the spec implies.

### Token Refresh Race Condition

If three Drive calls fire simultaneously and the token has expired, all three will get 401s and all three will attempt to refresh. Google's token endpoint will serve all three refreshes, but you're making unnecessary network calls and may trigger Google's refresh token rotation (which invalidates the old refresh token). Fix with a shared Promise:

```typescript
class TokenManager {
  private refreshPromise: Promise<string> | null = null;

  async getValidToken(): Promise<string> {
    if (!this.isExpired()) return this.accessToken;
    if (this.refreshPromise) return this.refreshPromise;  // queue behind in-flight refresh
    
    this.refreshPromise = this.doRefresh()
      .finally(() => { this.refreshPromise = null; });
    return this.refreshPromise;
  }
}
```

### PKCE Verifier Cleanup

The spec stores `pkce_verifier` in localStorage during the redirect flow. After code exchange, this should be removed immediately. It's short-lived, but a PKCE verifier sitting in localStorage after auth is complete is dead weight that any localStorage inspection (e.g., from a browser extension) can read. One line: `localStorage.removeItem('pkce_verifier')` after the token exchange.

### Expo OAuth Is a Different World

The spec's April 11 decisions say "Expo, not Capacitor" for the native phase. Your current `GoogleAuth.ts` uses `window.location.href` for redirect and `URLSearchParams` on the redirect back. None of this works in Expo — React Native has no `window.location`. Expo uses `expo-auth-session` with a different redirect scheme (`exp://` or a custom URI scheme).

If Expo is the real Phase 7 plan, abstract the auth module behind an interface now:

```typescript
interface AuthProvider {
  initiateAuth(): Promise<void>;
  handleCallback(url: string): Promise<TokenSet>;
  refreshToken(token: string): Promise<string>;
}

class WebAuthProvider implements AuthProvider { /* current implementation */ }
class ExpoAuthProvider implements AuthProvider { /* future Expo implementation */ }
```

This costs you an hour in Phase 1 and saves you a painful refactor in Phase 7.

### iOS Safari ITP: Silent Storage Eviction Is the Auth Failure You Won't Expect

Safari's Intelligent Tracking Prevention (ITP) treats any site with cross-domain redirect activity — including OAuth flows — as a potential tracker. The implications for this app are non-obvious and will produce hard-to-diagnose symptoms.

**The 7-day storage eviction rule.** ITP caps the lifetime of site-origin storage (localStorage, IndexedDB, service worker caches, and HTTP cookies set via `document.cookie`) to 7 days of script-inactivity for classified sites. This isn't about inactivity in general — it's about script-level inactivity: the user must visit the page and have script execute. Opening a tab but leaving it in the background doesn't reset the clock.

The consequences for this app:

- **Refresh token eviction**: If you don't open the app for 7 days, Safari purges localStorage. The refresh token is gone. Silent re-auth fails with a 400 from Google's token endpoint. The app either breaks silently or shows an error that looks like a Drive API failure, not an auth failure. For a *seasonal* workflow (October winterization, April spring startup), a 7-day gap is the norm, not the exception.

- **IndexedDB queue eviction**: Same rule applies. Any offline-queued records that haven't synced yet (e.g., you captured records while offline and never opened the app again for a week) will be silently deleted before sync happens.

- **Service worker cache eviction**: Your stale-while-revalidate Drive cache is also subject to this. Less critical, but background-fetch registration can also be cleared.

**The home screen exception is the real mitigation.** PWAs installed to the iOS home screen via "Add to Home Screen" are granted first-party storage status and are explicitly exempt from ITP's 7-day eviction. This is Apple's stated policy. The distinction matters:

| Installation method | ITP eviction | Storage limit |
|---|---|---|
| Safari bookmark / in-browser | Yes, 7-day rule | ITP-limited |
| Added to Home Screen | No | Full first-party |

**Implication**: the app needs to aggressively push the "Add to Home Screen" prompt, framed as a prerequisite for reliable offline and persistent login — not just a "nice to have." Treat it like a permission gate:

```typescript
// On auth success, check if running in standalone mode
const isStandalone = window.matchMedia('(display-mode: standalone)').matches 
  || (window.navigator as any).standalone === true;

if (!isStandalone && /iPhone|iPad/.test(navigator.userAgent)) {
  // Show a hard-to-dismiss install prompt before continuing
  showIOSInstallPrompt();
}
```

**Graceful recovery when refresh token is gone.** The token refresh call should distinguish between "network failure" (retry) and "invalid_grant" (re-auth required). Google's token endpoint returns `{"error": "invalid_grant"}` in the body with HTTP 400 when the refresh token is expired or revoked:

```typescript
const refreshAccessToken = async (refreshToken: string): Promise<string | null> => {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    }),
  });

  if (!response.ok) {
    const err = await response.json();
    if (err.error === 'invalid_grant') {
      // ITP evicted our token, or user revoked access — re-auth required
      localStorage.removeItem('refresh_token');
      initiateFullPKCEFlow();  // don't surface as an error; just re-auth
      return null;
    }
    throw new Error(`Token refresh failed: ${err.error}`);  // network/server issue, retry
  }

  const { access_token } = await response.json();
  return access_token;
};
```

**ITP and the PKCE redirect itself.** ITP v2+ introduced "link decoration" protections that strip query parameters from cross-site navigations if the referring domain is classified as a tracker. Google's `accounts.google.com` is in ITP's "prevalent domain" classification. After the OAuth redirect, Safari may strip the `?code=...&state=...` query params from the redirect URI before your app's JavaScript can read them.

This is the most insidious failure: the PKCE callback runs, `URLSearchParams` shows an empty code param, the exchange fails, and the user is silently dropped at an auth error with no retry. Mitigations:

1. The `state` parameter in your PKCE flow doubles as CSRF protection. Also use it to trigger a short-lived retry check: if the callback receives no `code` param within 30 seconds, surface a "Try again" option rather than a hard error.
2. Consider using the [Authorization Code Flow via popup](https://developers.google.com/identity/oauth2/web/guides/use-code-model) instead of a redirect for Safari on iOS — popups are less affected by ITP's link decoration rules. The tradeoff is that popup-blockers and PWA standalone mode don't coexist well.
3. In practice, test this explicitly in Safari on iOS with a fresh profile. ITP behavior varies by Safari version (15, 16, 17, 18 all changed ITP rules), and breakage may only appear in conditions that are hard to reproduce in desktop Safari DevTools.

### Drive Scope Decision Is Correct

`drive` is the right scope for a personal single-user tool where checklist detection of prior uploads matters. The risk profile (XSS → token exfiltration → Drive access) is minimal for a GitHub Pages static app with no user-generated content. Document this decision and its rationale so it's clear if/when the threat model changes (multi-user, public URL).

---

## 3. Offline Strategy: IndexedDB Queue + Drive Sync

### Multipart Upload vs. Resumable for Photos

The spec uses multipart upload for all files. The Drive multipart upload endpoint has a **5MB limit**. A typical phone camera photo from the past 3 years is 4–12MB uncompressed. Resizing to 1200px yields roughly 300KB–1.5MB for a JPEG at 0.85 quality, which fits. But:

- The resize must happen *before* enqueuing to the offline queue, not at upload time
- If the resize step fails or isn't implemented, large photos will silently fail with a 400 from Drive

Verify that the resize-before-enqueue step is explicit in the `useOfflineQueue` hook, not left to the upload path.

For any file that *might* exceed 5MB (a PDF invoice, for example), use the resumable upload endpoint from the start:

```typescript
// Resumable upload for files > 5MB
const initiateResumableUpload = async (filename: string, mimeType: string, folderId: string) => {
  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'X-Upload-Content-Type': mimeType,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: filename, parents: [folderId] }),
    }
  );
  return response.headers.get('Location');  // resumable session URI
};
```

### Connectivity Flapping Is the Core Use Case

The primary user is standing in a barn in Orrville, Ohio on AT&T LTE. Connectivity will drop mid-upload. The retry strategy in `useOfflineQueue` needs to handle this gracefully:

- **Background sync** (Phase 7 with Expo) solves this properly, but the PWA doesn't have it
- **PWA Background Sync API** (`navigator.serviceWorker.ready.then(sw => sw.sync.register('offline-queue'))`) is supported in Chrome Android but not iOS Safari. For iOS, you're stuck with "retry when app is foregrounded"
- **Implement a `visibilitychange` listener** that triggers queue flush when the app comes back to foreground — this is your primary retry trigger in the PWA phase, not a polling interval

```typescript
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    offlineQueue.flush();  // flush on every foreground event
  }
});
```

Also register on `online` event: `window.addEventListener('online', () => offlineQueue.flush())`.

### The Stale Cache and Fresh Upload Coherence Problem

The spec has `_index.md` at stale-while-revalidate with 5-minute TTL. If you save a record, update the index, and then immediately view the checklist, the cached version of the index doesn't include your new record — the checklist shows the category as incomplete for up to 5 minutes. This is jarring UX.

**Fix:** After a successful Drive upload, explicitly invalidate the cached index in the service worker:

```typescript
// In DriveClient.ts, after successful index update:
const cache = await caches.open('drive-cache');
await cache.delete(indexCacheKey);
```

Or simpler: maintain a local in-memory overlay of recent writes and merge it with the cached index for checklist display.

### IndexedDB Quota Awareness

IDB quota on iOS Safari is notoriously limited (though it improved in iOS 15.2+). Storing multiple queued records with base64-encoded photos can hit quota on older devices or low-storage phones. Add quota estimation before enqueuing:

```typescript
const { quota, usage } = await navigator.storage.estimate();
const freeSpace = (quota ?? 0) - (usage ?? 0);
if (photoBlob.size * 1.4 > freeSpace * 0.5) {
  // warn user rather than silently failing
}
```

---

## 4. Home Assistant Integration

### Polling vs. WebSocket — Use WebSocket for Alert-Class Sensors

Polling every 5 minutes is appropriate for slowly-changing metrics (total runtime hours, propane level %). It is **not appropriate** for binary alert sensors (sump pump float, generator fault). A sump pump high-water alert that takes up to 5 minutes to appear isn't useful — you want it in seconds.

HA's WebSocket API supports entity subscriptions with push delivery. This is the right pattern for monitoring the specific sensors that trigger alerts:

```typescript
// Establish WebSocket to HA
const ws = new WebSocket(`ws://${haBaseUrl}/api/websocket`);

// Auth flow
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'auth_required') {
    ws.send(JSON.stringify({ type: 'auth', access_token: haToken }));
  }
  if (msg.type === 'auth_ok') {
    // Subscribe to alert-class entities only
    ws.send(JSON.stringify({
      id: 1,
      type: 'subscribe_trigger',
      trigger: {
        platform: 'state',
        entity_id: ['binary_sensor.sump_pump_high_water', 'binary_sensor.generator_fault'],
      },
    }));
  }
};
```

**Strategy:** WebSocket for alert-class sensors (binary, threshold breaches). REST poll at 5-minute intervals for dashboard display metrics (propane %, runtime hours, temperatures). This is both more responsive and less chatty than polling everything.

### HTTPS/HTTP Mixed Content Is a Hard Blocker

This is the issue most likely to derail Phase 6 development and you need to test it on day one of HA integration. The problem:

- GitHub Pages (or Netlify) serves your app over HTTPS
- Home Assistant on local network is typically HTTP (`http://homeassistant.local:8123`)
- Modern browsers block mixed content: an HTTPS page cannot make HTTP requests

This will manifest as a silent failure — the fetch call will be blocked by the browser with no useful error message (it's blocked at the network layer before your error handlers run).

**Solutions, in order of preference:**

1. **Nabu Casa remote access** ($7/mo): HA gets an HTTPS subdomain. Clean solution.
2. **Tailscale + HA certificate**: HA behind Tailscale with a Tailscale cert. Free.
3. **Local-only mode**: App detects it's on local network via a known hostname, offers to use HTTP — but browsers block this for HTTPS origins. Doesn't work.
4. **HA on LAN with self-signed cert + user trust**: Technically works, horrible UX.

Document this in the spec as a prerequisite for HA integration. The "just enter your HA URL" UX in Settings implies it's straightforward. It's not, and the fix has a cost decision embedded in it.

### Entity Mapping UX Will Be Painful

Asking users to manually enter `sensor.propane_tank_level` is the kind of UX that causes people to abandon features. HA entity IDs are not human-memorable. Fetch the entity list and present a searchable picker:

```typescript
// GET https://ha.local/api/states → returns all entities
// Filter to relevant domains (sensor, binary_sensor, switch)
// Group by entity domain for the picker
```

This one UX change is the difference between HA integration that gets used and one that doesn't. The API call is simple and the entity list is rarely more than a few hundred items.

### HA Integration Away From Home

The primary use case for this app is in the field. If "in the field" means standing at the barn, you're on local network and HA works fine. If it means standing at the camp 2 hours away, HA is unreachable (without Nabu Casa). The UI needs to handle HA unavailability gracefully — not an error state, just a "HA offline" indicator that replaces the live data panel. Last-known-good values should display with a timestamp.

```
┌─────────────────────────────────────┐
│  LIVE DATA  (last updated 3h ago)   │
│  ────────────────────────────────   │
│  Status:        ● Unknown (offline) │
│  Total runtime: 847 hrs (cached)    │
└─────────────────────────────────────┘
```

---

## 5. Multi-Property Scaling (2 → 5–10 Properties)

### The `DRIVE_FOLDER_MAP` Must Become Per-Property

Currently, `DRIVE_FOLDER_MAP` is a static global mapping `categoryId → Drive folder ID`. This works for one property. For multiple properties, it needs to be keyed by property:

```typescript
// Current (breaks at 2+ properties)
const DRIVE_FOLDER_MAP: Record<string, string> = { generator: '1f6cef...', ... };

// Required
type PropertyFolderMap = Record<string, Record<string, string>>;
const PROPERTY_FOLDER_MAPS: PropertyFolderMap = {
  tannerville: { generator: '1f6cef...', hvac: '1f7Fbe...', ... },
  camp:        { generator: 'auto-created-id', ... },
};
```

The auto-create pattern (Phase 1 decision) means camp folder IDs are dynamic and need to be persisted. These should live in IndexedDB as part of the property configuration, not hardcoded.

### Drive Folder Auto-Create Race Condition

On first use of a category, the app creates the Drive folder. If two records are queued offline for the same new category (e.g., two HVAC units at the camp, both captured before sync), both will attempt `files.create` for the HVAC folder. Drive creates two folders with identical names. This is a real failure mode.

**Fix:** Serialize folder creation behind a per-category lock. After creating a folder, write its ID back to IndexedDB's property config. Subsequent folder creation attempts for the same category check the config first:

```typescript
async function getOrCreateFolder(propertyId: string, categoryId: string): Promise<string> {
  const stored = await db.get(`folder:${propertyId}:${categoryId}`);
  if (stored) return stored;
  
  // Create in Drive
  const folderId = await driveClient.createFolder(categoryName, parentFolderId);
  await db.set(`folder:${propertyId}:${categoryId}`, folderId);
  return folderId;
}
```

### Knowledge Context Grows With Properties and Time

The AI advisory flow loads `_index.md` + `_summary.md` before every query. After 2 years of active use with 50+ service records per property:

- `_index.md` can realistically grow to 30–80KB
- At ~4 bytes/token, that's 7,500–20,000 tokens of context per query
- At 10 properties: potential 75,000–200,000 tokens just for indexes

Claude Opus 4.6 handles 200K context, so you won't hit a hard limit soon. But at Opus pricing, passing 50K tokens of context per advisory query adds up. At aggressive use (say, 10 advisory queries/day), you're spending meaningful money on context tokens.

**Mitigations:**

- The `buildPropertyContext()` function should accept a `queryType` hint and selectively load context. A question about the generator doesn't need the CAUV forestry records.
- Implement a `_summary.md` that is genuinely summary-level (1–2 pages max) and reserve `_index.md` for drill-down.
- For estate-level queries (across properties), have a top-level `_estate_summary.md` with high-level stats per property and only load per-property indexes on demand.

### Checklist Completion Detection at Scale

The spec's checklist works by querying Drive to see if files exist in each category folder. With `drive` scope, `files.list` queries work. But 22+ categories per property × 2+ properties = 44+ API calls just to render the checklist.

Drive's `files.list` supports a compound `q` parameter. You can fetch all categories in a few calls:

```typescript
// One query per property, gets all files in all known folders
const q = Object.values(folderMap)
  .map(id => `'${id}' in parents`)
  .join(' or ');
const response = await fetch(
  `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,parents)&pageSize=100`,
  { headers: { Authorization: `Bearer ${token}` } }
);
```

This reduces N folder-check requests to 1–2 requests regardless of category count.

### Offline Queue Should Be Property-Namespaced

All queued records share one IDB store. At 2 properties, fine. At 10, the retry logic and status display needs to filter by active property. Add `propertyId` as a first-class index on the queue store:

```typescript
// IDB schema
db.createObjectStore('offline_queue', { keyPath: 'id' });
db.createIndex('by_property', 'propertyId');
```

---

## 6. Missing Pieces and Underspecified Areas

### Capacitor vs. Expo — Resolve This Now

The spec is internally inconsistent:

- **April 11 decisions box:** "Native app phase → Expo, not Capacitor"
- **§8.2 header:** "Why Capacitor for Android (Not React Native)"
- **§15 Phase 7:** Lists Capacitor items

These are architecturally different choices with different implications for Phases 1–6:

| Decision | Impact on PWA Code |
|---|---|
| Capacitor | PWA code runs as-is in WebView. Web APIs work. No abstractions needed. |
| Expo | React Native runtime. `window`, `document`, `navigator.geolocation`, `FileReader`, `<input capture>` — all need to be replaced with RN/Expo equivalents. Auth flow changes. Camera API changes. |

If Expo is the real intent, the PWA phase should use **abstracted interfaces** for camera, file system, and auth from day one. If Capacitor, write native web code freely. Pick one and update the spec.

My recommendation: **Capacitor**. The single-codebase story is real and the camera quality difference (which was the stated motivation for Expo) is minor for nameplate photography. Expo means a partial rewrite of the capture flow, camera handling, and auth.

### Record Versioning and Edit History

There's no answer to: "I captured my generator record 6 months ago. The generator was replaced. How do I update it?"

Options:

1. **Append-only**: New capture creates a new file, old one stays. Checklist shows most recent. Good for service records, weird for equipment records (two "generator" files).
2. **Overwrite**: New capture overwrites the Drive file using the same filename. Loses history.
3. **Drive versioning**: Use `supportsAllDrives: true` and Drive's built-in version history. The app always writes to the same named file; Drive keeps versions. This is the cleanest solution and requires no additional schema work.

Recommend option 3: define a canonical filename per equipment record (e.g., `generator_primary.md`, not `generator_2026-04-12_0934.md`) and let Drive version history handle the history. This also makes the checklist simpler — one file per category per property, not N timestamped files.

This is a significant naming convention decision that affects existing file naming conventions in the spec and will be hard to change later.

### Maintenance Task and Capital Item Persistence

The `MaintenanceTask` and `CapitalItem` types are well-defined in the TypeScript model but their Drive persistence is not specified. The spec mentions `_index.md` has maintenance and capital sections, but:

- How are tasks updated when marked complete?
- How are recurring tasks regenerated after completion?
- Where is the user's edited capital plan stored durably?

If these live only in IndexedDB, they're device-local — switching devices loses all maintenance state. If they live in Drive, every "mark complete" tap triggers a Drive write-read-modify-write.

**Recommended approach:** Persist the full task and capital arrays in `_app_index.json` (the structured JSON index). On startup, load from IDB cache with a background sync to Drive. Writes go to IDB immediately and queue to Drive. This gives you responsive UI with eventual Drive consistency.

### The `_index.md` vs. `_app_index.json` Duality

The folder structure spec lists both:
- `_app_index.json` — machine-readable index of all records
- `_index.md` — AI-readable index

The spec defines `_index.md` format in detail but `_app_index.json` has no schema. The relationship between them isn't specified. Treat this as a single source of truth question:

**Recommendation:** `_app_index.json` is the canonical app-writable source. The app reads and writes this. `_index.md` is generated from `_app_index.json` and is read-only from the app's perspective (AI reads it, humans read it, but the app never parses it). This makes the app's write path simpler and the human-readable file always consistent with actual data.

### Contractor/Contact Persistence Is Unspecified

`Contractor` objects are defined in the type model but there's no Drive file or folder for them. They'll default to IndexedDB-only, making them device-local and not visible in the AI context (since AI only loads Drive content). Given that "who serviced my generator?" is a stated feature, contractors need to be in Drive.

**Recommendation:** Add a `_contacts.json` or `contractors.md` file to each property root folder. Include contractors in the AI context assembly for relevant queries.

### Schema Migration Strategy Is Absent

The data model evolves across 7 phases. `EquipmentRecord` in Phase 1 doesn't have `recordType`, `attachmentFilenames`, `aiExtracted`, or `tags`. Records created in Phase 1 and stored in IDB will fail Zod `.parse()` in Phase 3 when those fields are added as required.

Add a `schemaVersion` field to every persisted type and implement an upgrade path:

```typescript
interface VersionedRecord {
  schemaVersion: number;  // increment on every breaking change
  // ... rest of fields
}

const CURRENT_SCHEMA_VERSION = 1;

function migrateRecord(raw: unknown): EquipmentRecord {
  const version = (raw as any).schemaVersion ?? 0;
  if (version === 0) {
    // Phase 1 → Phase 2 migration
    return { ...raw, recordType: 'equipment', attachmentFilenames: [], aiExtracted: false, schemaVersion: 1 };
  }
  return raw as EquipmentRecord;
}
```

This is one of those things that's trivial to add in Phase 1 and painful to retrofit in Phase 4.

### PWA Push Notifications Are Unreliable on iOS

The seasonal checklist workflow depends on October/April push notifications reaching iOS users. iOS PWA push requires:

- iOS 16.4+
- PWA installed to home screen (not just bookmarked)
- User granted push permission

Even with all three, iOS Safari push is less reliable than Android Chrome push. For a reminder that matters once a year (October winterization), consider belt-and-suspenders: PWA push notification **and** a reminder set in the OS calendar. The app could offer "Add to Calendar" when the seasonal workflow is set up:

```
[Set Up Winterization Reminder]
→ Creates a calendar event (opens ics URL or uses Calendar API)
→ OR registers PWA push notification
```

### OpenRouter API Key in Browser — The Multi-User Problem Deferred Too Long

The spec acknowledges the single-user API key problem and defers it. But the Cloudflare Worker proxy is 20 minutes of work and zero ongoing cost. If there's any chance Kelly uses this app on her own phone, build the proxy in Phase 2, not Phase 7.

The proxy is minimal:

```typescript
// Cloudflare Worker
export default {
  async fetch(request: Request): Promise<Response> {
    // Verify request is from your Google account (check Drive token in header)
    const authHeader = request.headers.get('X-Google-Token');
    const verified = await verifyGoogleToken(authHeader);
    if (!verified) return new Response('Unauthorized', { status: 401 });
    
    // Forward to OpenRouter with server-side API key
    return fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: request.body,
    });
  }
};
```

This keeps the OpenRouter key server-side (even a "server" that's just a Cloudflare Worker free tier) and allows multiple Google accounts to use the app if you verify their Drive token. The spec's recommended approach (Option A — share the key) leaks the key to any device it's entered on, forever.

---

## Priority Matrix

| Issue | Impact | Effort | Phase |
|---|---|---|---|
| Per-file upload tracking in offline queue | High — data loss risk | Low | 1 |
| Token refresh race condition (Promise mutex) | Medium — occasional failure | Low | 1 |
| `_app_index.json` as canonical index | High — prevents index corruption | Medium | 1 |
| Auth interface abstraction (Expo/web) | High — Phase 7 rework cost | Low | 1 |
| Resolve Capacitor vs. Expo | High — affects all phases | Zero (decision only) | Before Phase 1 |
| Schema migration / `schemaVersion` field | Medium — data integrity | Low | 1 |
| Contractor persistence in Drive | Medium — AI context gap | Low | 2–3 |
| HA mixed content blocker (HTTPS) | High — feature may not work at all | External (Nabu Casa decision) | Before Phase 6 |
| HA WebSocket for alert sensors | Medium — UX quality | Medium | 6 |
| HA entity picker from API | Medium — adoption rate | Low | 6 |
| Drive folder map per-property | High — multi-property breaks otherwise | Low | 4 |
| Folder auto-create race condition | Low — edge case | Low | 4 |
| Checklist batch folder query | Low — performance | Low | 4 |
| Record edit/versioning strategy | Medium — usability | Medium (convention change) | Before Phase 1 |
| Offline queue visibility change trigger | High — primary retry mechanism | Low | 3 |
| Cloudflare Worker proxy for API key | Medium — security + multi-user | Low | 2 |

---

## What to Decide Before Writing Phase 1 Code

1. **Capacitor or Expo?** Affects whether you abstract the camera/auth/file APIs.
2. **Canonical filename convention for equipment records**: timestamped (append-only) vs. named (versioned). This determines file naming across the whole system.
3. **`_app_index.json` schema**: Define it explicitly now. It's the backbone of the knowledge layer and the maintenance/capital data.
4. **`schemaVersion` in all persisted types**: One field, trivial to add, painful to retrofit.
5. **Cloudflare Worker proxy**: 20 minutes of work that eliminates the "Kelly uses her phone" problem forever.

The spec is in excellent shape for a personal tool. The issues above are the ones that will cause rework if deferred — not theoretical concerns.

---

*Review generated from `property-capture-tool-spec.md` and `property-manager-full-spec.md` as of April 2026.*

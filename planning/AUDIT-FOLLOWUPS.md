# Audit Follow-ups

Items deferred from the April 2026 audit work that landed priorities 1–8
(see commits `f7c7674`, `3a6a16e`, `2df5170`). Scope here is intentionally
narrow — things we know we punted on rather than a fresh audit pass.

---

## 1. Offline retry for failed photo uploads

**Status:** TODO — tracked inline in `src/screens/MaintenanceScreen.tsx`
inside `DoneModal.handleConfirm()`.

**Context.** When a user marks a maintenance task complete with photos
attached, we upload each photo to Drive via `uploadPhotoBlob()` and
persist only `{driveFileId, mimeType}` in the `CompletedEvent` record.
If that upload fails (offline, 401, Drive 5xx), the current fallback is
to keep the photo's base-64 `localDataUrl` inline on the record so the
photo isn't lost. That works, but it re-introduces the exact localStorage
bloat problem we were fixing — the record stays that way forever unless
the user re-triggers something.

**What needs to happen.**

1. On upload failure, enqueue the photo blob into `offlineQueue.ts` with
   a new item type (`'photo'`) so `retryAll()` picks it up when the
   network returns. Queue items need to carry: photo id, the owning
   record id (to patch back), the Blob, and the mime type.
2. On successful retry, update the `CompletedEvent` record in-place:
   remove `localDataUrl`, set `driveFileId` + `mimeType`, re-sync the
   record through `costStore` so Drive gets the new JSON.
3. Verify the existing exponential-backoff in `offlineQueue.retryAll()`
   handles the new photo item type correctly — it's keyed by the
   `QueuedUpload` shape right now, which only has text content.
4. Ideally add a UI affordance on `SyncScreen` showing "N photos waiting
   to upload" so the user can see the backlog.

**Why it's not critical.** Photos still display (via `PhotoThumb` on
`localDataUrl`) and don't break the app. It's just a slow leak of
localStorage space until network connectivity returns and the user
happens to re-open the event (which currently has no path to retry).

**Pointer.** The TODO marker is at the `!token` branch inside
`handleConfirm`, near the `uploadedPhotos.push(p)` fallback.

---

## 2. Backfill migration for pre-existing base-64 photos

**Status:** TODO — no code written.

**Context.** The photo-upload change ([2df5170](../README.md) — see
git log) only affects *new* photos attached after the change landed.
Any `CompletedEvent` records already in localStorage or Drive with
inline `localDataUrl` base-64 strings stay that way. Users who have
been using the app for a while will have legacy records that still
bloat their storage.

**What needs to happen.**

1. One-shot background migration on app startup (guarded by
   `localStorage.getItem('pm_photos_migrated_v1')` so it runs once):
   - Scan `costStore.getAll()` for records whose `photos[]` contain an
     entry with `localDataUrl` but no `driveFileId`.
   - For each, call `dataUrlToBlob` → `uploadPhotoBlob`, replace the
     photo entry with `{driveFileId, mimeType}`, and persist via
     `costStore.update()` so the record re-syncs to Drive.
   - Rate-limit to e.g. 5 concurrent uploads so a user with dozens of
     legacy photos doesn't stall the app.
2. On completion (or permanent failure after N retries), set the
   `pm_photos_migrated_v1` marker so we don't re-run.
3. Expose a manual trigger on `SyncScreen` — "Migrate N legacy photos
   to Drive" — so users who happen to be offline at startup can kick it
   off on demand.

**Why it's not critical.** Legacy photos still render via `PhotoThumb`'s
`localDataUrl` branch. The cost is localStorage bloat, which is only
visible as the storage-full error when it gets bad. A targeted migration
is cleaner than waiting for someone to hit the ceiling.

**Dependencies.** Item 1 above (offline retry queue) — the migration
should route through the same queue so a partial run can resume
naturally rather than re-uploading things it already did.

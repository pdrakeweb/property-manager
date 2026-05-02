import { useEffect, useState } from 'react'
import { localIndex } from '../lib/localIndex'
import type { IndexRecord } from '../lib/localIndex'
import { syncBus } from '../lib/syncBus'
import { getValidToken } from '../auth/oauth'
import { pullSingleRecord } from '../lib/syncEngine'

interface UseRecordSyncResult {
  /** Current local record (updates live when remote sync lands). */
  record: IndexRecord | null
  /** True when a background fetch for this record is in flight. */
  isSyncing: boolean
  /** True if this hook instance has triggered a pull at least once. */
  hasFetched: boolean
}

/**
 * Per-record "pull on open" with live updates.
 *
 * On mount (and whenever `id` changes), kicks off a background fetch of the
 * record's Drive file. The component re-renders with the local record
 * immediately — we do not block the UI. When the fetch lands, the local index
 * is updated and the hook re-reads, providing live merged data.
 *
 * Cross-tab updates (another tab wrote this record, or a change-token poll
 * pulled it) also trigger a re-read via the sync bus.
 *
 * The dirty-field preservation policy lives in the syncEngine: remote pulls
 * only replace fields that were not locally modified since the last sync
 * (handled by the conflict/overlap logic in resolveConflict). At the hook
 * layer we simply expose the latest index state — screens that keep their own
 * draft state should merge remote changes for untouched fields only (see
 * EquipmentDetailScreen for the pattern).
 */
export function useRecordSync(id: string | undefined): UseRecordSyncResult {
  const [record,    setRecord]    = useState<IndexRecord | null>(() => id ? localIndex.getById(id) : null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [hasFetched, setHasFetched] = useState(false)

  useEffect(() => {
    if (!id) { setRecord(null); return }

    // Seed from local immediately — no UI delay
    setRecord(localIndex.getById(id))

    // Subscribe first so we catch updates that race with the pull kickoff
    const unsub = syncBus.subscribe(ev => {
      if (ev.type === 'index-updated' && ev.recordIds.includes(id)) {
        setRecord(localIndex.getById(id))
      } else if (ev.type === 'sync-start' && ev.scope === 'record' && ev.recordId === id) {
        setIsSyncing(true)
      } else if (ev.type === 'sync-end' && ev.scope === 'record' && ev.recordId === id) {
        setIsSyncing(false)
        setHasFetched(true)
      }
    })

    // Kick off background fetch — deliberately unawaited
    ;(async () => {
      try {
        const token = await getValidToken()
        if (!token) { setHasFetched(true); return }
        await pullSingleRecord(token, id)
      } catch {
        // Non-fatal — local record already shown
      }
    })()

    return () => { unsub(); setIsSyncing(false) }
  }, [id])

  return { record, isSyncing, hasFetched }
}

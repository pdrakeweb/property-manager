// Event bus for sync activity. Dual-purpose:
//   1. In-tab pub/sub so screens can react to background index updates.
//   2. Cross-tab BroadcastChannel so a write in one tab refreshes others.
//
// Any code that mutates the local index should call emit() with the appropriate
// event. Subscribers use subscribe(type, handler).

export type SyncEvent =
  | { type: 'sync-start'; scope: 'full' | 'delta' | 'record'; recordId?: string }
  | { type: 'sync-end';   scope: 'full' | 'delta' | 'record'; recordId?: string; error?: string }
  | { type: 'index-updated'; recordIds: string[]; source: 'local' | 'remote' | 'cross-tab' }

type Handler = (ev: SyncEvent) => void

const handlers = new Set<Handler>()
let channel: BroadcastChannel | null = null
let tabId = ''

function initChannel(): void {
  if (channel || typeof BroadcastChannel === 'undefined') return
  channel = new BroadcastChannel('pm-sync-bus')
  tabId = Math.random().toString(36).slice(2)
  channel.onmessage = (msg) => {
    const data = msg.data as { ev: SyncEvent; from: string } | null
    if (!data || data.from === tabId) return
    // Cross-tab index updates are relabeled so subscribers know they came from
    // another tab (which means localStorage is already fresh — just re-read).
    if (data.ev.type === 'index-updated') {
      notifyLocal({ ...data.ev, source: 'cross-tab' })
    } else {
      notifyLocal(data.ev)
    }
  }
}

function notifyLocal(ev: SyncEvent): void {
  for (const h of handlers) {
    try { h(ev) } catch { /* swallow to keep bus resilient */ }
  }
}

export const syncBus = {

  /** Fire an event: notify in-tab subscribers + broadcast to other tabs. */
  emit(ev: SyncEvent): void {
    initChannel()
    notifyLocal(ev)
    try { channel?.postMessage({ ev, from: tabId }) } catch { /* channel closed */ }
  },

  /** Subscribe to all bus events. Returns an unsubscribe function. */
  subscribe(handler: Handler): () => void {
    initChannel()
    handlers.add(handler)
    return () => handlers.delete(handler)
  },
}

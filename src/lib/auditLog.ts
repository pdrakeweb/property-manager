export type LogLevel = 'info' | 'warn' | 'error'

export interface LogEntry {
  id: string
  ts: string
  level: LogLevel
  action: string
  message: string
  propertyId?: string
}

const STORAGE_KEY    = 'pm_audit_log_v1'
const MAX_ENTRIES    = 500
const MAX_MSG_LEN    = 200
const DRIVE_ID_KEY   = 'pm_audit_log_drive_id'

function load(): LogEntry[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
  } catch {
    return []
  }
}

function save(entries: LogEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
}

function append(level: LogLevel, action: string, message: string, propertyId?: string): void {
  const truncated = message.length > MAX_MSG_LEN ? message.slice(0, MAX_MSG_LEN) + '…' : message
  const entry: LogEntry = {
    id:      `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    ts:      new Date().toISOString(),
    level,
    action,
    message: truncated,
    ...(propertyId ? { propertyId } : {}),
  }
  const entries = load()
  entries.push(entry)
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES)
  save(entries)
}

export const auditLog = {
  info:  (action: string, message: string, propertyId?: string) => append('info',  action, message, propertyId),
  warn:  (action: string, message: string, propertyId?: string) => append('warn',  action, message, propertyId),
  error: (action: string, message: string, propertyId?: string) => append('error', action, message, propertyId),

  getAll():    LogEntry[] { return load() },
  getRecent(n = 100): LogEntry[] { return load().slice(-n).reverse() },
  clear():     void { save([]) },

  /** Merge remote entries with local — dedup by id, keep newest MAX_ENTRIES. */
  merge(remote: LogEntry[]): void {
    const local = load()
    const byId  = new Map(local.map(e => [e.id, e]))
    for (const e of remote) byId.set(e.id, e)
    const merged = [...byId.values()].sort((a, b) => a.ts.localeCompare(b.ts))
    if (merged.length > MAX_ENTRIES) merged.splice(0, merged.length - MAX_ENTRIES)
    save(merged)
  },

  getDriveFileId():      string | null { return localStorage.getItem(DRIVE_ID_KEY) },
  setDriveFileId(id: string): void     { localStorage.setItem(DRIVE_ID_KEY, id) },
}

import { useState, useEffect, useMemo } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  Camera, Settings, ChevronDown, ChevronRight,
  Building2, TreePine,
  RefreshCw, AlertTriangle, X,
  Sun, Moon, Monitor, DollarSign, HardHat, BookOpen,
} from 'lucide-react'
import { cn } from '../../utils/cn'
import { useAppStore } from '../../store/AppStoreContext'
import { useProperties } from '../../lib/propertyStore'
import { localIndex } from '../../lib/localIndex'
import type { IndexRecord, SyncStats } from '../../lib/localIndex'
import { resolveConflictField, resolveAllConflictFields } from '../../vault'
import { syncBus } from '../../lib/syncBus'
import { isDev } from '../../auth/oauth'
import { useActiveAlerts } from '../../lib/haAlerts'
import { useModalA11y } from '../../lib/focusTrap'
import { useTheme } from '../../contexts/ThemeContext'
import { BackgroundSyncIndicator } from '../BackgroundSyncIndicator'
import {
  getQueueCount, getFailedCount, getFailedItems, resetItem, resetFailedItems,
} from '../../lib/offlineQueue'
import type { QueuedUpload } from '../../lib/offlineQueue'
import { getTotalInboxQueueCount, INBOX_QUEUE_CHANGED_EVENT } from '../../lib/inboxPoller'
import { moduleRegistry, useActiveModuleIds, type NavGroup, type NavItem as ModuleNavItem } from '../../modules/_registry'

/**
 * AppShell nav row. Module-driven entries plug their own NavItem (label,
 * path, icon, optional badge hook); the static "Capture" tile is the one
 * non-module top entry — its screen is the modal-style capture-source
 * picker that lives outside the module surface.
 */
type ShellNavItem = {
  to: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  /** Optional badge hook contributed by the owning module. */
  useBadge?: () => number | undefined
}
type ShellNavSection = { label: string; icon: React.ComponentType<{ className?: string }>; items: ShellNavItem[] }

/** Hardcoded top-rail items not owned by any module (Capture-source picker). */
const STATIC_TOP_NAV: ShellNavItem[] = [
  { to: '/capture', icon: Camera, label: 'Capture' },
]

/**
 * Build the sidebar layout from the active module set. The grouping
 * semantics live in `NavGroup` (see registry/types.ts):
 *   - 'property' → flat top rail (Dashboard, Maintenance, …)
 *   - 'tools'    → "Tools" collapsible section
 *   - 'finance'  → "Financial" collapsible section
 *   - 'systems'  → "Systems" collapsible section
 *   - 'admin'    → not rendered here; the bottom-rail Settings link is
 *                  hard-wired since it must stay reachable even with the
 *                  core module disabled in development.
 */
function useShellNav(): { topNav: ShellNavItem[]; sections: ShellNavSection[]; flat: ShellNavItem[] } {
  const activeIds = useActiveModuleIds()
  return useMemo(() => {
    const byGroup: Record<NavGroup, ShellNavItem[]> = {
      property: [],
      tools:    [],
      finance:  [],
      systems:  [],
      admin:    [],
    }
    for (const mod of moduleRegistry.getAll()) {
      if (!activeIds.has(mod.id)) continue
      for (const item of (mod.navItems ?? []) as ModuleNavItem[]) {
        byGroup[item.group].push({
          to:       item.path,
          icon:     item.icon,
          label:    item.label,
          useBadge: item.useBadge,
        })
      }
    }
    const topNav: ShellNavItem[] = [...STATIC_TOP_NAV, ...byGroup.property]
    const sections: ShellNavSection[] = [
      { label: 'Tools',     icon: BookOpen,    items: byGroup.tools   },
      { label: 'Financial', icon: DollarSign,  items: byGroup.finance },
      { label: 'Systems',   icon: HardHat,     items: byGroup.systems },
    ].filter(s => s.items.length > 0)
    const flat = [...topNav, ...sections.flatMap(s => s.items)]
    return { topNav, sections, flat }
  }, [activeIds])
}

const PROPERTY_ICONS = { residence: Building2, camp: TreePine, land: Building2 }

/**
 * Top-rail nav row. Calls the module-supplied `useBadge` hook if any
 * (rules-of-hooks safe because the hook identity is stable per active
 * set — modules don't get mounted/unmounted between renders during a
 * single navigation), and folds in the cross-cutting inbox / alert badges
 * AppShell already manages.
 */
function TopNavLink({
  item, inboxCount, alertCount,
}: {
  item: ShellNavItem
  inboxCount: number
  alertCount: number
}) {
  const moduleBadge = item.useBadge?.() ?? 0
  const Icon = item.icon
  const inboxBadge = item.to === '/import' && inboxCount > 0 ? inboxCount : 0
  const alertBadge = item.to === '/'        && alertCount > 0 ? alertCount : 0
  // First non-zero wins; modules never overlap with the cross-cutting badges
  // today, but if they do the module's value takes precedence (it's the
  // route owner's choice).
  const badge = moduleBadge > 0 ? moduleBadge : (inboxBadge || alertBadge)
  const badgeLabel =
    moduleBadge > 0 ? `${moduleBadge} pending`
    : inboxBadge   > 0 ? `${inboxBadge} pending inbox item${inboxBadge === 1 ? '' : 's'}`
    : alertBadge   > 0 ? `${alertBadge} HA alerts`
    : undefined

  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) => cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
        isActive
          ? 'bg-green-600 text-white'
          : 'text-slate-300 hover:bg-slate-700 hover:text-white',
      )}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="flex-1">{item.label}</span>
      {badge > 0 && (
        <span
          aria-label={badgeLabel}
          className="bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center"
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </NavLink>
  )
}

function NavSectionGroup({ section, pathname }: { section: ShellNavSection; pathname: string }) {
  const hasActiveChild = section.items.some(item =>
    item.to === '/' ? pathname === '/' : pathname.startsWith(item.to)
  )
  const [open, setOpen] = useState(hasActiveChild)
  const SectionIcon = section.icon

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'flex items-center gap-3 w-full px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors',
          hasActiveChild
            ? 'text-green-400'
            : 'text-slate-500 hover:text-slate-300',
        )}
      >
        <SectionIcon className="w-3.5 h-3.5 shrink-0" />
        <span className="flex-1 text-left">{section.label}</span>
        <ChevronRight className={cn('w-3.5 h-3.5 transition-transform', open && 'rotate-90')} />
      </button>
      {open && (
        <div className="mt-0.5 space-y-0.5">
          {section.items.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => cn(
                'flex items-center gap-3 pl-6 pr-3 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-green-600 text-white'
                  : 'text-slate-300 hover:bg-slate-700 hover:text-white',
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Live count of items waiting in any property's inbox queue. Re-reads when
 * the poller fires `pm-inbox-queue-changed` and on storage events from
 * other tabs so the badge stays in sync without polling.
 */
function useInboxBadgeCount(): number {
  const [count, setCount] = useState(() => getTotalInboxQueueCount())
  useEffect(() => {
    const refresh = () => setCount(getTotalInboxQueueCount())
    window.addEventListener(INBOX_QUEUE_CHANGED_EVENT, refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener(INBOX_QUEUE_CHANGED_EVENT, refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])
  return count
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  return (
    <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1">
      {([
        { id: 'light',  icon: Sun     },
        { id: 'dark',   icon: Moon    },
        { id: 'system', icon: Monitor },
      ] as const).map(({ id, icon: Icon }) => (
        <button
          key={id}
          onClick={() => setTheme(id)}
          title={id.charAt(0).toUpperCase() + id.slice(1)}
          className={cn(
            'flex items-center justify-center w-7 h-7 rounded-md transition-colors',
            theme === id ? 'bg-green-600 text-white' : 'text-slate-400 hover:text-slate-200',
          )}
        >
          <Icon className="w-3.5 h-3.5" />
        </button>
      ))}
    </div>
  )
}

function PropertySwitcher() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { activePropertyId, setActivePropertyId } = useAppStore()
  const properties = useProperties()
  const active = properties.find(p => p.id === activePropertyId) ?? properties[0]
  if (!active) return null
  const Icon = PROPERTY_ICONS[active.type]

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left hover:bg-slate-700 transition-colors"
      >
        <Icon className="w-4 h-4 text-green-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-white truncate">{active.shortName}</div>
          <div className="text-xs text-slate-400 dark:text-slate-500 truncate">{active.address}</div>
        </div>
        <ChevronDown className={cn('w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50 overflow-hidden">
          {properties.map(p => {
            const PIcon = PROPERTY_ICONS[p.type]
            return (
              <button
                key={p.id}
                onClick={() => { setActivePropertyId(p.id); setOpen(false) }}
                className={cn(
                  'flex items-center gap-3 w-full px-3 py-2.5 text-left hover:bg-slate-700 transition-colors',
                  p.id === activePropertyId && 'bg-slate-700',
                )}
              >
                <PIcon className="w-4 h-4 text-green-400 shrink-0" />
                <div>
                  <div className="text-sm font-medium text-white">{p.name}</div>
                  <div className="text-xs text-slate-400 dark:text-slate-500">{p.stats?.documented ?? 0}/{p.stats?.total ?? 0} documented</div>
                </div>
              </button>
            )
          })}
          <div className="border-t border-slate-600 px-3 py-2">
            <button
              onClick={() => { setOpen(false); navigate('/settings') }}
              className="text-xs text-green-400 hover:text-green-300 transition-colors"
            >
              + Add property
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function MobilePropertySwitcher() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const { activePropertyId, setActivePropertyId } = useAppStore()
  const properties = useProperties()
  const active = properties.find(p => p.id === activePropertyId) ?? properties[0]
  if (!active) return null
  const Icon = PROPERTY_ICONS[active.type]

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg px-2.5 py-1.5"
      >
        <Icon className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{active.shortName}</span>
        <ChevronDown className={cn('w-3.5 h-3.5 text-slate-500 dark:text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden">
            {properties.map(p => {
              const PIcon = PROPERTY_ICONS[p.type]
              return (
                <button
                  key={p.id}
                  onClick={() => { setActivePropertyId(p.id); setOpen(false) }}
                  className={cn(
                    'flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50',
                    p.id === activePropertyId && 'bg-green-50 dark:bg-green-900/20',
                  )}
                >
                  <PIcon className="w-4 h-4 text-green-600 dark:text-green-400" />
                  <div>
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">{p.name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{p.stats?.documented ?? 0}/{p.stats?.total ?? 0} documented</div>
                  </div>
                </button>
              )
            })}
            <div className="border-t border-slate-200 dark:border-slate-700 px-4 py-2.5">
              <button
                onClick={() => { setOpen(false); navigate('/settings') }}
                className="text-xs font-medium text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300"
              >
                + Add property
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function FailedItemsModal({
  items, onClose, onChange,
}: {
  items: QueuedUpload[]
  onClose: () => void
  onChange: () => void
}) {
  const dialogRef = useModalA11y<HTMLDivElement>(onClose)

  function retryOne(id: string) {
    resetItem(id)
    onChange()
  }
  function retryAllFailed() {
    resetFailedItems()
    onChange()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 p-0 sm:p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="failed-uploads-title"
        className="bg-white dark:bg-slate-800 w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[85vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <h2 id="failed-uploads-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {items.length} failed upload{items.length !== 1 ? 's' : ''}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            These items reached the retry limit. Reset to retry on the next sync.
          </p>
          {items.length > 1 && (
            <button
              onClick={retryAllFailed}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 shrink-0"
            >
              <RefreshCw className="w-3 h-3" />
              Retry all
            </button>
          )}
        </div>

        <div className="overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700">
          {items.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400 text-center">
              No failed uploads.
            </p>
          ) : items.map(item => (
            <div key={item.id} className="px-4 py-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                  {item.filename || '(untitled)'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {item.categoryId} · {item.retryCount} attempt{item.retryCount !== 1 ? 's' : ''}
                  {item.lastAttemptAt > 0 && ` · last ${new Date(item.lastAttemptAt).toLocaleString()}`}
                </p>
              </div>
              <button
                onClick={() => retryOne(item.id)}
                className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 shrink-0"
              >
                <RefreshCw className="w-3 h-3" />
                Retry
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function ConflictsModal({
  conflicts, onClose, onChange,
}: {
  conflicts: IndexRecord[]
  onClose: () => void
  onChange: () => void
}) {
  const dialogRef = useModalA11y<HTMLDivElement>(onClose)

  function pickField(record: IndexRecord, fieldPath: string, side: 'mine' | 'theirs') {
    // resolveConflictField returns the structurally-identical vault IndexRecord;
    // the host façade narrows `type` to IndexRecordType — safe to cast since the
    // value came out of the index in the first place.
    const next = resolveConflictField(record, fieldPath, side) as unknown as IndexRecord
    localIndex.upsert(next)
    onChange()
  }

  function pickAll(record: IndexRecord, side: 'mine' | 'theirs') {
    const next = resolveAllConflictFields(record, side) as unknown as IndexRecord
    localIndex.upsert(next)
    onChange()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 p-0 sm:p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="conflicts-title"
        className="bg-white dark:bg-slate-800 w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[85vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <h2 id="conflicts-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {conflicts.length} sync conflict{conflicts.length !== 1 ? 's' : ''}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Two devices edited the same record at the same time. Pick which value to keep for each field — your choice will sync to all devices on the next push.
          </p>
        </div>

        <div className="overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700">
          {conflicts.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500 dark:text-slate-400 text-center">
              All conflicts resolved.
            </p>
          ) : conflicts.map(record => {
            const fields = record.conflictFields ?? []
            return (
              <div key={record.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                      {record.title || `(untitled ${record.type})`}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {record.type} · {fields.length} conflicting field{fields.length !== 1 ? 's' : ''}
                      {record.conflictReason ? ` · ${record.conflictReason}` : ''}
                    </p>
                  </div>
                  {fields.length > 1 && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => pickAll(record, 'mine')}
                        className="text-xs font-semibold px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600"
                      >
                        Keep all mine
                      </button>
                      <button
                        onClick={() => pickAll(record, 'theirs')}
                        className="text-xs font-semibold px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600"
                      >
                        Keep all theirs
                      </button>
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  {fields.map(f => (
                    <div key={f.path} className="grid grid-cols-[7rem_1fr_auto] sm:grid-cols-[8rem_1fr_1fr_auto] gap-2 items-center text-xs">
                      <code className="font-mono text-slate-600 dark:text-slate-300 truncate">{f.path}</code>
                      <div className="min-w-0">
                        <span className="text-slate-400 dark:text-slate-500 mr-1">mine:</span>
                        <span className="text-slate-800 dark:text-slate-200 break-words">{formatConflictValue(f.local)}</span>
                      </div>
                      <div className="min-w-0 hidden sm:block">
                        <span className="text-slate-400 dark:text-slate-500 mr-1">theirs:</span>
                        <span className="text-slate-800 dark:text-slate-200 break-words">{formatConflictValue(f.remote)}</span>
                      </div>
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => pickField(record, f.path, 'mine')}
                          className="text-xs font-semibold px-2 py-1 rounded-md bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40"
                        >
                          Mine
                        </button>
                        <button
                          onClick={() => pickField(record, f.path, 'theirs')}
                          className="text-xs font-semibold px-2 py-1 rounded-md bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 hover:bg-sky-100 dark:hover:bg-sky-900/40"
                          title={f.remoteDeviceId ? `Authored on ${f.remoteDeviceId.slice(0, 8)}` : undefined}
                        >
                          Theirs
                        </button>
                      </div>
                      {/* Stacked "theirs" row on mobile (sm: hides this) */}
                      <div className="col-span-3 sm:hidden -mt-1 ml-[7rem] min-w-0">
                        <span className="text-slate-400 dark:text-slate-500 mr-1">theirs:</span>
                        <span className="text-slate-800 dark:text-slate-200 break-words">{formatConflictValue(f.remote)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** Render an unknown JSON value compactly for the conflict diff cells. */
function formatConflictValue(v: unknown): string {
  if (v === undefined) return '(empty)'
  if (v === null) return '(null)'
  if (typeof v === 'string') return v.length > 100 ? v.slice(0, 97) + '…' : v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try { return JSON.stringify(v).slice(0, 100) } catch { return String(v) }
}

function SyncPill() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<SyncStats>(() => localIndex.getSyncStats())
  const [queueTotal, setQueueTotal]   = useState<number>(() => getQueueCount())
  const [failedCount, setFailedCount] = useState<number>(() => getFailedCount())
  const [failedItems, setFailedItems] = useState<QueuedUpload[]>([])
  const [showFailed,  setShowFailed]  = useState(false)
  const [showConflicts, setShowConflicts] = useState(false)
  const [conflicts, setConflicts] = useState<IndexRecord[]>([])
  const devMode = isDev()

  useEffect(() => {
    const refresh = () => {
      setStats(localIndex.getSyncStats())
      setQueueTotal(getQueueCount())
      setFailedCount(getFailedCount())
    }
    const id = setInterval(refresh, 30_000)
    window.addEventListener('focus', refresh)
    // Index changes (local edits, pulls, conflict resolutions) bubble through
    // syncBus — refresh immediately so the pill snaps to the new state.
    const unsub = syncBus.subscribe(ev => {
      if (ev.type === 'index-updated') refresh()
    })
    return () => { clearInterval(id); window.removeEventListener('focus', refresh); unsub() }
  }, [])

  function openFailed() {
    setFailedItems(getFailedItems())
    setShowFailed(true)
  }

  function refreshFailed() {
    setFailedItems(getFailedItems())
    setFailedCount(getFailedCount())
    setQueueTotal(getQueueCount())
  }

  function openConflicts() {
    setConflicts(localIndex.getConflicts())
    setShowConflicts(true)
  }

  function refreshConflicts() {
    const next = localIndex.getConflicts()
    setConflicts(next)
    setStats(localIndex.getSyncStats())
    if (next.length === 0) setShowConflicts(false)
  }

  // Conflicts (index-level) take precedence — they require manual resolution.
  if (stats.conflicts > 0) {
    return (
      <>
        <button
          onClick={openConflicts}
          className="btn btn-danger btn-sm btn-pill shrink-0 gap-1"
        >
          <RefreshCw className="w-3 h-3" />
          {devMode && <span className="opacity-75">DEV</span>}
          {stats.conflicts} conflict{stats.conflicts > 1 ? 's' : ''}
        </button>
        {showConflicts && (
          <ConflictsModal
            conflicts={conflicts}
            onClose={() => setShowConflicts(false)}
            onChange={refreshConflicts}
          />
        )}
      </>
    )
  }

  // Failed offline-queue items: red pill, opens modal listing failed items.
  if (failedCount > 0) {
    return (
      <>
        <button
          onClick={openFailed}
          className="flex items-center gap-1 text-white text-xs font-semibold rounded-full px-2.5 py-1 transition-colors shrink-0 bg-red-600 hover:bg-red-700"
        >
          <AlertTriangle className="w-3 h-3" />
          {devMode && <span className="opacity-75">DEV</span>}
          {failedCount} failed
        </button>
        {showFailed && (
          <FailedItemsModal
            items={failedItems}
            onClose={() => setShowFailed(false)}
            onChange={refreshFailed}
          />
        )}
      </>
    )
  }

  // Pending items (index pending OR queued offline uploads not yet failed).
  const unsynced = stats.pending + Math.max(queueTotal - failedCount, 0)
  if (unsynced > 0) {
    return (
      <button
        onClick={() => navigate('/sync')}
        className={cn(
          'flex items-center gap-1 text-white text-xs font-semibold rounded-full px-2.5 py-1 transition-colors shrink-0',
          devMode ? 'bg-green-500 hover:bg-green-600' : 'bg-amber-500 hover:bg-amber-600',
        )}
      >
        <RefreshCw className="w-3 h-3" />
        {devMode && <span className="opacity-75">DEV</span>}
        {unsynced} unsynced
      </button>
    )
  }

  // In dev mode, always show a quiet indicator even when synced
  if (devMode) {
    return (
      <span className="flex items-center gap-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-semibold rounded-full px-2.5 py-1 shrink-0">
        <RefreshCw className="w-3 h-3" />
        DEV
      </span>
    )
  }

  return null
}

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const location = useLocation()
  const inboxCount = useInboxBadgeCount()
  const { topNav, sections, flat } = useShellNav()

  const currentNav = flat.find(n =>
    n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to)
  )

  const alertCount = useActiveAlerts().length

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-800/50">

      {/* ── Desktop Sidebar ────────────────────────────────────────────── */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col bg-slate-900 z-30">

        {/* Logo */}
        <div className="flex items-center gap-3 px-4 pt-6 pb-4">
          <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-sm font-bold text-white leading-none">Property</div>
            <div className="text-sm font-bold text-green-400 leading-none">Manager</div>
          </div>
        </div>

        {/* Property switcher */}
        <div className="px-3 pb-4 border-b border-slate-700">
          <PropertySwitcher />
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {topNav.map(item => (
            <TopNavLink
              key={item.to}
              item={item}
              inboxCount={inboxCount}
              alertCount={alertCount}
            />
          ))}
          <div className="pt-3 space-y-1">
            {sections.map(section => (
              <NavSectionGroup key={section.label} section={section} pathname={location.pathname} />
            ))}
          </div>
        </nav>

        {/* Settings + offline pill at bottom */}
        <div className="px-3 pb-6 border-t border-slate-700 pt-4 space-y-2">
          <div className="px-3 flex items-center gap-2">
            <SyncPill />
            <BackgroundSyncIndicator />
          </div>
          <div className="px-1">
            <ThemeToggle />
          </div>
          <NavLink
            to="/settings"
            className={({ isActive }) => cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              isActive ? 'bg-green-600 text-white' : 'text-slate-400 dark:text-slate-500 hover:bg-slate-700 hover:text-white',
            )}
          >
            <Settings className="w-4 h-4 shrink-0" />
            Settings
          </NavLink>
        </div>
      </aside>

      {/* ── Mobile Header ─────────────────────────────────────────────── */}
      <header className="lg:hidden sticky top-0 z-30 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-green-600 rounded-md flex items-center justify-center">
              <Building2 className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {currentNav?.label ?? 'Property Manager'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <BackgroundSyncIndicator />
            <SyncPill />
            <MobilePropertySwitcher />
            <Link
              to="/settings"
              aria-label="Settings"
              className={cn(
                'flex items-center justify-center w-8 h-8 rounded-lg transition-colors',
                location.pathname.startsWith('/settings')
                  ? 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700',
              )}
            >
              <Settings className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </header>

      {/* ── Main Content ──────────────────────────────────────────────── */}
      <main className="lg:pl-64">
        <div className="px-4 py-5 sm:px-6 lg:px-8 pb-28 lg:pb-8 max-w-5xl">
          {children}
        </div>
      </main>

      {/* ── Mobile Bottom Nav ─────────────────────────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 z-30 safe-bottom">
        <div className="flex items-center">
          {topNav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => cn(
                'flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs transition-colors',
                isActive ? 'text-green-600 dark:text-green-400' : 'text-slate-500 dark:text-slate-400',
              )}
            >
              {({ isActive }) => (
                <>
                  <div className={cn(
                    'w-8 h-8 flex items-center justify-center rounded-lg transition-colors relative',
                    isActive && 'bg-green-50 dark:bg-green-900/20',
                  )}>
                    <Icon className="w-5 h-5" />
                    {to === '/' && alertCount > 0 && (
                      <span
                        aria-label={`${alertCount} HA alerts`}
                        className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center tabular-nums"
                      >
                        {alertCount > 9 ? '9+' : alertCount}
                      </span>
                    )}
                  </div>
                  <span className="font-medium">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

    </div>
  )
}

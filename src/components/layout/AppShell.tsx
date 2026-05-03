import { useState, useEffect } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Camera, Wrench, BarChart3,
  MessageSquare, ClipboardList, Settings, ChevronDown, ChevronRight,
  Building2, TreePine, Users, Droplets, Receipt, Home, Zap, CalendarDays,
  RefreshCw, Shield, FileCheck, CheckSquare, Activity, MapPin, Map,
  Search, ShieldAlert, FileText,
  Sun, Moon, Monitor, DollarSign, HardHat, BookOpen, AlertTriangle, X,
} from 'lucide-react'
import { cn } from '../../utils/cn'
import { useAppStore } from '../../store/AppStoreContext'
import { useProperties } from '../../lib/propertyStore'
import { localIndex } from '../../lib/localIndex'
import type { SyncStats } from '../../lib/localIndex'
import { isDev } from '../../auth/oauth'
import { useModalA11y } from '../../lib/focusTrap'
import { useTheme } from '../../contexts/ThemeContext'
import { BackgroundSyncIndicator } from '../BackgroundSyncIndicator'
import {
  getQueueCount, getFailedCount, getFailedItems, resetItem, resetFailedItems,
} from '../../lib/offlineQueue'
import type { QueuedUpload } from '../../lib/offlineQueue'
import { getTotalInboxQueueCount, INBOX_QUEUE_CHANGED_EVENT } from '../../lib/inboxPoller'

type NavItem = { to: string; icon: React.ComponentType<{ className?: string }>; label: string; mobileShow: boolean }
type NavSection = { label: string; icon: React.ComponentType<{ className?: string }>; items: NavItem[] }

const TOP_NAV: NavItem[] = [
  { to: '/',           icon: LayoutDashboard, label: 'Dashboard',   mobileShow: true  },
  { to: '/capture',    icon: Camera,          label: 'Capture',     mobileShow: true  },
  { to: '/maintenance',icon: Wrench,          label: 'Maintenance', mobileShow: true  },
  { to: '/calendar',   icon: CalendarDays,    label: 'Calendar',    mobileShow: true  },
  { to: '/checklists', icon: CheckSquare,     label: 'Checklists',  mobileShow: true  },
  { to: '/advisor',    icon: MessageSquare,   label: 'Ask AI',      mobileShow: true  },
  { to: '/search',     icon: Search,          label: 'Search',      mobileShow: false },
  { to: '/import',     icon: FileText,        label: 'Import',      mobileShow: false },
]

const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Financial',
    icon: DollarSign,
    items: [
      { to: '/budget',     icon: BarChart3, label: 'Budget',      mobileShow: false },
      { to: '/tax',        icon: Receipt,   label: 'Property Tax', mobileShow: false },
      { to: '/mortgage',   icon: Home,      label: 'Mortgage',    mobileShow: false },
      { to: '/utilities',  icon: Zap,       label: 'Utilities',   mobileShow: false },
      { to: '/insurance',  icon: Shield,    label: 'Insurance',   mobileShow: false },
    ],
  },
  {
    label: 'Property',
    icon: HardHat,
    items: [
      { to: '/profile',    icon: BookOpen,      label: 'Profile',     mobileShow: false },
      { to: '/map',        icon: Map,           label: 'Map',         mobileShow: false },
      { to: '/risk-brief', icon: ShieldAlert,   label: 'Risk Brief',  mobileShow: false },
      { to: '/inventory',  icon: ClipboardList, label: 'Inventory',   mobileShow: false },
      { to: '/vendors',    icon: Users,         label: 'Vendors',     mobileShow: false },
      { to: '/permits',    icon: FileCheck,     label: 'Permits',     mobileShow: false },
      { to: '/fuel',       icon: Droplets,      label: 'Fuel',        mobileShow: false },
      { to: '/generator',  icon: Activity,      label: 'Generator',   mobileShow: false },
      { to: '/road',       icon: MapPin,        label: 'Roads',       mobileShow: false },
    ],
  },
]

// Flat list for mobile bottom nav and route matching
const NAV_ITEMS = [
  ...TOP_NAV,
  ...NAV_SECTIONS.flatMap(s => s.items),
]

const PROPERTY_ICONS = { residence: Building2, camp: TreePine, land: Building2 }

function NavSectionGroup({ section, pathname }: { section: NavSection; pathname: string }) {
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

function SyncPill() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<SyncStats>(() => localIndex.getSyncStats())
  const [queueTotal, setQueueTotal]   = useState<number>(() => getQueueCount())
  const [failedCount, setFailedCount] = useState<number>(() => getFailedCount())
  const [failedItems, setFailedItems] = useState<QueuedUpload[]>([])
  const [showFailed,  setShowFailed]  = useState(false)
  const devMode = isDev()

  useEffect(() => {
    const refresh = () => {
      setStats(localIndex.getSyncStats())
      setQueueTotal(getQueueCount())
      setFailedCount(getFailedCount())
    }
    const id = setInterval(refresh, 30_000)
    window.addEventListener('focus', refresh)
    return () => { clearInterval(id); window.removeEventListener('focus', refresh) }
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

  // Conflicts (index-level) take precedence — they require manual resolution.
  if (stats.conflicts > 0) {
    return (
      <button
        onClick={() => navigate('/conflicts')}
        className="btn btn-danger btn-sm btn-pill shrink-0 gap-1"
      >
        <RefreshCw className="w-3 h-3" />
        {devMode && <span className="opacity-75">DEV</span>}
        {stats.conflicts} conflict{stats.conflicts > 1 ? 's' : ''}
      </button>
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

  const currentNav = NAV_ITEMS.find(n =>
    n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to)
  )

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
          {TOP_NAV.map(({ to, icon: Icon, label }) => {
            const badge = to === '/import' && inboxCount > 0 ? inboxCount : 0
            return (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) => cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-green-600 text-white'
                    : 'text-slate-300 hover:bg-slate-700 hover:text-white',
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="flex-1">{label}</span>
                {badge > 0 && (
                  <span
                    aria-label={`${badge} pending inbox item${badge === 1 ? '' : 's'}`}
                    className="bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center"
                  >
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </NavLink>
            )
          })}
          <div className="pt-3 space-y-1">
            {NAV_SECTIONS.map(section => (
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
          {NAV_ITEMS.filter(n => n.mobileShow).map(({ to, icon: Icon, label }) => (
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
                    'w-8 h-8 flex items-center justify-center rounded-lg transition-colors',
                    isActive && 'bg-green-50 dark:bg-green-900/20',
                  )}>
                    <Icon className="w-5 h-5" />
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

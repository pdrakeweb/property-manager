import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Camera, Wrench, BarChart3,
  MessageSquare, ClipboardList, Settings, ChevronDown,
  Building2, TreePine, Users, Droplets, Receipt, Home, Zap,
} from 'lucide-react'
import { cn } from '../../utils/cn'
import { PROPERTIES } from '../../data/mockData'
import { useAppStore } from '../../store/AppStoreContext'

const NAV_ITEMS = [
  { to: '/',           icon: LayoutDashboard, label: 'Dashboard',   mobileShow: true  },
  { to: '/capture',    icon: Camera,          label: 'Capture',     mobileShow: true  },
  { to: '/maintenance',icon: Wrench,          label: 'Maintenance', mobileShow: true  },
  { to: '/budget',     icon: BarChart3,       label: 'Budget',      mobileShow: true  },
  { to: '/advisor',    icon: MessageSquare,   label: 'Ask AI',      mobileShow: true  },
  { to: '/inventory',  icon: ClipboardList,   label: 'Inventory',   mobileShow: false },
  { to: '/vendors',    icon: Users,           label: 'Vendors',     mobileShow: false },
  { to: '/fuel',       icon: Droplets,        label: 'Fuel',        mobileShow: false },
  { to: '/tax',        icon: Receipt,         label: 'Property Tax',mobileShow: false },
  { to: '/mortgage',   icon: Home,            label: 'Mortgage',    mobileShow: false },
  { to: '/utilities',  icon: Zap,             label: 'Utilities',   mobileShow: false },
]

const PROPERTY_ICONS = { residence: Building2, camp: TreePine, land: Building2 }

function PropertySwitcher() {
  const [open, setOpen] = useState(false)
  const { activePropertyId, setActivePropertyId } = useAppStore()
  const active = PROPERTIES.find(p => p.id === activePropertyId) ?? PROPERTIES[0]
  const Icon = PROPERTY_ICONS[active.type]

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-left hover:bg-slate-700 transition-colors"
      >
        <Icon className="w-4 h-4 text-sky-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-white truncate">{active.shortName}</div>
          <div className="text-xs text-slate-400 truncate">{active.address}</div>
        </div>
        <ChevronDown className={cn('w-4 h-4 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-50 overflow-hidden">
          {PROPERTIES.map(p => {
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
                <PIcon className="w-4 h-4 text-sky-400 shrink-0" />
                <div>
                  <div className="text-sm font-medium text-white">{p.name}</div>
                  <div className="text-xs text-slate-400">{p.stats.documented}/{p.stats.total} documented</div>
                </div>
              </button>
            )
          })}
          <div className="border-t border-slate-600 px-3 py-2">
            <button className="text-xs text-sky-400 hover:text-sky-300 transition-colors">
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
  const { activePropertyId, setActivePropertyId } = useAppStore()
  const active = PROPERTIES.find(p => p.id === activePropertyId) ?? PROPERTIES[0]
  const Icon = PROPERTY_ICONS[active.type]

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 bg-slate-100 rounded-lg px-2.5 py-1.5"
      >
        <Icon className="w-3.5 h-3.5 text-sky-600" />
        <span className="text-sm font-medium text-slate-700">{active.shortName}</span>
        <ChevronDown className={cn('w-3.5 h-3.5 text-slate-500 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
            {PROPERTIES.map(p => {
              const PIcon = PROPERTY_ICONS[p.type]
              return (
                <button
                  key={p.id}
                  onClick={() => { setActivePropertyId(p.id); setOpen(false) }}
                  className={cn(
                    'flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-slate-50',
                    p.id === activePropertyId && 'bg-sky-50',
                  )}
                >
                  <PIcon className="w-4 h-4 text-sky-600" />
                  <div>
                    <div className="text-sm font-semibold text-slate-800">{p.name}</div>
                    <div className="text-xs text-slate-500">{p.stats.documented}/{p.stats.total} documented</div>
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const location = useLocation()

  const currentNav = NAV_ITEMS.find(n =>
    n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to)
  )

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Desktop Sidebar ────────────────────────────────────────────── */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col bg-slate-900 z-30">

        {/* Logo */}
        <div className="flex items-center gap-3 px-4 pt-6 pb-4">
          <div className="w-8 h-8 bg-sky-500 rounded-lg flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-sm font-bold text-white leading-none">Property</div>
            <div className="text-sm font-bold text-sky-400 leading-none">Manager</div>
          </div>
        </div>

        {/* Property switcher */}
        <div className="px-3 pb-4 border-b border-slate-700">
          <PropertySwitcher />
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-300 hover:bg-slate-700 hover:text-white',
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Settings at bottom */}
        <div className="px-3 pb-6 border-t border-slate-700 pt-4">
          <NavLink
            to="/settings"
            className={({ isActive }) => cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              isActive ? 'bg-sky-600 text-white' : 'text-slate-400 hover:bg-slate-700 hover:text-white',
            )}
          >
            <Settings className="w-4 h-4 shrink-0" />
            Settings
          </NavLink>
        </div>
      </aside>

      {/* ── Mobile Header ─────────────────────────────────────────────── */}
      <header className="lg:hidden sticky top-0 z-30 bg-white border-b border-slate-200">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-sky-600 rounded-md flex items-center justify-center">
              <Building2 className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-bold text-slate-900">
              {currentNav?.label ?? 'Property Manager'}
            </span>
          </div>
          <MobilePropertySwitcher />
        </div>
      </header>

      {/* ── Main Content ──────────────────────────────────────────────── */}
      <main className="lg:pl-64">
        <div className="px-4 py-5 sm:px-6 lg:px-8 pb-28 lg:pb-8 max-w-5xl">
          {children}
        </div>
      </main>

      {/* ── Mobile Bottom Nav ─────────────────────────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 z-30 safe-bottom">
        <div className="flex items-center">
          {NAV_ITEMS.filter(n => n.mobileShow).map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => cn(
                'flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs transition-colors',
                isActive ? 'text-sky-600' : 'text-slate-500',
              )}
            >
              {({ isActive }) => (
                <>
                  <div className={cn(
                    'w-8 h-8 flex items-center justify-center rounded-lg transition-colors',
                    isActive && 'bg-sky-50',
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

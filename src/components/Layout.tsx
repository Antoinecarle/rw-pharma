import { useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Pill,
  Truck,
  Users,
  LogOut,
  LayoutDashboard,
  Menu,
  ClipboardList,
  CalendarRange,
  ChevronRight,
  Command,
  BarChart3,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import CommandPalette from '@/components/CommandPalette'

const mainNavigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, description: 'Vue d\'ensemble' },
  { name: 'Allocations', href: '/monthly-processes', icon: CalendarRange, description: 'Processus mensuels' },
  { name: 'Metriques', href: '/allocation-dashboard', icon: BarChart3, description: 'Dashboard allocation' },
]

const referenceNavigation = [
  { name: 'Produits', href: '/products', icon: Pill, description: 'Catalogue pharmaceutique' },
  { name: 'Grossistes', href: '/wholesalers', icon: Truck, description: 'Partenaires francais' },
  { name: 'Clients', href: '/customers', icon: Users, description: 'Importateurs europeens' },
  { name: 'Quotas', href: '/quotas', icon: ClipboardList, description: 'Quotas mensuels' },
]

const navigation = [...mainNavigation, ...referenceNavigation]

function getInitials(email: string) {
  return email.split('@')[0].slice(0, 2).toUpperCase()
}

function getPageTitle(pathname: string) {
  const nav = navigation.find((n) => n.href === pathname || (n.href !== '/' && pathname.startsWith(n.href)))
  return nav?.name ?? 'RW Pharma'
}

function NavItem({ item, isActive, onNavigate }: { item: typeof navigation[0]; isActive: boolean; onNavigate?: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to={item.href}
          onClick={onNavigate}
          className={cn(
            'flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200',
            isActive
              ? 'text-[var(--ivory-accent)]'
              : 'text-[var(--ivory-text-muted)] hover:text-[var(--ivory-text-heading)]'
          )}
          style={isActive ? {
            background: 'rgba(13,148,136,0.08)',
          } : {}}
        >
          <item.icon
            className={cn('h-[16px] w-[16px] shrink-0 transition-colors')}
            style={{ color: isActive ? 'var(--ivory-accent)' : undefined }}
            strokeWidth={isActive ? 2 : 1.75}
          />
          <span className="flex-1">{item.name}</span>
          {isActive && <ChevronRight className="h-3 w-3 opacity-40" />}
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right" className="font-normal text-xs">
        {item.description}
      </TooltipContent>
    </Tooltip>
  )
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, signOut } = useAuth()
  const location = useLocation()
  const initials = user?.email ? getInitials(user.email) : '??'

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--ivory-panel)' }}>
      {/* Brand */}
      <div className="px-5 py-5">
        <Link to="/" className="flex items-center gap-2.5 group" onClick={onNavigate}>
          <div className="h-9 w-9 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105 shadow-sm"
            style={{ background: 'linear-gradient(135deg, rgba(13,148,136,0.15), rgba(13,148,136,0.05))' }}>
            <Pill className="h-4.5 w-4.5" style={{ color: 'var(--ivory-accent)' }} />
          </div>
          <div>
            <h1 className="ivory-heading text-[14px] leading-none">RW Pharma</h1>
            <p className="text-[10px] mt-0.5 font-semibold tracking-widest uppercase" style={{ color: 'var(--ivory-text-muted)' }}>Phase 1</p>
          </div>
        </Link>
      </div>

      <div className="mx-4 h-px" style={{ background: 'rgba(0,0,0,0.06)' }} />

      {/* Navigation */}
      <nav className="flex-1 px-3 pt-4 pb-2 space-y-0.5 overflow-y-auto">
        <p className="text-[10px] font-semibold uppercase tracking-widest px-3 pb-2" style={{ color: 'var(--ivory-text-muted)', opacity: 0.6 }}>
          Principal
        </p>
        {mainNavigation.map((item) => {
          const isActive = item.href === '/' ? location.pathname === '/' : location.pathname.startsWith(item.href)
          return <NavItem key={item.href} item={item} isActive={isActive} onNavigate={onNavigate} />
        })}

        <p className="text-[10px] font-semibold uppercase tracking-widest px-3 pb-2 pt-5" style={{ color: 'var(--ivory-text-muted)', opacity: 0.6 }}>
          Donnees de reference
        </p>
        {referenceNavigation.map((item) => {
          const isActive = location.pathname.startsWith(item.href)
          return <NavItem key={item.href} item={item} isActive={isActive} onNavigate={onNavigate} />
        })}
      </nav>

      <div className="mx-4 h-px" style={{ background: 'rgba(0,0,0,0.06)' }} />

      {/* User */}
      <div className="p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all duration-200 text-left hover:bg-[rgba(0,0,0,0.03)]">
              <Avatar className="h-8 w-8">
                <AvatarFallback
                  className="text-[10px] font-bold"
                  style={{ background: 'rgba(13,148,136,0.10)', color: 'var(--ivory-accent)' }}
                >
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--ivory-text-heading)' }}>
                  {user?.email?.split('@')[0]}
                </p>
                <p className="text-[10px] truncate leading-tight" style={{ color: 'var(--ivory-text-muted)' }}>
                  {user?.email}
                </p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52 rounded-xl">
            <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive text-[13px] rounded-lg">
              <LogOut className="h-3.5 w-3.5 mr-2" />
              Se deconnecter
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const pageTitle = getPageTitle(location.pathname)

  return (
    <div className="flex h-screen" style={{ background: 'var(--ivory-bg)' }}>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-[250px] flex-col shrink-0"
        style={{ borderRight: '1px solid rgba(0,0,0,0.06)' }}>
        <Sidebar />
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header
          className="flex items-center gap-3 px-5 md:px-6 h-[56px] shrink-0"
          style={{
            background: 'rgba(255,255,255,0.85)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderBottom: '1px solid rgba(0,0,0,0.06)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          }}
        >
          {/* Mobile menu */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden shrink-0 h-8 w-8 rounded-lg">
                <Menu className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[250px] p-0">
              <Sidebar onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>

          <h2 className="ivory-heading text-[15px] truncate">{pageTitle}</h2>

          <div className="ml-auto flex items-center gap-2.5">
            <button
              onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
              className="hidden sm:flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs transition-all duration-200"
              style={{
                background: 'rgba(255,255,255,0.72)',
                border: '1px solid rgba(0,0,0,0.06)',
                color: 'var(--ivory-text-muted)',
                boxShadow: 'var(--ivory-shadow-sm)',
              }}
            >
              <Command className="h-3 w-3" />
              <span>Rechercher...</span>
              <kbd className="inline-flex h-5 items-center gap-0.5 rounded-md px-1.5 font-mono text-[10px] font-medium"
                style={{ background: 'rgba(0,0,0,0.04)', color: 'var(--ivory-text-muted)' }}>
                <span className="text-xs">&#8984;</span>K
              </kbd>
            </button>
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold"
              style={{ background: 'rgba(13,148,136,0.06)', color: 'var(--ivory-teal)' }}>
              <div className="h-1.5 w-1.5 rounded-full animate-subtle-pulse" style={{ background: 'var(--ivory-teal)' }} />
              En ligne
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>

      <CommandPalette />
    </div>
  )
}

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
} from 'lucide-react'
import { cn } from '@/lib/utils'
import CommandPalette from '@/components/CommandPalette'

const mainNavigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, description: 'Vue d\'ensemble' },
  { name: 'Allocations', href: '/monthly-processes', icon: CalendarRange, description: 'Processus mensuels' },
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
            'flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150',
            isActive
              ? 'bg-primary/8 text-primary'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
          )}
        >
          <item.icon className={cn('h-[15px] w-[15px] shrink-0', isActive && 'text-primary')} strokeWidth={isActive ? 2 : 1.75} />
          <span className="flex-1">{item.name}</span>
          {isActive && <ChevronRight className="h-3 w-3 text-primary/50" />}
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
    <div className="flex flex-col h-full bg-sidebar">
      {/* Brand */}
      <div className="px-5 py-5">
        <Link to="/" className="flex items-center gap-2.5 group" onClick={onNavigate}>
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center transition-transform group-hover:scale-105">
            <Pill className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h1 className="text-[14px] font-semibold text-sidebar-foreground leading-none tracking-tight">RW Pharma</h1>
            <p className="text-[10px] text-muted-foreground mt-0.5 font-medium tracking-wide uppercase">Phase 1</p>
          </div>
        </Link>
      </div>

      <div className="mx-4 h-px bg-sidebar-border" />

      {/* Navigation */}
      <nav className="flex-1 px-3 pt-4 pb-2 space-y-0.5 overflow-y-auto">
        <p className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-widest px-3 pb-1.5">
          Principal
        </p>
        {mainNavigation.map((item) => {
          const isActive = item.href === '/' ? location.pathname === '/' : location.pathname.startsWith(item.href)
          return <NavItem key={item.href} item={item} isActive={isActive} onNavigate={onNavigate} />
        })}

        <p className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-widest px-3 pb-1.5 pt-5">
          Donnees de reference
        </p>
        {referenceNavigation.map((item) => {
          const isActive = location.pathname.startsWith(item.href)
          return <NavItem key={item.href} item={item} isActive={isActive} onNavigate={onNavigate} />
        })}
      </nav>

      <div className="mx-4 h-px bg-sidebar-border" />

      {/* User */}
      <div className="p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-sidebar-accent transition-colors text-left">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-primary/8 text-primary text-[10px] font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-sidebar-foreground truncate">
                  {user?.email?.split('@')[0]}
                </p>
                <p className="text-[10px] text-muted-foreground truncate leading-tight">
                  {user?.email}
                </p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive text-[13px]">
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
    <div className="flex h-screen bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-[240px] border-r border-sidebar-border flex-col shrink-0">
        <Sidebar />
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="flex items-center gap-3 px-5 md:px-6 h-[52px] border-b bg-card/60 backdrop-blur-sm shrink-0">
          {/* Mobile menu */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden shrink-0 h-8 w-8">
                <Menu className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[240px] p-0">
              <Sidebar onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>

          <h2 className="text-[14px] font-semibold text-foreground/90 tracking-tight truncate">{pageTitle}</h2>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-muted/50 hover:bg-muted text-muted-foreground text-xs transition-colors"
            >
              <Command className="h-3 w-3" />
              <span>Rechercher...</span>
              <kbd className="pointer-events-none inline-flex h-5 items-center gap-0.5 rounded border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                <span className="text-xs">&#8984;</span>K
              </kbd>
            </button>
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[11px] font-medium">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-subtle-pulse" />
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

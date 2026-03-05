import { useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
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
} from 'lucide-react'
import { cn } from '@/lib/utils'

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

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, signOut } = useAuth()
  const location = useLocation()
  const initials = user?.email ? getInitials(user.email) : '??'

  return (
    <div className="flex flex-col h-full bg-sidebar">
      {/* Brand header */}
      <div className="p-5">
        <Link to="/" className="flex items-center gap-3 group" onClick={onNavigate}>
          <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center shadow-sm shadow-primary/25 transition-transform group-hover:scale-105">
            <Pill className="h-4.5 w-4.5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-base font-bold text-sidebar-foreground leading-none">RW Pharma</h1>
            <p className="text-[10px] text-muted-foreground mt-0.5 font-medium tracking-wide uppercase">Phase 1 - Setup</p>
          </div>
        </Link>
      </div>

      <Separator className="bg-sidebar-border" />

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-3 py-2">
          Principal
        </p>
        {mainNavigation.map((item) => {
          const isActive = item.href === '/' ? location.pathname === '/' : location.pathname.startsWith(item.href)
          return (
            <Tooltip key={item.href}>
              <TooltipTrigger asChild>
                <Link
                  to={item.href}
                  onClick={onNavigate}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                      : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground'
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1">{item.name}</span>
                  {isActive && <ChevronRight className="h-3.5 w-3.5 opacity-70" />}
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" className="font-normal">
                {item.description}
              </TooltipContent>
            </Tooltip>
          )
        })}

        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-3 py-2 mt-4">
          Donnees de reference
        </p>
        {referenceNavigation.map((item) => {
          const isActive = location.pathname.startsWith(item.href)
          return (
            <Tooltip key={item.href}>
              <TooltipTrigger asChild>
                <Link
                  to={item.href}
                  onClick={onNavigate}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                      : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground'
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1">{item.name}</span>
                  {isActive && <ChevronRight className="h-3.5 w-3.5 opacity-70" />}
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" className="font-normal">
                {item.description}
              </TooltipContent>
            </Tooltip>
          )
        })}
      </nav>

      <Separator className="bg-sidebar-border" />

      {/* User section */}
      <div className="p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-sidebar-accent transition-colors text-left">
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-sidebar-foreground truncate">
                  {user?.email?.split('@')[0]}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {user?.email}
                </p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
              <LogOut className="h-4 w-4 mr-2" />
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
      <aside className="hidden md:flex w-[260px] border-r border-sidebar-border flex-col shrink-0">
        <Sidebar />
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="flex items-center gap-3 px-4 md:px-6 h-14 border-b bg-card/50 backdrop-blur shrink-0">
          {/* Mobile menu */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden shrink-0">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[260px] p-0">
              <Sidebar onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>

          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-base font-semibold truncate">{pageTitle}</h2>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
              <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              En ligne
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

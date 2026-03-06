import { useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Pill,
  LogOut,
  Menu,
  ShoppingCart,
  FileCheck,
  Package,
  FolderOpen,
  ChevronRight,
  Globe,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const portalNavigation = [
  { name: 'Mes commandes', href: '/portal', icon: ShoppingCart, description: 'Commandes du mois' },
  { name: 'Allocations', href: '/portal/allocations', icon: FileCheck, description: 'Lots alloues' },
  { name: 'Stock offert', href: '/portal/stock', icon: Package, description: 'Produits disponibles' },
  { name: 'Documents', href: '/portal/documents', icon: FolderOpen, description: 'Fichiers & exports' },
]

function getPageTitle(pathname: string) {
  if (pathname === '/portal') return 'Mes commandes'
  const nav = portalNavigation.find((n) => n.href !== '/portal' && pathname.startsWith(n.href))
  return nav?.name ?? 'Portail Client'
}

function PortalNavItem({ item, isActive, onNavigate }: { item: typeof portalNavigation[0]; isActive: boolean; onNavigate?: () => void }) {
  return (
    <Link
      to={item.href}
      onClick={onNavigate}
      className={cn(
        'flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200',
        isActive
          ? 'text-[var(--ivory-accent)]'
          : 'text-[var(--ivory-text-muted)] hover:text-[var(--ivory-text-heading)]'
      )}
      style={isActive ? { background: 'rgba(13,148,136,0.08)' } : {}}
    >
      <item.icon
        className="h-[16px] w-[16px] shrink-0 transition-colors"
        style={{ color: isActive ? 'var(--ivory-accent)' : undefined }}
        strokeWidth={isActive ? 2 : 1.75}
      />
      <span className="flex-1">{item.name}</span>
      {isActive && <ChevronRight className="h-3 w-3 opacity-40" />}
    </Link>
  )
}

function PortalSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { customerName, signOut } = useAuth()
  const location = useLocation()

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--ivory-panel)' }}>
      {/* Brand */}
      <div className="px-5 py-5">
        <Link to="/portal" className="flex items-center gap-2.5 group" onClick={onNavigate}>
          <div
            className="h-9 w-9 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105 shadow-sm"
            style={{ background: 'linear-gradient(135deg, rgba(13,148,136,0.15), rgba(13,148,136,0.05))' }}
          >
            <Pill className="h-4.5 w-4.5" style={{ color: 'var(--ivory-accent)' }} />
          </div>
          <div>
            <h1 className="ivory-heading text-[14px] leading-none">RW Pharma</h1>
            <p className="text-[10px] mt-0.5 font-semibold tracking-widest uppercase" style={{ color: 'var(--ivory-text-muted)' }}>
              Portail Client
            </p>
          </div>
        </Link>
      </div>

      <div className="mx-4 h-px" style={{ background: 'rgba(0,0,0,0.06)' }} />

      {/* Customer info */}
      <div className="px-5 py-3">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'rgba(13,148,136,0.04)' }}>
          <Globe className="h-3.5 w-3.5" style={{ color: 'var(--ivory-accent)' }} />
          <span className="text-[12px] font-semibold" style={{ color: 'var(--ivory-text-heading)' }}>
            {customerName ?? 'Client'}
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 pt-2 pb-2 space-y-0.5 overflow-y-auto">
        {portalNavigation.map((item) => {
          const isActive = item.href === '/portal'
            ? location.pathname === '/portal'
            : location.pathname.startsWith(item.href)
          return <PortalNavItem key={item.href} item={item} isActive={isActive} onNavigate={onNavigate} />
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
                  {(customerName ?? 'C').slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--ivory-text-heading)' }}>
                  {customerName ?? 'Client'}
                </p>
                <p className="text-[10px] truncate leading-tight" style={{ color: 'var(--ivory-text-muted)' }}>
                  Importateur
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

export default function PortalLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const pageTitle = getPageTitle(location.pathname)

  return (
    <div className="flex h-screen" style={{ background: 'var(--ivory-bg)' }}>
      {/* Desktop Sidebar */}
      <aside
        className="hidden md:flex w-[250px] flex-col shrink-0"
        style={{ borderRight: '1px solid rgba(0,0,0,0.06)' }}
      >
        <PortalSidebar />
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
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden shrink-0 h-8 w-8 rounded-lg">
                <Menu className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[250px] p-0">
              <PortalSidebar onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>

          <h2 className="ivory-heading text-[15px] truncate">{pageTitle}</h2>

          <div className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold"
            style={{ background: 'rgba(13,148,136,0.06)', color: 'var(--ivory-teal)' }}>
            <div className="h-1.5 w-1.5 rounded-full animate-subtle-pulse" style={{ background: 'var(--ivory-teal)' }} />
            En ligne
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

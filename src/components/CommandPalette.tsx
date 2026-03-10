import { useEffect, useState, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'
import {
  LayoutDashboard,
  Pill,
  Truck,
  Users,
  ClipboardList,
  CalendarRange,
  FileSpreadsheet,
  Play,
  ArrowRight,
  Scale,
  Boxes,
  ShieldAlert,
  BarChart3,
} from 'lucide-react'

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', keywords: 'dashboard accueil home', icon: LayoutDashboard },
  { path: '/monthly-processes', label: 'Allocations mensuelles', keywords: 'allocations processus mensuel', icon: CalendarRange },
  { path: '/products', label: 'Produits', keywords: 'produits catalogue medicaments cip13', icon: Pill, shortcut: 'catalogue' },
  { path: '/wholesalers', label: 'Grossistes', keywords: 'grossistes fournisseurs alliance cerp ocp', icon: Truck },
  { path: '/customers', label: 'Clients importateurs', keywords: 'clients importateurs orifarm mpa axicorp', icon: Users },
  { path: '/quotas', label: 'Quotas mensuels', keywords: 'quotas mensuels quotas grossistes', icon: ClipboardList },
  { path: '/debts', label: 'Dettes clients', keywords: 'dettes sous-allocation compensation', icon: Scale },
  { path: '/stock', label: 'Stock', keywords: 'stock lots collecte inventaire', icon: Boxes },
  { path: '/ansm', label: 'ANSM', keywords: 'ansm bloques export interdit', icon: ShieldAlert },
  { path: '/allocation-dashboard', label: 'Metriques', keywords: 'metriques dashboard kpi statistiques couverture', icon: BarChart3 },
]

const ACTION_ITEMS = [
  { path: '/products', label: 'Import Excel produits', keywords: 'import excel produits catalogue', icon: FileSpreadsheet },
  { path: '/monthly-processes', label: 'Nouveau processus mensuel', keywords: 'nouveau processus mensuel creer', icon: CalendarRange },
]

function matchesSearch(keywords: string, label: string, query: string): boolean {
  const q = query.toLowerCase()
  return label.toLowerCase().includes(q) || keywords.toLowerCase().includes(q)
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  const { data: activeProcess } = useQuery({
    queryKey: ['monthly-processes', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('monthly_processes')
        .select('id, month, year, current_step, status, orders_count, allocations_count')
        .neq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })

  const [search, setSearch] = useState('')

  const { data: productResults } = useQuery({
    queryKey: ['products', 'cmd-search', search],
    queryFn: async () => {
      const { data } = await supabase
        .from('products')
        .select('id, cip13, name')
        .or(`cip13.ilike.%${search}%,name.ilike.%${search}%`)
        .limit(5)
      return data ?? []
    },
    enabled: search.length >= 2,
  })

  const { data: customerResults } = useQuery({
    queryKey: ['customers', 'cmd-search', search],
    queryFn: async () => {
      const { data } = await supabase
        .from('customers')
        .select('id, code, name, country')
        .or(`code.ilike.%${search}%,name.ilike.%${search}%`)
        .limit(5)
      return data ?? []
    },
    enabled: search.length >= 2,
  })

  const { data: wholesalerResults } = useQuery({
    queryKey: ['wholesalers', 'cmd-search', search],
    queryFn: async () => {
      const { data } = await supabase
        .from('wholesalers')
        .select('id, code, name')
        .or(`code.ilike.%${search}%,name.ilike.%${search}%`)
        .limit(5)
      return data ?? []
    },
    enabled: search.length >= 2,
  })

  const MONTH_NAMES = ['Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre']
  const STEP_LABELS = ['Import quotas', 'Import commandes', 'Revue commandes', 'Attribution macro', 'Export grossistes', 'Reception stocks', 'Agregation stock', 'Allocation lots', 'Revue allocations', 'Finalisation']

  const isOnProcess = location.pathname.startsWith('/monthly-processes/')

  const go = (path: string) => {
    navigate(path)
    setOpen(false)
  }

  // Filter static items when there's a search query
  const filteredNav = useMemo(() => {
    if (!search) return NAV_ITEMS
    return NAV_ITEMS.filter(item => matchesSearch(item.keywords, item.label, search))
  }, [search])

  const filteredActions = useMemo(() => {
    if (!search) return ACTION_ITEMS
    return ACTION_ITEMS.filter(item => matchesSearch(item.keywords, item.label, search))
  }, [search])

  const hasEntityResults = (productResults?.length ?? 0) > 0 || (customerResults?.length ?? 0) > 0 || (wholesalerResults?.length ?? 0) > 0
  const hasAnyResults = filteredNav.length > 0 || filteredActions.length > 0 || hasEntityResults || (activeProcess && !search)

  return (
    <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false}>
      <CommandInput
        placeholder="Rechercher une action, une page, un produit, un client..."
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        {!hasAnyResults && <CommandEmpty>Aucun resultat.</CommandEmpty>}

        {/* Contextual actions */}
        {activeProcess && !search && (
          <CommandGroup heading="Processus en cours">
            <CommandItem onSelect={() => go(`/monthly-processes/${activeProcess.id}`)}>
              <Play className="mr-2 h-4 w-4 text-primary" />
              <span>
                Continuer {MONTH_NAMES[activeProcess.month - 1]} {activeProcess.year}
              </span>
              <CommandShortcut>Etape {activeProcess.current_step}/10</CommandShortcut>
            </CommandItem>
            {isOnProcess && activeProcess.current_step <= 3 && (
              <CommandItem onSelect={() => go(`/monthly-processes/${activeProcess.id}`)}>
                <ArrowRight className="mr-2 h-4 w-4" />
                <span>{STEP_LABELS[activeProcess.current_step - 1]}</span>
              </CommandItem>
            )}
          </CommandGroup>
        )}

        {filteredNav.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Navigation">
              {filteredNav.map(item => (
                <CommandItem key={item.path} onSelect={() => go(item.path)}>
                  <item.icon className="mr-2 h-4 w-4" />
                  {item.label}
                  {item.shortcut && <CommandShortcut>{item.shortcut}</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {/* Entity search results */}
        {productResults && productResults.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Produits trouves">
              {productResults.map((p) => (
                <CommandItem key={p.id} onSelect={() => go('/products')}>
                  <Pill className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span className="font-mono text-xs mr-2">{p.cip13}</span>
                  <span className="truncate">{p.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        {customerResults && customerResults.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Clients trouves">
              {customerResults.map((c) => (
                <CommandItem key={c.id} onSelect={() => go('/customers')}>
                  <Users className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span className="font-mono text-xs mr-2">{c.code}</span>
                  <span className="truncate">{c.name}</span>
                  {c.country && <CommandShortcut>{c.country}</CommandShortcut>}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        {wholesalerResults && wholesalerResults.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Grossistes trouves">
              {wholesalerResults.map((w) => (
                <CommandItem key={w.id} onSelect={() => go('/wholesalers')}>
                  <Truck className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span className="font-mono text-xs mr-2">{w.code}</span>
                  <span className="truncate">{w.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {filteredActions.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Actions rapides">
              {filteredActions.map(item => (
                <CommandItem key={item.label} onSelect={() => go(item.path)}>
                  <item.icon className="mr-2 h-4 w-4" />
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  )
}

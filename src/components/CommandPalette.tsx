import { useEffect, useState } from 'react'
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
  Search,
  Play,
  ArrowRight,
  Scale,
  Boxes,
  ShieldAlert,
  BarChart3,
} from 'lucide-react'

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  // Listen for Cmd+K / Ctrl+K
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

  // Fetch active process for contextual actions
  const { data: activeProcess } = useQuery({
    queryKey: ['monthly-processes', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('monthly_processes')
        .select('id, month, year, current_step, status')
        .neq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })

  // Quick entity search
  const [search, setSearch] = useState('')
  const { data: productResults } = useQuery({
    queryKey: ['products', 'cmd-search', search],
    queryFn: async () => {
      if (search.length < 2) return []
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
      if (search.length < 2) return []
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
      if (search.length < 2) return []
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
  const STEP_LABELS = ['Import quotas', 'Import commandes', 'Revue commandes', 'Export grossistes', 'Reception stocks', 'Agregation stock', 'Allocation lots', 'Revue allocations', 'Finalisation']

  const isOnProcess = location.pathname.startsWith('/monthly-processes/')

  const go = (path: string) => {
    navigate(path)
    setOpen(false)
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Rechercher une action, une page, un produit..."
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>Aucun resultat.</CommandEmpty>

        {/* Contextual actions */}
        {activeProcess && (
          <CommandGroup heading="Processus en cours">
            <CommandItem onSelect={() => go(`/monthly-processes/${activeProcess.id}`)}>
              <Play className="mr-2 h-4 w-4 text-primary" />
              <span>
                Continuer {MONTH_NAMES[activeProcess.month - 1]} {activeProcess.year}
              </span>
              <CommandShortcut>Etape {activeProcess.current_step}/9</CommandShortcut>
            </CommandItem>
            {isOnProcess && activeProcess.current_step <= 3 && (
              <CommandItem onSelect={() => go(`/monthly-processes/${activeProcess.id}`)}>
                <ArrowRight className="mr-2 h-4 w-4" />
                <span>{STEP_LABELS[activeProcess.current_step - 1]}</span>
              </CommandItem>
            )}
          </CommandGroup>
        )}

        <CommandSeparator />

        {/* Navigation */}
        <CommandGroup heading="Navigation">
          <CommandItem onSelect={() => go('/')}>
            <LayoutDashboard className="mr-2 h-4 w-4" />
            Dashboard
          </CommandItem>
          <CommandItem onSelect={() => go('/monthly-processes')}>
            <CalendarRange className="mr-2 h-4 w-4" />
            Allocations mensuelles
          </CommandItem>
          <CommandItem onSelect={() => go('/products')}>
            <Pill className="mr-2 h-4 w-4" />
            Produits
            <CommandShortcut>catalogue</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go('/wholesalers')}>
            <Truck className="mr-2 h-4 w-4" />
            Grossistes
          </CommandItem>
          <CommandItem onSelect={() => go('/customers')}>
            <Users className="mr-2 h-4 w-4" />
            Clients importateurs
          </CommandItem>
          <CommandItem onSelect={() => go('/quotas')}>
            <ClipboardList className="mr-2 h-4 w-4" />
            Quotas mensuels
          </CommandItem>
          <CommandItem onSelect={() => go('/debts')}>
            <Scale className="mr-2 h-4 w-4" />
            Dettes clients
          </CommandItem>
          <CommandItem onSelect={() => go('/stock')}>
            <Boxes className="mr-2 h-4 w-4" />
            Stock
          </CommandItem>
          <CommandItem onSelect={() => go('/ansm')}>
            <ShieldAlert className="mr-2 h-4 w-4" />
            ANSM
          </CommandItem>
          <CommandItem onSelect={() => go('/metrics')}>
            <BarChart3 className="mr-2 h-4 w-4" />
            Metriques
          </CommandItem>
        </CommandGroup>

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

        <CommandSeparator />

        {/* Quick actions */}
        <CommandGroup heading="Actions rapides">
          <CommandItem onSelect={() => go('/products')}>
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            Import Excel produits
          </CommandItem>
          <CommandItem onSelect={() => go('/monthly-processes')}>
            <CalendarRange className="mr-2 h-4 w-4" />
            Nouveau processus mensuel
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}

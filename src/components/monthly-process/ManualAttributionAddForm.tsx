import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'
import { Check, ChevronsUpDown, Plus, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ManualAttributionAddFormProps {
  selectedCustomerCode: string
  /** Callback after successful add */
  onAdd: (productId: string, wholesalerId: string, reqQty: number, supQty: number) => void
  onCancel: () => void
  isSaving: boolean
}

export default function ManualAttributionAddForm({
  selectedCustomerCode,
  onAdd,
  onCancel,
  isSaving,
}: ManualAttributionAddFormProps) {
  const [productOpen, setProductOpen] = useState(false)
  const [wholesalerOpen, setWholesalerOpen] = useState(false)
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null)
  const [selectedWholesalerId, setSelectedWholesalerId] = useState<string | null>(null)
  const [reqQty, setReqQty] = useState('')
  const [supQty, setSupQty] = useState('')

  // Lazy-load ALL products for the combobox
  const { data: allProducts = [], isLoading: productsLoading } = useQuery({
    queryKey: ['all-products-manual-add'],
    queryFn: async () => {
      let all: { id: string; cip13: string; name: string }[] = []
      let from = 0
      while (true) {
        const { data, error } = await supabase
          .from('products')
          .select('id, cip13, name')
          .eq('is_ansm_blocked', false)
          .order('name')
          .range(from, from + 999)
        if (error) throw error
        if (!data || data.length === 0) break
        all = all.concat(data)
        if (data.length < 1000) break
        from += 1000
      }
      return all
    },
  })

  // Load ALL wholesalers (not just those with quotas)
  const { data: allWholesalers = [] } = useQuery({
    queryKey: ['all-wholesalers-manual-add'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wholesalers')
        .select('id, code, name')
        .order('code')
      if (error) throw error
      return data ?? []
    },
  })

  const selectedProduct = useMemo(
    () => allProducts.find(p => p.id === selectedProductId),
    [allProducts, selectedProductId],
  )
  const selectedWholesaler = useMemo(
    () => allWholesalers.find(w => w.id === selectedWholesalerId),
    [allWholesalers, selectedWholesalerId],
  )

  const handleSubmit = () => {
    if (!selectedProductId || !selectedWholesalerId) return
    const req = parseInt(reqQty, 10)
    const sup = parseInt(supQty, 10)
    if (isNaN(req) || req < 0 || isNaN(sup) || sup < 0) return
    if (req === 0 && sup === 0) return
    onAdd(selectedProductId, selectedWholesalerId, req, sup)
  }

  const canSubmit = !!selectedProductId && !!selectedWholesalerId && reqQty !== '' && supQty !== ''

  return (
    <div className="border border-blue-200 bg-blue-50/20 dark:bg-blue-950/10 rounded-lg p-4 space-y-3">
      <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">
        Ajouter une attribution manuelle pour {selectedCustomerCode}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Product selector */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Produit</label>
          <Popover open={productOpen} onOpenChange={setProductOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" role="combobox" className="w-full justify-between text-xs h-9">
                {selectedProduct
                  ? <span className="truncate">{selectedProduct.cip13} — {selectedProduct.name.slice(0, 30)}</span>
                  : <span className="text-muted-foreground">Rechercher un produit...</span>
                }
                <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[400px] p-0" align="start">
              <Command>
                <CommandInput placeholder="CIP13 ou nom..." className="text-xs" />
                <CommandList>
                  <CommandEmpty>
                    {productsLoading ? 'Chargement...' : 'Aucun produit trouve'}
                  </CommandEmpty>
                  <CommandGroup>
                    {allProducts.slice(0, 200).map(p => (
                      <CommandItem
                        key={p.id}
                        value={`${p.cip13} ${p.name}`}
                        onSelect={() => {
                          setSelectedProductId(p.id)
                          setProductOpen(false)
                        }}
                        className="text-xs"
                      >
                        <Check className={cn('mr-1 h-3 w-3', selectedProductId === p.id ? 'opacity-100' : 'opacity-0')} />
                        <span className="font-mono mr-2">{p.cip13}</span>
                        <span className="truncate">{p.name}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {/* Wholesaler selector */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Grossiste</label>
          <Popover open={wholesalerOpen} onOpenChange={setWholesalerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" role="combobox" className="w-full justify-between text-xs h-9">
                {selectedWholesaler
                  ? <span>{selectedWholesaler.code} — {selectedWholesaler.name}</span>
                  : <span className="text-muted-foreground">Choisir un grossiste...</span>
                }
                <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Code ou nom..." className="text-xs" />
                <CommandList>
                  <CommandEmpty>Aucun grossiste</CommandEmpty>
                  <CommandGroup>
                    {allWholesalers.map(w => (
                      <CommandItem
                        key={w.id}
                        value={`${w.code} ${w.name}`}
                        onSelect={() => {
                          setSelectedWholesalerId(w.id)
                          setWholesalerOpen(false)
                        }}
                        className="text-xs"
                      >
                        <Check className={cn('mr-1 h-3 w-3', selectedWholesalerId === w.id ? 'opacity-100' : 'opacity-0')} />
                        <span className="font-bold mr-2">{w.code}</span>
                        <span>{w.name}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Qte demandee</label>
          <Input
            type="number"
            min={0}
            value={reqQty}
            onChange={e => setReqQty(e.target.value)}
            placeholder="0"
            className="h-9 text-xs"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Qte fournisseur</label>
          <Input
            type="number"
            min={0}
            value={supQty}
            onChange={e => setSupQty(e.target.value)}
            placeholder="0"
            className="h-9 text-xs"
          />
        </div>
        <Button
          onClick={handleSubmit}
          disabled={!canSubmit || isSaving}
          size="sm"
          className="gap-1.5"
        >
          {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          Ajouter
        </Button>
        <Button onClick={onCancel} variant="outline" size="sm">
          Annuler
        </Button>
      </div>
    </div>
  )
}

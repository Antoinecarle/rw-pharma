import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  AlertTriangle, UserPlus, Package, Check, X, ChevronDown, ChevronUp,
} from 'lucide-react'
import { toast } from 'sonner'
import type { Customer, Product } from '@/types/database'

export interface SkippedItem {
  rowIndex: number
  customerCode: string
  cip13: string
  quantity: number
  unitPrice: number | null
  reason: 'unknown_customer' | 'unknown_product' | 'invalid_quantity' | 'both_unknown' | 'duplicate'
}

interface SkippedItemsReviewModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  skippedItems: SkippedItem[]
  existingCustomers: Pick<Customer, 'id' | 'code' | 'name'>[]
  existingProducts: Pick<Product, 'id' | 'cip13' | 'name'>[]
  onResolved: (resolved: ResolvedItem[]) => void
}

export interface ResolvedItem {
  rowIndex: number
  customerId: string
  productId: string
  quantity: number
  unitPrice: number | null
}

type ItemAction = 'skip' | 'create_customer' | 'create_product' | 'create_both' | 'map_customer' | 'map_product' | 'resolved'

interface ItemState {
  action: ItemAction
  mappedCustomerId?: string
  mappedProductId?: string
  newCustomerName?: string
  newProductName?: string
  resolvedCustomerId?: string
  resolvedProductId?: string
}

const REASON_LABELS: Record<SkippedItem['reason'], string> = {
  unknown_customer: 'Client inconnu',
  unknown_product: 'Produit inconnu',
  invalid_quantity: 'Quantité invalide',
  both_unknown: 'Client et produit inconnus',
  duplicate: 'Doublon (déjà importé)',
}

const COUNTRIES = [
  { code: 'DE', name: 'Allemagne' },
  { code: 'DK', name: 'Danemark' },
  { code: 'SE', name: 'Suède' },
  { code: 'NO', name: 'Norvège' },
  { code: 'NL', name: 'Pays-Bas' },
]

export default function SkippedItemsReviewModal({
  open, onOpenChange, skippedItems, existingCustomers, existingProducts, onResolved,
}: SkippedItemsReviewModalProps) {
  const queryClient = useQueryClient()
  const [states, setStates] = useState<Map<number, ItemState>>(new Map())
  const [expandedRow, setExpandedRow] = useState<number | null>(null)
  const [customerSearch, setCustomerSearch] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [newCustomerCountry, setNewCustomerCountry] = useState<string>('none')

  const getState = (rowIndex: number): ItemState => states.get(rowIndex) ?? { action: 'skip' }

  const setState = (rowIndex: number, state: Partial<ItemState>) => {
    setStates((prev) => {
      const next = new Map(prev)
      next.set(rowIndex, { ...getState(rowIndex), ...state })
      return next
    })
  }

  const createCustomerMut = useMutation({
    mutationFn: async ({ code, name, country }: { code: string; name: string; country: string | null }) => {
      const { data, error } = await supabase
        .from('customers')
        .insert({
          name,
          code: code.toUpperCase(),
          country,
          contact_email: null,
          is_top_client: false,
          allocation_preferences: {},
          documents: null,
          excel_column_mapping: {},
          metadata: {},
        })
        .select('id')
        .single()
      if (error) throw error
      return data.id as string
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
    },
  })

  const createProductMut = useMutation({
    mutationFn: async ({ cip13, name }: { cip13: string; name: string }) => {
      const { data, error } = await supabase
        .from('products')
        .insert({
          cip13,
          cip7: null,
          name,
          eunb: null,
          pfht: null,
          laboratory: null,
          is_ansm_blocked: false,
          expiry_dates: null,
          metadata: {},
        })
        .select('id')
        .single()
      if (error) throw error
      return data.id as string
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
    },
  })

  const handleCreateCustomer = async (item: SkippedItem) => {
    const st = getState(item.rowIndex)
    try {
      const id = await createCustomerMut.mutateAsync({
        code: item.customerCode,
        name: st.newCustomerName || item.customerCode,
        country: newCustomerCountry === 'none' ? null : newCustomerCountry,
      })
      setState(item.rowIndex, { resolvedCustomerId: id, action: 'resolved' })
      toast.success(`Client "${item.customerCode}" créé`)
    } catch (err) {
      toast.error(`Erreur: ${(err as Error).message}`)
    }
  }

  const handleCreateProduct = async (item: SkippedItem) => {
    const st = getState(item.rowIndex)
    try {
      const id = await createProductMut.mutateAsync({
        cip13: item.cip13,
        name: st.newProductName || `Produit ${item.cip13}`,
      })
      setState(item.rowIndex, { resolvedProductId: id, action: 'resolved' })
      toast.success(`Produit "${item.cip13}" créé`)
    } catch (err) {
      toast.error(`Erreur: ${(err as Error).message}`)
    }
  }

  const handleConfirm = () => {
    const resolved: ResolvedItem[] = []
    for (const item of skippedItems) {
      const st = getState(item.rowIndex)
      if (st.action === 'skip') continue

      const customerId = st.resolvedCustomerId ?? st.mappedCustomerId
      const productId = st.resolvedProductId ?? st.mappedProductId

      // For items where only one thing was unknown, we need the other from existing data
      let finalCustomerId = customerId
      let finalProductId = productId

      if (!finalCustomerId) {
        const match = existingCustomers.find((c) => c.code?.toUpperCase() === item.customerCode.toUpperCase())
        finalCustomerId = match?.id
      }
      if (!finalProductId) {
        const match = existingProducts.find((p) => p.cip13 === item.cip13)
        finalProductId = match?.id
      }

      if (finalCustomerId && finalProductId && item.quantity > 0) {
        resolved.push({
          rowIndex: item.rowIndex,
          customerId: finalCustomerId,
          productId: finalProductId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })
      }
    }
    onResolved(resolved)
    onOpenChange(false)
  }

  const resolvedCount = skippedItems.filter((item) => {
    const st = getState(item.rowIndex)
    return st.action === 'resolved' || st.mappedCustomerId || st.mappedProductId
  }).length
  const skippedCount = skippedItems.length - resolvedCount

  const needsCustomer = (reason: SkippedItem['reason']) => reason === 'unknown_customer' || reason === 'both_unknown'
  const needsProduct = (reason: SkippedItem['reason']) => reason === 'unknown_product' || reason === 'both_unknown'

  const filteredCustomers = existingCustomers.filter((c) => {
    if (!customerSearch) return true
    const s = customerSearch.toLowerCase()
    return (c.code?.toLowerCase().includes(s)) || c.name.toLowerCase().includes(s)
  }).slice(0, 20)

  const filteredProducts = existingProducts.filter((p) => {
    if (!productSearch) return true
    const s = productSearch.toLowerCase()
    return p.cip13.includes(s) || p.name.toLowerCase().includes(s)
  }).slice(0, 20)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-amber-50 flex items-center justify-center">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            </div>
            {skippedItems.length} lignes ignorées
          </DialogTitle>
          <DialogDescription>
            Ces lignes n'ont pas pu être importées. Vous pouvez créer les entités manquantes ou les mapper à des existantes.
          </DialogDescription>
        </DialogHeader>

        {/* Summary */}
        <div className="flex gap-2">
          <Badge variant="outline" className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            {skippedCount} à traiter
          </Badge>
          {resolvedCount > 0 && (
            <Badge variant="default" className="gap-1">
              <Check className="h-3 w-3" />
              {resolvedCount} resolues
            </Badge>
          )}
        </div>

        <Separator />

        {/* Items list */}
        <ScrollArea className="flex-1 min-h-0 max-h-[50vh]">
          <div className="space-y-2 pr-4">
            {skippedItems.map((item) => {
              const st = getState(item.rowIndex)
              const isExpanded = expandedRow === item.rowIndex
              const isResolved = st.action === 'resolved' || st.mappedCustomerId || st.mappedProductId

              return (
                <div
                  key={item.rowIndex}
                  className={`border rounded-lg transition-colors ${isResolved ? 'border-green-200 bg-green-50/50 dark:bg-green-950/20' : 'border-border'}`}
                >
                  {/* Row header */}
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 p-3 text-left"
                    onClick={() => setExpandedRow(isExpanded ? null : item.rowIndex)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground">Ligne {item.rowIndex + 1}</span>
                        <Badge
                          variant={item.reason === 'invalid_quantity' ? 'destructive' : 'secondary'}
                          className="text-[10px]"
                        >
                          {REASON_LABELS[item.reason]}
                        </Badge>
                        {isResolved && (
                          <Badge variant="default" className="text-[10px] gap-0.5">
                            <Check className="h-2.5 w-2.5" /> Resolu
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-4 mt-1 text-sm">
                        {needsCustomer(item.reason) && (
                          <span className="font-mono text-amber-600">{item.customerCode || '(vide)'}</span>
                        )}
                        {needsProduct(item.reason) && (
                          <span className="font-mono text-amber-600">{item.cip13 || '(vide)'}</span>
                        )}
                        <span className="text-muted-foreground">Qte: {item.quantity}</span>
                      </div>
                    </div>
                    {isExpanded ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                  </button>

                  {/* Expanded actions */}
                  {isExpanded && !isResolved && item.reason !== 'invalid_quantity' && (
                    <div className="px-3 pb-3 space-y-3 border-t pt-3">
                      {/* Create customer */}
                      {needsCustomer(item.reason) && (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-muted-foreground uppercase">Client "{item.customerCode}"</p>
                          <div className="flex gap-2 items-end">
                            <div className="flex-1 space-y-1">
                              <Label className="text-xs">Nom</Label>
                              <Input
                                value={st.newCustomerName ?? item.customerCode}
                                onChange={(e) => setState(item.rowIndex, { newCustomerName: e.target.value })}
                                placeholder="Nom du client"
                                className="h-8 text-sm"
                              />
                            </div>
                            <div className="w-32 space-y-1">
                              <Label className="text-xs">Pays</Label>
                              <Select value={newCustomerCountry} onValueChange={setNewCustomerCountry}>
                                <SelectTrigger className="h-8 text-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">-</SelectItem>
                                  {COUNTRIES.map((c) => (
                                    <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <Button
                              size="sm"
                              className="gap-1 shrink-0"
                              onClick={() => handleCreateCustomer(item)}
                              disabled={createCustomerMut.isPending}
                            >
                              <UserPlus className="h-3.5 w-3.5" />
                              Créer
                            </Button>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Ou mapper à un client existant</Label>
                            <Input
                              placeholder="Rechercher..."
                              value={customerSearch}
                              onChange={(e) => setCustomerSearch(e.target.value)}
                              className="h-8 text-sm"
                            />
                            {customerSearch && (
                              <div className="border rounded-md max-h-32 overflow-y-auto">
                                {filteredCustomers.map((c) => (
                                  <button
                                    key={c.id}
                                    type="button"
                                    className="w-full text-left px-2 py-1.5 text-sm hover:bg-accent flex items-center gap-2"
                                    onClick={() => {
                                      setState(item.rowIndex, { mappedCustomerId: c.id, action: 'resolved' })
                                      setCustomerSearch('')
                                      toast.success(`Client mappe a "${c.name}"`)
                                    }}
                                  >
                                    <Badge variant="secondary" className="text-[10px] font-mono">{c.code}</Badge>
                                    {c.name}
                                  </button>
                                ))}
                                {filteredCustomers.length === 0 && (
                                  <p className="text-xs text-muted-foreground p-2">Aucun résultat</p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {needsCustomer(item.reason) && needsProduct(item.reason) && <Separator />}

                      {/* Create product */}
                      {needsProduct(item.reason) && (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-muted-foreground uppercase">Produit CIP13 "{item.cip13}"</p>
                          <div className="flex gap-2 items-end">
                            <div className="flex-1 space-y-1">
                              <Label className="text-xs">Nom</Label>
                              <Input
                                value={st.newProductName ?? ''}
                                onChange={(e) => setState(item.rowIndex, { newProductName: e.target.value })}
                                placeholder="Nom du produit"
                                className="h-8 text-sm"
                              />
                            </div>
                            <Button
                              size="sm"
                              className="gap-1 shrink-0"
                              onClick={() => handleCreateProduct(item)}
                              disabled={createProductMut.isPending}
                            >
                              <Package className="h-3.5 w-3.5" />
                              Créer
                            </Button>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Ou mapper à un produit existant</Label>
                            <Input
                              placeholder="Rechercher CIP13 ou nom..."
                              value={productSearch}
                              onChange={(e) => setProductSearch(e.target.value)}
                              className="h-8 text-sm"
                            />
                            {productSearch && (
                              <div className="border rounded-md max-h-32 overflow-y-auto">
                                {filteredProducts.map((p) => (
                                  <button
                                    key={p.id}
                                    type="button"
                                    className="w-full text-left px-2 py-1.5 text-sm hover:bg-accent flex items-center gap-2"
                                    onClick={() => {
                                      setState(item.rowIndex, { mappedProductId: p.id, action: 'resolved' })
                                      setProductSearch('')
                                      toast.success(`Produit mappé à "${p.name}"`)
                                    }}
                                  >
                                    <span className="font-mono text-xs text-muted-foreground">{p.cip13}</span>
                                    <span className="truncate">{p.name}</span>
                                  </button>
                                ))}
                                {filteredProducts.length === 0 && (
                                  <p className="text-xs text-muted-foreground p-2">Aucun résultat</p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Skip button */}
                      <div className="flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1 text-muted-foreground"
                          onClick={() => {
                            setState(item.rowIndex, { action: 'skip' })
                            setExpandedRow(null)
                          }}
                        >
                          <X className="h-3.5 w-3.5" />
                          Ignorer cette ligne
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </ScrollArea>

        <Separator />

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Tout ignorer
          </Button>
          <Button onClick={handleConfirm} className="gap-2">
            <Check className="h-4 w-4" />
            Confirmer ({resolvedCount} recuperees)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Package, Search, ShoppingCart, Plus, Minus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

interface CartItem {
  stockId: string
  productName: string
  quantity: number
  unitPrice: number
  maxQuantity: number
}

export default function PortalStockPage() {
  const { customerId } = useAuth()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [showCart, setShowCart] = useState(false)

  const { data: stock, isLoading } = useQuery({
    queryKey: ['portal-offered-stock'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('offered_stock')
        .select('*, products(name, cip13, pfht)')
        .eq('status', 'available')
        .gt('remaining_quantity', 0)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })

  const claimMutation = useMutation({
    mutationFn: async (items: CartItem[]) => {
      for (const item of items) {
        const { error } = await supabase
          .from('offered_stock_claims')
          .insert({
            offered_stock_id: item.stockId,
            customer_id: customerId,
            quantity: item.quantity,
          })
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-offered-stock'] })
      setCart([])
      setShowCart(false)
      toast.success('Demande envoyee avec succes')
    },
    onError: () => toast.error('Erreur lors de l\'envoi'),
  })

  const addToCart = (item: any) => {
    const existing = cart.find((c) => c.stockId === item.id)
    if (existing) {
      if (existing.quantity >= item.remaining_quantity) {
        toast.info('Quantite maximum atteinte')
        return
      }
      setCart(cart.map((c) => c.stockId === item.id ? { ...c, quantity: c.quantity + 1 } : c))
    } else {
      setCart([...cart, {
        stockId: item.id,
        productName: item.products?.name ?? '-',
        quantity: 1,
        unitPrice: item.unit_price ?? item.products?.pfht ?? 0,
        maxQuantity: item.remaining_quantity,
      }])
    }
    toast.success('Ajoute au panier')
  }

  const updateCartQty = (stockId: string, delta: number) => {
    setCart(cart.map((c) => {
      if (c.stockId !== stockId) return c
      const newQty = c.quantity + delta
      if (newQty <= 0 || newQty > c.maxQuantity) return c
      return { ...c, quantity: newQty }
    }))
  }

  const removeFromCart = (stockId: string) => {
    setCart(cart.filter((c) => c.stockId !== stockId))
  }

  const filtered = (stock ?? []).filter((s: any) => {
    if (!search) return true
    const q = search.toLowerCase()
    return s.products?.name?.toLowerCase().includes(q) || s.products?.cip13?.includes(q)
  })

  const cartTotal = cart.reduce((sum, c) => sum + c.quantity * c.unitPrice, 0)

  return (
    <div className="p-5 md:p-6 space-y-5 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-semibold" style={{ color: 'var(--ivory-text-heading)' }}>Stock offert</h2>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--ivory-text-muted)' }}>
            Produits disponibles a prix reduit. Premier arrive, premier servi.
          </p>
        </div>
        {cart.length > 0 && (
          <Button size="sm" className="gap-1.5 text-[12px]" onClick={() => setShowCart(true)}>
            <ShoppingCart className="h-3.5 w-3.5" />
            Panier ({cart.length})
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
        <Input
          placeholder="Rechercher un produit..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 h-9 text-[12px]"
        />
      </div>

      {/* Stock grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="ivory-card">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Package className="h-10 w-10 mb-3" style={{ color: 'var(--ivory-text-muted)', opacity: 0.3 }} />
            <p className="text-[13px] font-medium" style={{ color: 'var(--ivory-text-heading)' }}>Aucun stock disponible</p>
            <p className="text-[12px] mt-1" style={{ color: 'var(--ivory-text-muted)' }}>
              De nouveaux produits seront proposes apres chaque allocation mensuelle.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((item: any) => {
            const originalPrice = item.products?.pfht ?? 0
            const discountedPrice = item.unit_price ?? originalPrice
            const hasDiscount = item.discount_pct > 0
            const inCart = cart.find((c) => c.stockId === item.id)

            return (
              <Card key={item.id} className="ivory-card hover:shadow-md transition-shadow">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--ivory-text-heading)' }}>
                        {item.products?.name}
                      </p>
                      <p className="text-[11px] font-mono mt-0.5" style={{ color: 'var(--ivory-text-muted)' }}>
                        {item.products?.cip13}
                      </p>
                    </div>
                    {hasDiscount && (
                      <Badge className="text-[10px] bg-green-50 text-green-700 border-green-200">
                        -{item.discount_pct}%
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-baseline gap-2">
                    <span className="text-[16px] font-bold" style={{ color: 'var(--ivory-text-heading)' }}>
                      {Number(discountedPrice).toFixed(2)} EUR
                    </span>
                    {hasDiscount && (
                      <span className="text-[12px] line-through" style={{ color: 'var(--ivory-text-muted)' }}>
                        {Number(originalPrice).toFixed(2)} EUR
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--ivory-text-muted)' }}>
                    <span>Dispo: <strong>{item.remaining_quantity}</strong> unites</span>
                    {item.expiry_date && (
                      <span>Exp: {new Date(item.expiry_date).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })}</span>
                    )}
                  </div>

                  <Button
                    size="sm"
                    className="w-full h-8 text-[12px] gap-1.5"
                    variant={inCart ? 'secondary' : 'default'}
                    onClick={() => addToCart(item)}
                  >
                    <ShoppingCart className="h-3.5 w-3.5" />
                    {inCart ? `Dans le panier (${inCart.quantity})` : 'Ajouter au panier'}
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Cart dialog */}
      <Dialog open={showCart} onOpenChange={setShowCart}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-[15px] flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              Mon panier
            </DialogTitle>
          </DialogHeader>

          {cart.length === 0 ? (
            <p className="text-[12px] text-center py-6" style={{ color: 'var(--ivory-text-muted)' }}>Panier vide</p>
          ) : (
            <div className="space-y-3">
              {cart.map((item) => (
                <div key={item.stockId} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'rgba(0,0,0,0.02)' }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium truncate" style={{ color: 'var(--ivory-text-heading)' }}>{item.productName}</p>
                    <p className="text-[11px]" style={{ color: 'var(--ivory-text-muted)' }}>
                      {Number(item.unitPrice).toFixed(2)} EUR x {item.quantity} = {(item.unitPrice * item.quantity).toFixed(2)} EUR
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => updateCartQty(item.stockId, -1)}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="text-[12px] font-bold w-6 text-center">{item.quantity}</span>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => updateCartQty(item.stockId, 1)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => removeFromCart(item.stockId)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}

              <div className="flex items-center justify-between pt-2 border-t text-[13px] font-semibold">
                <span>Total</span>
                <span>{cartTotal.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</span>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowCart(false)}>Fermer</Button>
            <Button
              size="sm"
              disabled={cart.length === 0 || claimMutation.isPending}
              onClick={() => claimMutation.mutate(cart)}
            >
              {claimMutation.isPending ? 'Envoi...' : 'Confirmer la demande'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

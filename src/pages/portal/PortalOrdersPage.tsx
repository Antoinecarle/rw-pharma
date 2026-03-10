import { useState, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ShoppingCart, Search, Upload, Package, TrendingUp, Clock, FileSpreadsheet, CheckCircle, AlertTriangle, X, Pencil, Check } from 'lucide-react'
import { toast } from 'sonner'

const statusLabels: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: 'En attente', variant: 'outline' },
  validated: { label: 'Validee', variant: 'default' },
  rejected: { label: 'Rejetee', variant: 'destructive' },
  allocated: { label: 'Allouee', variant: 'secondary' },
}

interface ParsedOrderLine {
  cip13: string
  quantity: number
  unitPrice: number | null
  productName?: string
  productId?: string
  valid: boolean
  error?: string
}

function parseOrderFile(wb: XLSX.WorkBook): { headers: string[]; rows: Record<string, string>[] } {
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) throw new Error('Fichier vide')
  const json = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { header: 'A', defval: '' })
  if (json.length < 2) throw new Error('Fichier vide ou sans donnees')
  const headers = Object.values(json[0])
  const rows = json.slice(1).map(row => {
    const mapped: Record<string, string> = {}
    const keys = Object.keys(row)
    keys.forEach((k, i) => { mapped[headers[i] ?? k] = String(row[k] ?? '') })
    return mapped
  })
  return { headers, rows }
}

function detectColumn(headers: string[], patterns: RegExp[]): string | null {
  for (const h of headers) {
    for (const p of patterns) {
      if (p.test(h.toLowerCase())) return h
    }
  }
  return null
}

export default function PortalOrdersPage() {
  const { customerId } = useAuth()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [parsedLines, setParsedLines] = useState<ParsedOrderLine[]>([])
  const [fileName, setFileName] = useState('')

  const { data: orders, isLoading } = useQuery({
    queryKey: ['portal-orders', customerId],
    queryFn: async () => {
      if (!customerId) return []
      const { data, error } = await supabase
        .from('orders')
        .select('*, products(name, cip13)')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!customerId,
  })

  const { data: currentProcess } = useQuery({
    queryKey: ['portal-current-process'],
    queryFn: async () => {
      const { data } = await supabase
        .from('monthly_processes')
        .select('id, month, year, status')
        .neq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return data
    },
  })

  // Product lookup for validation
  const { data: allProducts } = useQuery({
    queryKey: ['products', 'portal-lookup'],
    queryFn: async () => {
      const all: { id: string; cip13: string; name: string }[] = []
      let from = 0
      const pageSize = 500
      while (true) {
        const { data, error } = await supabase
          .from('products')
          .select('id, cip13, name')
          .range(from, from + pageSize - 1)
        if (error) throw error
        if (!data || data.length === 0) break
        all.push(...data)
        if (data.length < pageSize) break
        from += pageSize
      }
      return new Map(all.map(p => [p.cip13, p]))
    },
  })

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)

    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer)
      const { headers, rows } = parseOrderFile(wb)

      // Auto-detect columns
      const cipCol = detectColumn(headers, [/cip\s*13/, /cip/, /code.*prod/, /ean/])
      const qtyCol = detectColumn(headers, [/quant/, /qty/, /qte/, /nb/, /nombre/])
      const priceCol = detectColumn(headers, [/prix/, /price/, /pu/, /unit.*price/, /pfht/])

      if (!cipCol) { toast.error('Colonne CIP13 non trouvee. Verifiez le fichier.'); return }
      if (!qtyCol) { toast.error('Colonne Quantite non trouvee. Verifiez le fichier.'); return }

      const lines: ParsedOrderLine[] = rows
        .filter(r => r[cipCol]?.trim())
        .map(r => {
          const rawCip = String(r[cipCol] ?? '').replace(/\s/g, '').replace(/^'/, '')
          const cip13 = rawCip.length === 7 ? rawCip : rawCip.length === 13 ? rawCip : rawCip
          const qty = parseInt(String(r[qtyCol] ?? '0').replace(/\s/g, ''), 10)
          const price = priceCol ? parseFloat(String(r[priceCol] ?? '').replace(',', '.').replace(/\s/g, '')) : null

          const product = allProducts?.get(cip13)
          const valid = !!product && qty > 0

          return {
            cip13,
            quantity: isNaN(qty) ? 0 : qty,
            unitPrice: price && !isNaN(price) ? price : null,
            productName: product?.name,
            productId: product?.id,
            valid,
            error: !product ? 'CIP13 inconnu' : qty <= 0 ? 'Quantite invalide' : undefined,
          }
        })

      setParsedLines(lines)
      setUploadDialogOpen(true)
    } catch (err) {
      toast.error(`Erreur lecture fichier: ${(err as Error).message}`)
    }

    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [allProducts])

  const submitMut = useMutation({
    mutationFn: async () => {
      if (!customerId || !currentProcess) throw new Error('Aucun processus actif')
      const validLines = parsedLines.filter(l => l.valid && l.productId)
      if (validLines.length === 0) throw new Error('Aucune ligne valide')

      const ordersToInsert = validLines.map(l => ({
        monthly_process_id: currentProcess.id,
        customer_id: customerId,
        product_id: l.productId!,
        quantity: l.quantity,
        unit_price: l.unitPrice,
        status: 'pending',
        source: 'portal',
      }))

      const batchSize = 100
      let total = 0
      for (let i = 0; i < ordersToInsert.length; i += batchSize) {
        const batch = ordersToInsert.slice(i, i + batchSize)
        const { error, data } = await supabase.from('orders').insert(batch).select('id')
        if (error) throw error
        total += data?.length ?? batch.length
      }

      // Update process orders count
      const { count } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('monthly_process_id', currentProcess.id)
      if (count != null) {
        await supabase.from('monthly_processes')
          .update({ orders_count: count })
          .eq('id', currentProcess.id)
      }

      return total
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['portal-orders'] })
      toast.success(`${count} lignes de commande deposees`)
      setUploadDialogOpen(false)
      setParsedLines([])
    },
    onError: (err: Error) => toast.error(err.message),
  })

  // Inline editing state
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null)
  const [editQty, setEditQty] = useState<number>(0)
  const [editPrice, setEditPrice] = useState<string>('')

  const startEditing = (order: any) => {
    setEditingOrderId(order.id)
    setEditQty(order.quantity)
    setEditPrice(order.unit_price != null ? String(order.unit_price) : '')
  }

  const cancelEditing = () => {
    setEditingOrderId(null)
    setEditQty(0)
    setEditPrice('')
  }

  const updateOrderMut = useMutation({
    mutationFn: async ({ orderId, quantity, unit_price }: { orderId: string; quantity: number; unit_price: number | null }) => {
      const { error } = await supabase
        .from('orders')
        .update({ quantity, unit_price })
        .eq('id', orderId)
        .eq('customer_id', customerId!)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-orders'] })
      toast.success('Commande mise a jour')
      cancelEditing()
    },
    onError: (err: Error) => toast.error(`Erreur: ${err.message}`),
  })

  const handleSaveEdit = () => {
    if (!editingOrderId || editQty <= 0) {
      toast.error('La quantite doit etre superieure a 0')
      return
    }
    const parsedPrice = editPrice.trim() ? parseFloat(editPrice.replace(',', '.')) : null
    if (parsedPrice !== null && isNaN(parsedPrice)) {
      toast.error('Prix unitaire invalide')
      return
    }
    updateOrderMut.mutate({ orderId: editingOrderId, quantity: editQty, unit_price: parsedPrice })
  }

  const canEditOrder = (order: any) => {
    return order.status === 'pending' && currentProcess && order.monthly_process_id === currentProcess.id
  }

  const filteredOrders = (orders ?? []).filter((o: any) => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      o.products?.name?.toLowerCase().includes(s) ||
      o.products?.cip13?.includes(s)
    )
  })

  const totalQty = filteredOrders.reduce((sum: number, o: any) => sum + (o.quantity || 0), 0)
  const totalValue = filteredOrders.reduce((sum: number, o: any) => sum + (o.quantity || 0) * (o.unit_price || 0), 0)
  const validCount = parsedLines.filter(l => l.valid).length
  const invalidCount = parsedLines.filter(l => !l.valid).length

  return (
    <div className="p-5 md:p-6 space-y-5 max-w-6xl">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="ivory-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(13,148,136,0.08)' }}>
              <ShoppingCart className="h-4.5 w-4.5" style={{ color: 'var(--ivory-accent)' }} />
            </div>
            <div>
              <p className="text-[11px] font-medium" style={{ color: 'var(--ivory-text-muted)' }}>Lignes de commande</p>
              <p className="text-lg font-bold" style={{ color: 'var(--ivory-text-heading)' }}>{filteredOrders.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="ivory-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.08)' }}>
              <Package className="h-4.5 w-4.5 text-blue-500" />
            </div>
            <div>
              <p className="text-[11px] font-medium" style={{ color: 'var(--ivory-text-muted)' }}>Quantite totale</p>
              <p className="text-lg font-bold" style={{ color: 'var(--ivory-text-heading)' }}>{totalQty.toLocaleString('fr-FR')}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="ivory-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(234,179,8,0.08)' }}>
              <TrendingUp className="h-4.5 w-4.5 text-yellow-500" />
            </div>
            <div>
              <p className="text-[11px] font-medium" style={{ color: 'var(--ivory-text-muted)' }}>Valeur estimee</p>
              <p className="text-lg font-bold" style={{ color: 'var(--ivory-text-heading)' }}>
                {totalValue.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Current month info */}
      {currentProcess && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px]" style={{ background: 'rgba(13,148,136,0.04)', border: '1px solid rgba(13,148,136,0.1)' }}>
          <Clock className="h-3.5 w-3.5" style={{ color: 'var(--ivory-accent)' }} />
          <span style={{ color: 'var(--ivory-text-heading)' }}>
            Mois en cours : <strong>{new Date(currentProcess.year, currentProcess.month - 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</strong>
          </span>
          <Badge variant="outline" className="ml-2 text-[10px]">{currentProcess.status}</Badge>
        </div>
      )}

      {/* Orders table */}
      <Card className="ivory-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-[15px]">Mes commandes</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
                <Input
                  placeholder="Rechercher..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-8 text-[12px] w-[200px]"
                />
              </div>
              <Button
                size="sm"
                className="h-8 text-[12px] gap-1.5"
                onClick={() => fileInputRef.current?.click()}
                disabled={!currentProcess}
              >
                <Upload className="h-3.5 w-3.5" />
                Deposer un fichier
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ShoppingCart className="h-10 w-10 mb-3" style={{ color: 'var(--ivory-text-muted)', opacity: 0.3 }} />
              <p className="text-[13px] font-medium" style={{ color: 'var(--ivory-text-heading)' }}>Aucune commande</p>
              <p className="text-[12px] mt-1" style={{ color: 'var(--ivory-text-muted)' }}>
                Vos commandes apparaitront ici une fois deposees.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[11px]">Produit</TableHead>
                    <TableHead className="text-[11px]">CIP13</TableHead>
                    <TableHead className="text-[11px] text-right">Quantite</TableHead>
                    <TableHead className="text-[11px] text-right">Prix unitaire</TableHead>
                    <TableHead className="text-[11px]">Statut</TableHead>
                    <TableHead className="text-[11px]">Date</TableHead>
                    <TableHead className="text-[11px] w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order: any) => {
                    const status = statusLabels[order.status] ?? statusLabels.pending
                    const isEditing = editingOrderId === order.id
                    const editable = canEditOrder(order)
                    return (
                      <TableRow key={order.id}>
                        <TableCell className="text-[12px] font-medium max-w-[250px] truncate">
                          {order.products?.name ?? '-'}
                        </TableCell>
                        <TableCell className="text-[12px] font-mono">{order.products?.cip13 ?? '-'}</TableCell>
                        <TableCell className="text-[12px] text-right font-medium">
                          {isEditing ? (
                            <Input
                              type="number"
                              min={1}
                              value={editQty}
                              onChange={(e) => setEditQty(parseInt(e.target.value, 10) || 0)}
                              className="h-7 w-[90px] text-[12px] text-right ml-auto"
                            />
                          ) : (
                            order.quantity?.toLocaleString('fr-FR')
                          )}
                        </TableCell>
                        <TableCell className="text-[12px] text-right">
                          {isEditing ? (
                            <Input
                              type="text"
                              inputMode="decimal"
                              value={editPrice}
                              onChange={(e) => setEditPrice(e.target.value)}
                              placeholder="0.00"
                              className="h-7 w-[90px] text-[12px] text-right ml-auto"
                            />
                          ) : (
                            order.unit_price ? `${Number(order.unit_price).toFixed(2)} EUR` : '-'
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant={status.variant} className="text-[10px]">{status.label}</Badge>
                        </TableCell>
                        <TableCell className="text-[12px]" style={{ color: 'var(--ivory-text-muted)' }}>
                          {new Date(order.created_at).toLocaleDateString('fr-FR')}
                        </TableCell>
                        <TableCell>
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={handleSaveEdit}
                                disabled={updateOrderMut.isPending}
                              >
                                <Check className="h-3.5 w-3.5 text-green-600" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={cancelEditing}
                                disabled={updateOrderMut.isPending}
                              >
                                <X className="h-3.5 w-3.5 text-red-500" />
                              </Button>
                            </div>
                          ) : editable ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => startEditing(order)}
                            >
                              <Pencil className="h-3.5 w-3.5" style={{ color: 'var(--ivory-text-muted)' }} />
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload preview dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              Apercu du fichier
            </DialogTitle>
            <DialogDescription>
              {fileName} — {parsedLines.length} lignes detectees
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-3 py-2">
            <Badge variant="default" className="gap-1 text-xs">
              <CheckCircle className="h-3 w-3" />
              {validCount} valides
            </Badge>
            {invalidCount > 0 && (
              <Badge variant="destructive" className="gap-1 text-xs">
                <AlertTriangle className="h-3 w-3" />
                {invalidCount} erreurs
              </Badge>
            )}
          </div>

          <div className="border rounded-lg overflow-auto flex-1 max-h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs w-8">#</TableHead>
                  <TableHead className="text-xs">CIP13</TableHead>
                  <TableHead className="text-xs">Produit</TableHead>
                  <TableHead className="text-xs text-right">Quantite</TableHead>
                  <TableHead className="text-xs text-right">Prix</TableHead>
                  <TableHead className="text-xs">Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parsedLines.map((line, i) => (
                  <TableRow key={i} className={!line.valid ? 'bg-red-50/50 dark:bg-red-950/10' : ''}>
                    <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="text-xs font-mono">{line.cip13}</TableCell>
                    <TableCell className="text-xs truncate max-w-[200px]">{line.productName ?? '-'}</TableCell>
                    <TableCell className="text-xs text-right tabular-nums">{line.quantity.toLocaleString('fr-FR')}</TableCell>
                    <TableCell className="text-xs text-right tabular-nums">{line.unitPrice?.toFixed(2) ?? '-'}</TableCell>
                    <TableCell>
                      {line.valid ? (
                        <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] text-red-600">
                          <X className="h-3 w-3" /> {line.error}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {!currentProcess && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 text-amber-700 text-xs">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Aucun processus mensuel actif. Contactez Julie pour demarrer un nouveau mois.
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>Annuler</Button>
            <Button
              onClick={() => submitMut.mutate()}
              disabled={validCount === 0 || !currentProcess || submitMut.isPending}
              className="gap-2"
            >
              <Upload className="h-4 w-4" />
              {submitMut.isPending ? 'Envoi...' : `Deposer ${validCount} commandes`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

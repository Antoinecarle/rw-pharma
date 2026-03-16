import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Download, ArrowRight, Package, Warehouse, FileSpreadsheet,
  Check, Pencil, AlertTriangle, CalendarPlus,
} from 'lucide-react'
import { toast } from 'sonner'
import type { MonthlyProcess, Order, Wholesaler } from '@/types/database'

// --------------- Types ---------------

interface ReExportItem {
  orderId: string
  productId: string
  productName: string
  cip13: string
  customerId: string
  customerCode: string
  quantity: number
  unitPrice: number | null
  negoOriginalQty: number | null
  negoOriginalPrice: number | null
  negoComment: string | null
  negoUpdatedAt: string | null
  createdAt: string
  isQtyModified: boolean
  isPriceModified: boolean
  isNewOrder: boolean
}

interface WholesalerGroup {
  wholesalerId: string
  wholesalerCode: string
  wholesalerName: string
  items: ReExportItem[]
  totalQuantity: number
  modifiedCount: number
  newOrderCount: number
}

interface ReExportStepProps {
  process: MonthlyProcess
  onNext: () => void
}

// --------------- Component ---------------

export default function ReExportStep({ process, onNext }: ReExportStepProps) {
  const [exportedWholesalers, setExportedWholesalers] = useState<Set<string>>(new Set())

  const { data: wholesalerGroups, isLoading } = useQuery({
    queryKey: ['re-export', process.id],
    queryFn: async () => {
      // 1. Fetch all non-rejected orders with joins
      const allOrders: Order[] = []
      let from = 0
      const pageSize = 500
      while (true) {
        const { data, error } = await supabase
          .from('orders')
          .select('*, customer:customers(id, name, code), product:products(id, cip13, name)')
          .eq('monthly_process_id', process.id)
          .neq('status', 'rejected')
          .order('created_at', { ascending: false })
          .range(from, from + pageSize - 1)
        if (error) throw error
        if (!data || data.length === 0) break
        allOrders.push(...(data as unknown as Order[]))
        if (data.length < pageSize) break
        from += pageSize
      }

      if (allOrders.length === 0) return []

      // 2. Fetch wholesaler quotas for this month to know which product → which wholesaler
      const monthDate = `${process.year}-${String(process.month).padStart(2, '0')}-01`
      const { data: quotas, error: qErr } = await supabase
        .from('wholesaler_quotas')
        .select('wholesaler_id, product_id, quota_quantity, extra_available')
        .eq('month', monthDate)
      if (qErr) throw qErr

      if (!quotas || quotas.length === 0) return []

      // Build product → wholesalers map (a product may have multiple wholesalers)
      const productToWholesalers = new Map<string, Set<string>>()
      for (const q of quotas) {
        const total = (q.quota_quantity ?? 0) + (q.extra_available ?? 0)
        if (total <= 0) continue
        const existing = productToWholesalers.get(q.product_id)
        if (existing) existing.add(q.wholesaler_id)
        else productToWholesalers.set(q.product_id, new Set([q.wholesaler_id]))
      }

      // 3. Fetch wholesalers
      const { data: wholesalers } = await supabase.from('wholesalers').select('id, code, name')
      const wsMap = new Map((wholesalers ?? []).map((w) => [w.id, w as Wholesaler]))

      // 4. Determine "new order" threshold: orders created after negotiation started
      // Use the earliest nego_updated_at as the start of negotiation
      const negoStartDates = allOrders
        .filter(o => o.nego_updated_at)
        .map(o => new Date(o.nego_updated_at!).getTime())
      const negoStart = negoStartDates.length > 0 ? Math.min(...negoStartDates) : null

      // 5. Build groups per wholesaler
      const groupMap = new Map<string, WholesalerGroup>()

      for (const order of allOrders) {
        const wholesalerIds = productToWholesalers.get(order.product_id)
        if (!wholesalerIds || wholesalerIds.size === 0) continue

        const cust = order.customer as unknown as { code: string } | undefined
        const prod = order.product as unknown as { cip13: string; name: string } | undefined

        const isQtyModified = order.nego_original_qty != null && order.quantity !== order.nego_original_qty
        const isPriceModified = order.nego_original_price != null && order.unit_price !== order.nego_original_price
        const isNewOrder = negoStart != null && new Date(order.created_at).getTime() > negoStart

        const item: ReExportItem = {
          orderId: order.id,
          productId: order.product_id,
          productName: prod?.name ?? '?',
          cip13: prod?.cip13 ?? '?',
          customerId: order.customer_id,
          customerCode: cust?.code ?? '?',
          quantity: order.quantity,
          unitPrice: order.unit_price,
          negoOriginalQty: order.nego_original_qty,
          negoOriginalPrice: order.nego_original_price,
          negoComment: order.nego_comment,
          negoUpdatedAt: order.nego_updated_at,
          createdAt: order.created_at,
          isQtyModified,
          isPriceModified,
          isNewOrder,
        }

        // Assign order to each relevant wholesaler
        for (const wsId of wholesalerIds) {
          if (!groupMap.has(wsId)) {
            const ws = wsMap.get(wsId)
            groupMap.set(wsId, {
              wholesalerId: wsId,
              wholesalerCode: ws?.code ?? '?',
              wholesalerName: ws?.name ?? '?',
              items: [],
              totalQuantity: 0,
              modifiedCount: 0,
              newOrderCount: 0,
            })
          }
          const group = groupMap.get(wsId)!
          group.items.push(item)
          group.totalQuantity += item.quantity
          if (isQtyModified || isPriceModified) group.modifiedCount++
          if (isNewOrder) group.newOrderCount++
        }
      }

      // Sort items within each group by modified first, then by product name
      for (const group of groupMap.values()) {
        group.items.sort((a, b) => {
          const aModified = a.isQtyModified || a.isPriceModified || a.isNewOrder ? 1 : 0
          const bModified = b.isQtyModified || b.isPriceModified || b.isNewOrder ? 1 : 0
          if (bModified !== aModified) return bModified - aModified
          return a.productName.localeCompare(b.productName)
        })
      }

      return [...groupMap.values()].sort((a, b) => b.totalQuantity - a.totalQuantity)
    },
  })

  // ── Export handlers ──

  const handleExportExcel = (ws: WholesalerGroup) => {
    const rows = ws.items.map(item => {
      const row: Record<string, unknown> = {
        'CIP13': item.cip13,
        'Produit': item.productName,
        'Client': item.customerCode,
        'Quantite': item.quantity,
        'Prix unitaire': item.unitPrice != null ? item.unitPrice : '',
      }
      if (item.isQtyModified) {
        row['Qty originale'] = item.negoOriginalQty
        row['Diff qty'] = item.quantity - (item.negoOriginalQty ?? 0)
      } else {
        row['Qty originale'] = ''
        row['Diff qty'] = ''
      }
      if (item.isPriceModified) {
        row['Prix original'] = item.negoOriginalPrice
      } else {
        row['Prix original'] = ''
      }
      row['Commentaire nego'] = item.negoComment ?? ''
      row['Date ajout'] = item.isNewOrder ? new Date(item.createdAt).toLocaleDateString('fr-FR') : ''
      row['Modifie'] = item.isQtyModified || item.isPriceModified ? 'OUI' : ''
      return row
    })

    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Re-Export')

    worksheet['!cols'] = [
      { wch: 16 }, // CIP13
      { wch: 40 }, // Produit
      { wch: 10 }, // Client
      { wch: 12 }, // Quantite
      { wch: 14 }, // Prix unitaire
      { wch: 14 }, // Qty originale
      { wch: 10 }, // Diff qty
      { wch: 14 }, // Prix original
      { wch: 30 }, // Commentaire
      { wch: 12 }, // Date ajout
      { wch: 10 }, // Modifie
    ]

    const monthStr = `${process.year}-${String(process.month).padStart(2, '0')}`
    const filename = `re-export_${ws.wholesalerCode}_${monthStr}.xlsx`
    XLSX.writeFile(workbook, filename)

    setExportedWholesalers(prev => new Set([...prev, ws.wholesalerId]))
    toast.success(`Re-export ${ws.wholesalerCode} telecharge`)
  }

  const handleExportCSV = (ws: WholesalerGroup) => {
    const header = ['CIP13', 'Produit', 'Client', 'Quantite', 'Prix', 'Qty orig', 'Prix orig', 'Commentaire', 'Modifie']
    const csvRows = [header.join(';')]

    for (const item of ws.items) {
      csvRows.push([
        item.cip13,
        `"${item.productName.replace(/"/g, '""')}"`,
        item.customerCode,
        item.quantity,
        item.unitPrice ?? '',
        item.negoOriginalQty ?? '',
        item.negoOriginalPrice ?? '',
        `"${(item.negoComment ?? '').replace(/"/g, '""')}"`,
        item.isQtyModified || item.isPriceModified ? 'OUI' : '',
      ].join(';'))
    }

    const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const monthStr = `${process.year}-${String(process.month).padStart(2, '0')}`
    a.href = url
    a.download = `re-export_${ws.wholesalerCode}_${monthStr}.csv`
    a.click()
    URL.revokeObjectURL(url)

    setExportedWholesalers(prev => new Set([...prev, ws.wholesalerId]))
    toast.success(`Re-export CSV ${ws.wholesalerCode} telecharge`)
  }

  const handleExportAll = () => {
    if (!wholesalerGroups) return
    for (const ws of wholesalerGroups) {
      handleExportExcel(ws)
    }
  }

  // ── Render ──

  const allExported = wholesalerGroups && wholesalerGroups.length > 0 && wholesalerGroups.every(ws => exportedWholesalers.has(ws.wholesalerId))
  const totalModified = wholesalerGroups?.reduce((s, ws) => s + ws.modifiedCount, 0) ?? 0
  const totalNewOrders = wholesalerGroups?.reduce((s, ws) => s + ws.newOrderCount, 0) ?? 0

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Re-Export apres Negociation</h3>
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 bg-muted rounded-xl" />)}
        </div>
      </div>
    )
  }

  if (!wholesalerGroups || wholesalerGroups.length === 0) {
    return (
      <div className="space-y-5">
        <div>
          <h3 className="text-lg font-semibold">Re-Export apres Negociation</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Aucun besoin grossiste a re-exporter. Verifiez que les quotas et commandes sont correctement configures.
          </p>
        </div>
        <div className="flex justify-end">
          <Button variant="outline" onClick={onNext}>
            Passer <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    )
  }

  const totalProducts = new Set(wholesalerGroups.flatMap(ws => ws.items.map(i => i.productId))).size
  const totalQty = wholesalerGroups.reduce((s, ws) => s + ws.totalQuantity, 0)

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold">Re-Export apres Negociation</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Fichiers de besoins mis a jour avec les ajustements de negociation. Les lignes modifiees sont mises en evidence.
        </p>
      </div>

      {/* Summary */}
      <Card className="ivory-card-highlight">
        <CardContent className="p-4 flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <Warehouse className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm"><strong>{wholesalerGroups.length}</strong> grossistes</span>
          </div>
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm"><strong>{totalProducts}</strong> produits</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm"><strong>{totalQty.toLocaleString('fr-FR')}</strong> u. totales</span>
          </div>
          {totalModified > 0 && (
            <div className="flex items-center gap-1.5 text-blue-600">
              <Pencil className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">{totalModified} lignes modifiees</span>
            </div>
          )}
          {totalNewOrders > 0 && (
            <div className="flex items-center gap-1.5 text-purple-600">
              <CalendarPlus className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">{totalNewOrders} ajouts nego</span>
            </div>
          )}
          <div className="ml-auto">
            <Button variant="outline" size="sm" onClick={handleExportAll} className="gap-1.5">
              <Download className="h-3.5 w-3.5" /> Tout exporter
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Per-wholesaler cards */}
      <div className="space-y-3">
        {wholesalerGroups.map(ws => {
          const isExported = exportedWholesalers.has(ws.wholesalerId)
          return (
            <Card key={ws.wholesalerId} className={isExported ? 'border-green-200 bg-green-50/30 dark:bg-green-950/20' : ''}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                    isExported ? 'bg-green-100 dark:bg-green-900' : 'bg-muted'
                  }`}>
                    {isExported
                      ? <Check className="h-4 w-4 text-green-600" />
                      : <Warehouse className="h-4 w-4 text-muted-foreground" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{ws.wholesalerCode}</span>
                      <span className="text-sm text-muted-foreground">— {ws.wholesalerName}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      <span>{ws.items.length} lignes</span>
                      <span>{ws.totalQuantity.toLocaleString('fr-FR')} u.</span>
                      {ws.modifiedCount > 0 && (
                        <span className="text-blue-600 font-medium">{ws.modifiedCount} modifiees</span>
                      )}
                      {ws.newOrderCount > 0 && (
                        <span className="text-purple-600 font-medium">{ws.newOrderCount} ajouts</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => handleExportCSV(ws)}
                    >
                      <Download className="h-3.5 w-3.5" /> CSV
                    </Button>
                    <Button
                      variant={isExported ? 'outline' : 'default'}
                      size="sm"
                      className="gap-1.5"
                      onClick={() => handleExportExcel(ws)}
                    >
                      {isExported ? <FileSpreadsheet className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
                      {isExported ? 'Re-telecharger' : 'Excel'}
                    </Button>
                  </div>
                </div>

                {/* Items preview table */}
                <div className="border rounded-xl overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">CIP13</TableHead>
                        <TableHead className="text-xs">Produit</TableHead>
                        <TableHead className="text-xs">Client</TableHead>
                        <TableHead className="text-xs text-right">Quantite</TableHead>
                        <TableHead className="text-xs text-right">Prix</TableHead>
                        <TableHead className="text-xs">Date d'ajout</TableHead>
                        <TableHead className="text-xs w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ws.items.slice(0, 8).map(item => {
                        const isHighlighted = item.isQtyModified || item.isPriceModified
                        return (
                          <TableRow
                            key={`${item.orderId}-${ws.wholesalerId}`}
                            className={`${
                              isHighlighted
                                ? 'bg-blue-50/50 dark:bg-blue-950/15'
                                : item.isNewOrder
                                  ? 'bg-purple-50/40 dark:bg-purple-950/10'
                                  : ''
                            }`}
                          >
                            <TableCell className="font-mono text-xs">{item.cip13}</TableCell>
                            <TableCell className="text-xs truncate max-w-[180px]">{item.productName}</TableCell>
                            <TableCell className="font-mono text-xs font-medium">{item.customerCode}</TableCell>
                            <TableCell className="text-right">
                              <span className={`tabular-nums text-xs ${item.isQtyModified ? 'font-semibold text-blue-700' : ''}`}>
                                {item.quantity.toLocaleString('fr-FR')}
                              </span>
                              {item.isQtyModified && item.negoOriginalQty != null && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="ml-1 text-[10px] text-blue-400 line-through">
                                      {item.negoOriginalQty.toLocaleString('fr-FR')}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    Avant nego: {item.negoOriginalQty.toLocaleString('fr-FR')} →
                                    Apres: {item.quantity.toLocaleString('fr-FR')}
                                    ({item.quantity > item.negoOriginalQty ? '+' : ''}{item.quantity - item.negoOriginalQty})
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <span className={`tabular-nums text-xs ${item.isPriceModified ? 'font-semibold text-blue-700' : 'text-muted-foreground'}`}>
                                {item.unitPrice != null ? `${item.unitPrice.toFixed(2)}` : '-'}
                              </span>
                              {item.isPriceModified && item.negoOriginalPrice != null && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="ml-1 text-[10px] text-blue-400 line-through">
                                      {item.negoOriginalPrice.toFixed(2)}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    Prix avant nego: {item.negoOriginalPrice.toFixed(2)} EUR
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {item.isNewOrder && (
                                <Badge variant="outline" className="text-[9px] gap-0.5 text-purple-600 border-purple-200 bg-purple-50">
                                  <CalendarPlus className="h-2.5 w-2.5" />
                                  {new Date(item.createdAt).toLocaleDateString('fr-FR')}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {isHighlighted && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-flex items-center justify-center h-5 w-5 rounded bg-blue-100 text-blue-700 border border-blue-200">
                                      <Pencil className="h-3 w-3" />
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {item.isQtyModified && item.isPriceModified
                                      ? 'Quantite et prix modifies'
                                      : item.isQtyModified
                                        ? 'Quantite modifiee'
                                        : 'Prix modifie'}
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              {item.isNewOrder && !isHighlighted && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-flex items-center justify-center h-5 w-5 rounded bg-purple-100 text-purple-700 border border-purple-200">
                                      <CalendarPlus className="h-3 w-3" />
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>Ajoute pendant la negociation</TooltipContent>
                                </Tooltip>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                      {ws.items.length > 8 && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-xs text-muted-foreground text-center py-2">
                            + {ws.items.length - 8} autres lignes
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Modification summary for this wholesaler */}
                {(ws.modifiedCount > 0 || ws.newOrderCount > 0) && (
                  <div className="mt-2 flex items-center gap-3 text-xs">
                    {ws.modifiedCount > 0 && (
                      <div className="flex items-center gap-1 text-blue-600">
                        <Pencil className="h-3 w-3" />
                        <span>{ws.modifiedCount} modif. nego</span>
                      </div>
                    )}
                    {ws.newOrderCount > 0 && (
                      <div className="flex items-center gap-1 text-purple-600">
                        <CalendarPlus className="h-3 w-3" />
                        <span>{ws.newOrderCount} ajouts</span>
                      </div>
                    )}
                    {ws.modifiedCount === 0 && ws.newOrderCount === 0 && (
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <AlertTriangle className="h-3 w-3" />
                        <span>Aucune modification</span>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Export status + Next */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {exportedWholesalers.size > 0 && (
            <Badge variant="secondary" className="gap-1">
              <FileSpreadsheet className="h-3 w-3" />
              {exportedWholesalers.size}/{wholesalerGroups.length} exportes
            </Badge>
          )}
        </div>
        <Button onClick={onNext} className="gap-2">
          {allExported ? 'Passer a la collecte' : 'Passer a l\'etape suivante'} <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

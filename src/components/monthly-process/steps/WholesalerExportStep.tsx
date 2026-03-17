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
import { Download, Send, ArrowRight, Package, Warehouse, FileSpreadsheet, Check, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import type { MonthlyProcess } from '@/types/database'

// --------------- Types ---------------

interface WholesalerNeed {
  wholesalerId: string
  wholesalerCode: string
  wholesalerName: string
  items: {
    productId: string
    productName: string
    cip13: string
    quotaQuantity: number
    extraAvailable: number
    totalDemand: number
    toCollect: number
    customerCount: number
  }[]
  totalToCollect: number
  totalProducts: number
}

interface WholesalerExportStepProps {
  process: MonthlyProcess
  onNext: () => void
}

export default function WholesalerExportStep({ process, onNext }: WholesalerExportStepProps) {
  const [exportedWholesalers, setExportedWholesalers] = useState<Set<string>>(new Set())

  const { data: needs, isLoading } = useQuery({
    queryKey: ['wholesaler-needs', process.id],
    queryFn: async () => {
      // 1. Fetch validated orders for this process (paginated)
      const allOrders: {
        product_id: string
        customer_id: string
        quantity: number
      }[] = []
      let from = 0
      const pageSize = 500
      while (true) {
        const { data, error } = await supabase
          .from('orders')
          .select('product_id, customer_id, quantity')
          .eq('monthly_process_id', process.id)
          .neq('status', 'rejected')
          .range(from, from + pageSize - 1)
        if (error) throw error
        if (!data || data.length === 0) break
        allOrders.push(...data)
        if (data.length < pageSize) break
        from += pageSize
      }

      if (allOrders.length === 0) return []

      // 2. Aggregate demand per product
      const demandByProduct = new Map<string, { totalQty: number; customers: Set<string> }>()
      for (const o of allOrders) {
        const existing = demandByProduct.get(o.product_id)
        if (existing) {
          existing.totalQty += o.quantity
          existing.customers.add(o.customer_id)
        } else {
          demandByProduct.set(o.product_id, { totalQty: o.quantity, customers: new Set([o.customer_id]) })
        }
      }

      // 3. Fetch wholesaler quotas for this month
      const monthDate = `${process.year}-${String(process.month).padStart(2, '0')}-01`
      const { data: quotas, error: qErr } = await supabase
        .from('wholesaler_quotas')
        .select('wholesaler_id, product_id, quota_quantity, extra_available')
        .eq('month', monthDate)
      if (qErr) throw qErr

      if (!quotas || quotas.length === 0) return []

      // 4. Fetch wholesalers
      const { data: wholesalers } = await supabase.from('wholesalers').select('id, code, name')
      const wsMap = new Map((wholesalers ?? []).map(w => [w.id, w]))

      // 5. Fetch products (paginated)
      let allProducts: { id: string; name: string; cip13: string }[] = []
      from = 0
      while (true) {
        const { data: page } = await supabase.from('products').select('id, name, cip13').range(from, from + 999)
        if (!page || page.length === 0) break
        allProducts = allProducts.concat(page)
        if (page.length < 1000) break
        from += 1000
      }
      const prodMap = new Map(allProducts.map(p => [p.id, p]))

      // 6. Build needs per wholesaler: quota capped by demand
      const byWholesaler = new Map<string, WholesalerNeed['items']>()

      for (const q of quotas) {
        const demand = demandByProduct.get(q.product_id)
        if (!demand) continue // No orders for this product, skip

        const quotaTotal = (q.quota_quantity ?? 0) + (q.extra_available ?? 0)
        if (quotaTotal <= 0) continue

        // Amount to collect = min(quota, total demand for this product)
        const toCollect = Math.min(quotaTotal, demand.totalQty)

        if (!byWholesaler.has(q.wholesaler_id)) {
          byWholesaler.set(q.wholesaler_id, [])
        }

        const prod = prodMap.get(q.product_id)
        byWholesaler.get(q.wholesaler_id)!.push({
          productId: q.product_id,
          productName: prod?.name ?? '?',
          cip13: prod?.cip13 ?? '?',
          quotaQuantity: q.quota_quantity ?? 0,
          extraAvailable: q.extra_available ?? 0,
          totalDemand: demand.totalQty,
          toCollect,
          customerCount: demand.customers.size,
        })
      }

      // 7. Build result
      const result: WholesalerNeed[] = []
      for (const [wsId, items] of byWholesaler.entries()) {
        const ws = wsMap.get(wsId)
        items.sort((a, b) => b.toCollect - a.toCollect)
        result.push({
          wholesalerId: wsId,
          wholesalerCode: ws?.code ?? '?',
          wholesalerName: ws?.name ?? '?',
          items,
          totalToCollect: items.reduce((s, i) => s + i.toCollect, 0),
          totalProducts: items.length,
        })
      }

      return result.sort((a, b) => b.totalToCollect - a.totalToCollect)
    },
  })

  const handleExportExcel = (ws: WholesalerNeed) => {
    const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const rows = ws.items.map(item => ({
      'CIP13': item.cip13,
      'Produit': item.productName,
      'Quota': item.quotaQuantity,
      'Extra dispo': item.extraAvailable,
      'Demande totale': item.totalDemand,
      'A collecter': item.toCollect,
      'Nb clients': item.customerCount,
      'Date demande': today,
    }))

    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Besoins')

    worksheet['!cols'] = [
      { wch: 16 }, // CIP13
      { wch: 40 }, // Produit
      { wch: 10 }, // Quota
      { wch: 12 }, // Extra
      { wch: 14 }, // Demande
      { wch: 12 }, // A collecter
      { wch: 12 }, // Nb clients
      { wch: 14 }, // Date demande
    ]

    const monthStr = `${process.year}-${String(process.month).padStart(2, '0')}`
    const filename = `besoins_${ws.wholesalerCode}_${monthStr}.xlsx`
    XLSX.writeFile(workbook, filename)

    setExportedWholesalers(prev => new Set([...prev, ws.wholesalerId]))
    toast.success(`Export ${ws.wholesalerCode} telecharge`)
  }

  const handleExportAll = () => {
    if (!needs) return
    for (const ws of needs) {
      handleExportExcel(ws)
    }
  }

  const allExported = needs && needs.length > 0 && needs.every(ws => exportedWholesalers.has(ws.wholesalerId))

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Export vers Grossistes</h3>
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 bg-muted rounded-xl" />)}
        </div>
      </div>
    )
  }

  if (!needs || needs.length === 0) {
    return (
      <div className="space-y-5">
        <div>
          <h3 className="text-lg font-semibold">Export vers Grossistes</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Aucun quota trouve pour ce mois, ou aucune commande validee ne correspond aux quotas disponibles.
            Verifiez que les quotas (etape 1) et les commandes (etape 2) ont ete importes.
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

  const totalProducts = new Set(needs.flatMap(ws => ws.items.map(i => i.productId))).size
  const totalToCollect = needs.reduce((s, ws) => s + ws.totalToCollect, 0)
  const totalDemand = new Map<string, number>()
  for (const ws of needs) {
    for (const item of ws.items) {
      if (!totalDemand.has(item.productId)) {
        totalDemand.set(item.productId, item.totalDemand)
      }
    }
  }
  const sumDemand = [...totalDemand.values()].reduce((s, v) => s + v, 0)
  const coverageRate = sumDemand > 0 ? Math.round((totalToCollect / sumDemand) * 100) : 0

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold">Export vers Grossistes</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Fichiers de besoins consolides a envoyer a chaque grossiste pour la collecte, bases sur les quotas et la demande client.
        </p>
      </div>

      {/* Summary */}
      <Card className="ivory-card-highlight">
        <CardContent className="p-4 flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-2">
            <Warehouse className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm"><strong>{needs.length}</strong> grossistes</span>
          </div>
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm"><strong>{totalProducts}</strong> produits</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm"><strong>{totalToCollect.toLocaleString('fr-FR')}</strong> u. a collecter</span>
          </div>
          {coverageRate < 100 && (
            <div className="flex items-center gap-1.5 text-amber-600">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">Couverture quotas : {coverageRate}% de la demande</span>
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
        {needs.map(ws => {
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
                      <span>{ws.totalProducts} produits</span>
                      <span>{ws.totalToCollect.toLocaleString('fr-FR')} u. a collecter</span>
                    </div>
                  </div>
                  <Button
                    variant={isExported ? 'outline' : 'default'}
                    size="sm"
                    className="gap-1.5 shrink-0"
                    onClick={() => handleExportExcel(ws)}
                  >
                    {isExported ? <FileSpreadsheet className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
                    {isExported ? 'Re-telecharger' : 'Exporter Excel'}
                  </Button>
                </div>

                {/* Products preview */}
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">CIP13</TableHead>
                        <TableHead className="text-xs">Produit</TableHead>
                        <TableHead className="text-xs text-right">Quota</TableHead>
                        <TableHead className="text-xs text-right">Demande</TableHead>
                        <TableHead className="text-xs text-right">A collecter</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ws.items.slice(0, 5).map(item => (
                        <TableRow key={item.productId}>
                          <TableCell className="font-mono text-xs">{item.cip13}</TableCell>
                          <TableCell className="text-xs truncate max-w-[200px]">{item.productName}</TableCell>
                          <TableCell className="text-xs text-right tabular-nums">
                            {item.quotaQuantity.toLocaleString('fr-FR')}
                            {item.extraAvailable > 0 && (
                              <span className="text-muted-foreground"> +{item.extraAvailable}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-right tabular-nums">{item.totalDemand.toLocaleString('fr-FR')}</TableCell>
                          <TableCell className="text-xs text-right font-medium tabular-nums">{item.toCollect.toLocaleString('fr-FR')}</TableCell>
                        </TableRow>
                      ))}
                      {ws.items.length > 5 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-xs text-muted-foreground text-center py-2">
                            + {ws.items.length - 5} autres produits
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
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
              <Send className="h-3 w-3" />
              {exportedWholesalers.size}/{needs.length} exportes
            </Badge>
          )}
        </div>
        <Button onClick={onNext} className="gap-2">
          {allExported ? 'Passer a la reception' : 'Passer'} <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

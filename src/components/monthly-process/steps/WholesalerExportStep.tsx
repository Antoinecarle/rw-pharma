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
import { Download, Send, ArrowRight, Package, Warehouse, FileSpreadsheet, Check } from 'lucide-react'
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
    totalQuantity: number
    customerCount: number
  }[]
  totalQuantity: number
  totalProducts: number
}

interface WholesalerExportStepProps {
  process: MonthlyProcess
  onNext: () => void
}

export default function WholesalerExportStep({ process, onNext }: WholesalerExportStepProps) {
  const [exportedWholesalers, setExportedWholesalers] = useState<Set<string>>(new Set())

  // Fetch allocations with joins
  const { data: needs, isLoading } = useQuery({
    queryKey: ['wholesaler-needs', process.id],
    queryFn: async () => {
      // Fetch all allocations for this process
      const allAllocations: {
        wholesaler_id: string
        product_id: string
        customer_id: string
        allocated_quantity: number
      }[] = []
      let from = 0
      const pageSize = 500
      while (true) {
        const { data, error } = await supabase
          .from('allocations')
          .select('wholesaler_id, product_id, customer_id, allocated_quantity')
          .eq('monthly_process_id', process.id)
          .in('status', ['proposed', 'confirmed'])
          .range(from, from + pageSize - 1)
        if (error) throw error
        if (!data || data.length === 0) break
        allAllocations.push(...data)
        if (data.length < pageSize) break
        from += pageSize
      }

      if (allAllocations.length === 0) return []

      // Fetch wholesalers
      const { data: wholesalers } = await supabase.from('wholesalers').select('id, code, name')
      const wsMap = new Map((wholesalers ?? []).map(w => [w.id, w]))

      // Fetch products (paginated)
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

      // Group by wholesaler -> product
      const byWholesaler = new Map<string, Map<string, { totalQty: number; customers: Set<string> }>>()

      for (const alloc of allAllocations) {
        if (!byWholesaler.has(alloc.wholesaler_id)) {
          byWholesaler.set(alloc.wholesaler_id, new Map())
        }
        const prodMap2 = byWholesaler.get(alloc.wholesaler_id)!
        if (!prodMap2.has(alloc.product_id)) {
          prodMap2.set(alloc.product_id, { totalQty: 0, customers: new Set() })
        }
        const entry = prodMap2.get(alloc.product_id)!
        entry.totalQty += alloc.allocated_quantity
        entry.customers.add(alloc.customer_id)
      }

      // Build result
      const result: WholesalerNeed[] = []
      for (const [wsId, products] of byWholesaler.entries()) {
        const ws = wsMap.get(wsId)
        const items: WholesalerNeed['items'] = []
        let totalQty = 0

        for (const [prodId, { totalQty: qty, customers }] of products.entries()) {
          const prod = prodMap.get(prodId)
          items.push({
            productId: prodId,
            productName: prod?.name ?? '?',
            cip13: prod?.cip13 ?? '?',
            totalQuantity: qty,
            customerCount: customers.size,
          })
          totalQty += qty
        }

        items.sort((a, b) => b.totalQuantity - a.totalQuantity)

        result.push({
          wholesalerId: wsId,
          wholesalerCode: ws?.code ?? '?',
          wholesalerName: ws?.name ?? '?',
          items,
          totalQuantity: totalQty,
          totalProducts: items.length,
        })
      }

      return result.sort((a, b) => b.totalQuantity - a.totalQuantity)
    },
  })

  const handleExportExcel = (ws: WholesalerNeed) => {
    const rows = ws.items.map(item => ({
      'CIP13': item.cip13,
      'Produit': item.productName,
      'Quantite demandee': item.totalQuantity,
      'Nb clients': item.customerCount,
    }))

    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Besoins')

    // Auto-size columns
    const colWidths = [
      { wch: 16 }, // CIP13
      { wch: 40 }, // Produit
      { wch: 18 }, // Quantite
      { wch: 12 }, // Nb clients
    ]
    worksheet['!cols'] = colWidths

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
            Aucune allocation trouvee. Lancez d'abord l'allocation macro (etape 4).
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
  const totalQty = needs.reduce((s, ws) => s + ws.totalQuantity, 0)

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold">Export vers Grossistes</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Generez les fichiers de besoins consolides a envoyer a chaque grossiste pour qu'il collecte les produits.
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
            <span className="text-sm"><strong>{totalQty.toLocaleString('fr-FR')}</strong> unites total</span>
          </div>
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
                      <span>{ws.totalQuantity.toLocaleString('fr-FR')} unites</span>
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

                {/* Top 5 products preview */}
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">CIP13</TableHead>
                        <TableHead className="text-xs">Produit</TableHead>
                        <TableHead className="text-xs text-right">Quantite</TableHead>
                        <TableHead className="text-xs text-right">Clients</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ws.items.slice(0, 5).map(item => (
                        <TableRow key={item.productId}>
                          <TableCell className="font-mono text-xs">{item.cip13}</TableCell>
                          <TableCell className="text-xs truncate max-w-[200px]">{item.productName}</TableCell>
                          <TableCell className="text-xs text-right font-medium">{item.totalQuantity}</TableCell>
                          <TableCell className="text-xs text-right">{item.customerCount}</TableCell>
                        </TableRow>
                      ))}
                      {ws.items.length > 5 && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-xs text-muted-foreground text-center py-2">
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

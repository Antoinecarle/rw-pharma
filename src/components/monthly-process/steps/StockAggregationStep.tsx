import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from '@/components/ui/tooltip'
import AnimatedCounter from '@/components/ui/animated-counter'
import StockLotView from '@/components/stock/StockLotView'
import { ArrowRight, ArrowLeft, Layers, Boxes, Package, AlertTriangle, Calendar, Truck, LayoutGrid, List } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { MonthlyProcess, CollectedStock, Wholesaler, Product } from '@/types/database'

interface StockAggregationStepProps {
  process: MonthlyProcess
  onNext: () => void
  onBack?: () => void
}

type GroupBy = 'product' | 'lot' | 'wholesaler'

interface AggregatedRow {
  key: string
  productName: string
  productCip13: string
  lotNumber: string
  expiryDate: string
  fabricationDate: string | null
  wholesalerCode: string
  wholesalerName: string
  totalQty: number
  unitCount: number
  isExpiringSoon: boolean
}

const cardVariants: import('framer-motion').Variants = {
  hidden: { opacity: 0, y: 15, scale: 0.97 },
  visible: (i: number) => ({
    opacity: 1, y: 0, scale: 1,
    transition: { delay: i * 0.08, type: 'spring' as const, stiffness: 300, damping: 25 },
  }),
}

type ViewMode = 'table' | 'lots'

export default function StockAggregationStep({ process, onNext, onBack }: StockAggregationStepProps) {
  const [groupBy, setGroupBy] = useState<GroupBy>('product')
  const [viewMode, setViewMode] = useState<ViewMode>('lots')

  const { data: stocks, isLoading } = useQuery({
    queryKey: ['collected-stock', process.id, 'aggregation'],
    queryFn: async () => {
      const all: CollectedStock[] = []
      let from = 0
      const pageSize = 500
      while (true) {
        const { data, error } = await supabase
          .from('collected_stock')
          .select('*, wholesaler:wholesalers(id, name, code), product:products(id, cip13, name)')
          .eq('monthly_process_id', process.id)
          .order('expiry_date', { ascending: true })
          .range(from, from + pageSize - 1)
        if (error) throw error
        if (!data || data.length === 0) break
        all.push(...(data as unknown as CollectedStock[]))
        if (data.length < pageSize) break
        from += pageSize
      }
      return all
    },
  })

  // KPIs
  const totalQty = stocks?.reduce((s, st) => s + st.quantity, 0) ?? 0
  const uniqueProducts = new Set(stocks?.map(s => s.product_id ?? s.cip13) ?? []).size
  const uniqueLots = new Set(stocks?.map(s => s.lot_number) ?? []).size
  const uniqueWholesalers = new Set(stocks?.map(s => s.wholesaler_id) ?? []).size

  // Expiry check
  const now = new Date()
  const isExpiringSoon = (dateStr: string) => {
    const exp = new Date(dateStr)
    const diffMonths = (exp.getFullYear() - now.getFullYear()) * 12 + (exp.getMonth() - now.getMonth())
    return diffMonths <= 3
  }

  // Aggregated view
  const aggregated = useMemo(() => {
    if (!stocks) return []

    const rows: AggregatedRow[] = stocks.map(s => {
      const prod = s.product as unknown as Pick<Product, 'cip13' | 'name'> | undefined
      const ws = s.wholesaler as unknown as Pick<Wholesaler, 'code' | 'name'> | undefined
      return {
        key: `${s.id}`,
        productName: prod?.name ?? '?',
        productCip13: prod?.cip13 ?? s.cip13,
        lotNumber: s.lot_number,
        expiryDate: s.expiry_date,
        fabricationDate: s.fabrication_date,
        wholesalerCode: ws?.code ?? '?',
        wholesalerName: ws?.name ?? '?',
        totalQty: s.quantity,
        unitCount: 1,
        isExpiringSoon: isExpiringSoon(s.expiry_date),
      }
    })

    if (groupBy === 'product') {
      const map = new Map<string, AggregatedRow & { wholesalers: Set<string>; lots: Set<string> }>()
      for (const r of rows) {
        const existing = map.get(r.productCip13)
        if (existing) {
          existing.totalQty += r.totalQty
          existing.unitCount++
          existing.wholesalers.add(r.wholesalerCode)
          existing.lots.add(r.lotNumber)
          // Keep earliest expiry
          if (r.expiryDate < existing.expiryDate) {
            existing.expiryDate = r.expiryDate
            existing.isExpiringSoon = r.isExpiringSoon
          }
        } else {
          map.set(r.productCip13, {
            ...r,
            key: r.productCip13,
            wholesalers: new Set([r.wholesalerCode]),
            lots: new Set([r.lotNumber]),
          })
        }
      }
      return [...map.values()].sort((a, b) => b.totalQty - a.totalQty)
    }

    if (groupBy === 'wholesaler') {
      const map = new Map<string, AggregatedRow & { products: Set<string>; lots: Set<string> }>()
      for (const r of rows) {
        const existing = map.get(r.wholesalerCode)
        if (existing) {
          existing.totalQty += r.totalQty
          existing.unitCount++
          existing.products.add(r.productCip13)
          existing.lots.add(r.lotNumber)
        } else {
          map.set(r.wholesalerCode, {
            ...r,
            key: r.wholesalerCode,
            products: new Set([r.productCip13]),
            lots: new Set([r.lotNumber]),
          })
        }
      }
      return [...map.values()].sort((a, b) => b.totalQty - a.totalQty)
    }

    // groupBy === 'lot' — default, no aggregation needed
    return rows.sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))
  }, [stocks, groupBy])

  const expiringSoonCount = aggregated.filter(r => r.isExpiringSoon).length

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Aggregation du Stock Collecte</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Vue consolidee du stock recu des grossistes. Verifiez les quantites et les dates avant l'allocation.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <motion.div custom={0} variants={cardVariants} initial="hidden" animate="visible">
          <Card>
            <CardContent className="p-4 text-center">
              <Package className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
              <AnimatedCounter value={totalQty} className="justify-center" valueClassName="text-2xl font-bold" />
              <p className="text-xs text-muted-foreground">Unites totales</p>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div custom={1} variants={cardVariants} initial="hidden" animate="visible">
          <Card>
            <CardContent className="p-4 text-center">
              <Layers className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
              <AnimatedCounter value={uniqueProducts} className="justify-center" valueClassName="text-2xl font-bold" />
              <p className="text-xs text-muted-foreground">Produits</p>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div custom={2} variants={cardVariants} initial="hidden" animate="visible">
          <Card>
            <CardContent className="p-4 text-center">
              <Boxes className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
              <AnimatedCounter value={uniqueLots} className="justify-center" valueClassName="text-2xl font-bold" />
              <p className="text-xs text-muted-foreground">Lots</p>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div custom={3} variants={cardVariants} initial="hidden" animate="visible">
          <Card>
            <CardContent className="p-4 text-center">
              <Truck className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
              <AnimatedCounter value={uniqueWholesalers} className="justify-center" valueClassName="text-2xl font-bold" />
              <p className="text-xs text-muted-foreground">Grossistes</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Expiry warning */}
      {expiringSoonCount > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="border-amber-200/60 bg-amber-50/30">
            <CardContent className="p-4 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
              <p className="text-sm">
                <span className="font-semibold">{expiringSoonCount} lot(s)</span> expirent dans les 3 prochains mois
              </p>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* View mode toggle */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMode('lots')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              viewMode === 'lots'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border hover:bg-muted text-muted-foreground'
            }`}
          >
            <List className="h-3.5 w-3.5" />
            Vue lots (Qty / Alloue / Restant)
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              viewMode === 'table'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border hover:bg-muted text-muted-foreground'
            }`}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Vue tableau
          </button>
        </div>
      </div>

      {/* Lot view (new) */}
      {viewMode === 'lots' ? (
        <StockLotView processId={process.id} showKpis={false} maxHeight="500px" compact />
      ) : (
        <>
          {/* Group by filter */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span className="text-xs text-muted-foreground">Grouper par :</span>
            <div className="flex flex-wrap gap-1.5">
              {[
                { value: 'product' as GroupBy, label: `Produit (${uniqueProducts})` },
                { value: 'lot' as GroupBy, label: `Lot (${uniqueLots})` },
                { value: 'wholesaler' as GroupBy, label: `Grossiste (${uniqueWholesalers})` },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setGroupBy(opt.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                    groupBy === opt.value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border hover:bg-muted text-muted-foreground'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Data table */}
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : aggregated.length > 0 ? (
            <div className="border rounded-lg overflow-x-auto max-h-[500px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {groupBy === 'product' && (
                      <>
                        <TableHead>CIP13</TableHead>
                        <TableHead>Produit</TableHead>
                        <TableHead>Exp. la + proche</TableHead>
                        <TableHead>Grossistes</TableHead>
                        <TableHead>Lots</TableHead>
                        <TableHead className="text-right">Qty totale</TableHead>
                      </>
                    )}
                    {groupBy === 'lot' && (
                      <>
                        <TableHead>Lot</TableHead>
                        <TableHead>CIP13</TableHead>
                        <TableHead>Produit</TableHead>
                        <TableHead>Expiry</TableHead>
                        <TableHead>Fabrication</TableHead>
                        <TableHead>Grossiste</TableHead>
                        <TableHead className="text-right">Quantite</TableHead>
                      </>
                    )}
                    {groupBy === 'wholesaler' && (
                      <>
                        <TableHead>Grossiste</TableHead>
                        <TableHead>Produits</TableHead>
                        <TableHead>Lots</TableHead>
                        <TableHead className="text-right">Qty totale</TableHead>
                      </>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aggregated.map((row) => (
                    <TableRow key={row.key} className={row.isExpiringSoon ? 'bg-amber-50/30 dark:bg-amber-950/10' : ''}>
                      {groupBy === 'product' && (
                        <>
                          <TableCell className="font-mono text-sm">{row.productCip13}</TableCell>
                          <TableCell className="text-sm max-w-[200px] truncate">{row.productName}</TableCell>
                          <TableCell>
                            <span className={`text-xs tabular-nums flex items-center gap-1 ${row.isExpiringSoon ? 'text-red-600 font-semibold' : ''}`}>
                              <Calendar className="h-3 w-3 text-muted-foreground" />
                              {new Date(row.expiryDate).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })}
                              {row.isExpiringSoon && <AlertTriangle className="h-3 w-3 text-red-500" />}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {[...((row as unknown as { wholesalers: Set<string> }).wholesalers ?? [])].map(code => (
                                <Badge key={code} variant="outline" className="text-[9px]">{code}</Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Tooltip>
                              <TooltipTrigger>
                                <Badge variant="secondary" className="text-[10px]">
                                  {((row as unknown as { lots: Set<string> }).lots ?? new Set()).size} lot(s)
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                {[...((row as unknown as { lots: Set<string> }).lots ?? [])].join(', ')}
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-bold">{row.totalQty.toLocaleString('fr-FR')}</TableCell>
                        </>
                      )}
                      {groupBy === 'lot' && (
                        <>
                          <TableCell>
                            <Badge variant="secondary" className="font-mono text-[10px] gap-0.5">
                              <Boxes className="h-2.5 w-2.5" />
                              {row.lotNumber}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-sm">{row.productCip13}</TableCell>
                          <TableCell className="text-sm max-w-[180px] truncate">{row.productName}</TableCell>
                          <TableCell>
                            <span className={`text-xs tabular-nums flex items-center gap-1 ${row.isExpiringSoon ? 'text-red-600 font-semibold' : ''}`}>
                              <Calendar className="h-3 w-3 text-muted-foreground" />
                              {new Date(row.expiryDate).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })}
                              {row.isExpiringSoon && <AlertTriangle className="h-3 w-3 text-red-500" />}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {row.fabricationDate ? new Date(row.fabricationDate).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }) : '-'}
                          </TableCell>
                          <TableCell className="font-medium text-sm">{row.wholesalerCode}</TableCell>
                          <TableCell className="text-right tabular-nums font-bold">{row.totalQty.toLocaleString('fr-FR')}</TableCell>
                        </>
                      )}
                      {groupBy === 'wholesaler' && (
                        <>
                          <TableCell>
                            <div>
                              <span className="font-bold text-sm">{row.wholesalerCode}</span>
                              <p className="text-xs text-muted-foreground">{row.wholesalerName}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-[10px]">
                              {((row as unknown as { products: Set<string> }).products ?? new Set()).size} produit(s)
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-[10px]">
                              {((row as unknown as { lots: Set<string> }).lots ?? new Set()).size} lot(s)
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-bold">{row.totalQty.toLocaleString('fr-FR')}</TableCell>
                        </>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <Card className="ivory-card-empty">
              <CardContent className="p-8 text-center">
                <Layers className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="font-medium">Aucun stock collecte</p>
                <p className="text-sm text-muted-foreground mt-1">Importez le stock recu a l'etape precedente.</p>
                {onBack && (
                  <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={onBack}>
                    <ArrowLeft className="h-4 w-4" />
                    Retour a la reception
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Actions */}
      {aggregated.length > 0 && (
        <div className="flex justify-between">
          {onBack && (
            <Button variant="outline" onClick={onBack} className="gap-1.5">
              <ArrowLeft className="h-4 w-4" /> Retour
            </Button>
          )}
          <Button onClick={onNext} className="gap-2 ml-auto">
            Lancer l'allocation
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}

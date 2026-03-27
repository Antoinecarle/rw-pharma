import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Download, Send, ArrowRight, Package, Warehouse, FileSpreadsheet,
  Check, AlertTriangle, Pencil, ChevronDown, ChevronUp, Filter,
  Plus, X, Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import type { MonthlyProcess, ManualAttribution } from '@/types/database'
import { mergeAttributionsForExport, type ExportRow } from '@/lib/export-utils'
import { useManualAttributions } from '@/hooks/useManualAttributions'

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

type SourceFilter = 'all' | 'INITIALE' | 'MANUEL'

interface WholesalerExportStepProps {
  process: MonthlyProcess
  onNext: () => void
}

export default function WholesalerExportStep({ process, onNext }: WholesalerExportStepProps) {
  const [exportedWholesalers, setExportedWholesalers] = useState<Set<string>>(new Set())
  const [expandedWholesalers, setExpandedWholesalers] = useState<Set<string>>(new Set())
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')

  // Manual attributions hook (shared cache with MacroAttributionStep)
  const {
    manualAttrs: allManualAttrs, upsert, isUpserting, deactivate,
  } = useManualAttributions(process.id)

  // Inline add state
  const [addingForWs, setAddingForWs] = useState<string | null>(null)
  const [addProductSearch, setAddProductSearch] = useState('')
  const [addSelectedProduct, setAddSelectedProduct] = useState<{ id: string; cip13: string; name: string } | null>(null)
  const [addSelectedCustomer, setAddSelectedCustomer] = useState<{ id: string; code: string } | null>(null)
  const [addReqQty, setAddReqQty] = useState('')
  const [addSupQty, setAddSupQty] = useState('')

  // Inline edit state
  const [editingAttrId, setEditingAttrId] = useState<string | null>(null)
  const [editReqQty, setEditReqQty] = useState('')
  const [editSupQty, setEditSupQty] = useState('')

  // Index manual attrs by wholesaler_id
  const manualByWholesaler = useMemo(() => {
    const map = new Map<string, ManualAttribution[]>()
    for (const attr of allManualAttrs) {
      const list = map.get(attr.wholesaler_id) ?? []
      list.push(attr)
      map.set(attr.wholesaler_id, list)
    }
    return map
  }, [allManualAttrs])

  // Fetch products for add form
  const { data: allProducts = [] } = useQuery({
    queryKey: ['all-products-for-add'],
    queryFn: async () => {
      let result: { id: string; name: string; cip13: string }[] = []
      let from = 0
      while (true) {
        const { data: page } = await supabase.from('products').select('id, name, cip13').range(from, from + 999)
        if (!page || page.length === 0) break
        result = result.concat(page)
        if (page.length < 1000) break
        from += 1000
      }
      return result
    },
    enabled: !!addingForWs,
  })

  // Fetch customers for add form
  const { data: allCustomers = [] } = useQuery({
    queryKey: ['all-customers-for-add'],
    queryFn: async () => {
      const { data } = await supabase.from('customers').select('id, code, name')
      return data ?? []
    },
    enabled: !!addingForWs,
  })

  // Filtered products for search
  const filteredProducts = useMemo(() => {
    if (!addProductSearch || addProductSearch.length < 2) return []
    const q = addProductSearch.toLowerCase()
    return allProducts
      .filter(p => p.cip13.includes(q) || p.name.toLowerCase().includes(q))
      .slice(0, 15)
  }, [allProducts, addProductSearch])

  const { data: needs, isLoading } = useQuery({
    queryKey: ['wholesaler-needs', process.id],
    queryFn: async () => {
      const allOrders: { product_id: string; customer_id: string; quantity: number }[] = []
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

      const demandByProduct = new Map<string, { totalQty: number; customers: Set<string> }>()
      for (const o of allOrders) {
        const existing = demandByProduct.get(o.product_id)
        if (existing) { existing.totalQty += o.quantity; existing.customers.add(o.customer_id) }
        else demandByProduct.set(o.product_id, { totalQty: o.quantity, customers: new Set([o.customer_id]) })
      }

      const monthDate = `${process.year}-${String(process.month).padStart(2, '0')}-01`
      const { data: quotas, error: qErr } = await supabase
        .from('wholesaler_quotas')
        .select('wholesaler_id, product_id, quota_quantity, extra_available')
        .eq('month', monthDate)
      if (qErr) throw qErr
      if (!quotas || quotas.length === 0) return []

      const { data: wholesalers } = await supabase.from('wholesalers').select('id, code, name')
      const wsMap = new Map((wholesalers ?? []).map(w => [w.id, w]))

      let fetchedProducts: { id: string; name: string; cip13: string }[] = []
      from = 0
      while (true) {
        const { data: page } = await supabase.from('products').select('id, name, cip13').range(from, from + 999)
        if (!page || page.length === 0) break
        fetchedProducts = fetchedProducts.concat(page)
        if (page.length < 1000) break
        from += 1000
      }
      const prodMap = new Map(fetchedProducts.map(p => [p.id, p]))

      const byWholesaler = new Map<string, WholesalerNeed['items']>()
      for (const q of quotas) {
        const demand = demandByProduct.get(q.product_id)
        if (!demand) continue
        const quotaTotal = (q.quota_quantity ?? 0) + (q.extra_available ?? 0)
        if (quotaTotal <= 0) continue
        const toCollect = Math.min(quotaTotal, demand.totalQty)
        if (!byWholesaler.has(q.wholesaler_id)) byWholesaler.set(q.wholesaler_id, [])
        const prod = prodMap.get(q.product_id)
        byWholesaler.get(q.wholesaler_id)!.push({
          productId: q.product_id, productName: prod?.name ?? '?', cip13: prod?.cip13 ?? '?',
          quotaQuantity: q.quota_quantity ?? 0, extraAvailable: q.extra_available ?? 0,
          totalDemand: demand.totalQty, toCollect, customerCount: demand.customers.size,
        })
      }

      const result: WholesalerNeed[] = []
      for (const [wsId, items] of byWholesaler.entries()) {
        const ws = wsMap.get(wsId)
        items.sort((a, b) => b.toCollect - a.toCollect)
        result.push({
          wholesalerId: wsId, wholesalerCode: ws?.code ?? '?', wholesalerName: ws?.name ?? '?',
          items, totalToCollect: items.reduce((s, i) => s + i.toCollect, 0), totalProducts: items.length,
        })
      }
      return result.sort((a, b) => b.totalToCollect - a.totalToCollect)
    },
  })

  // Build merged rows for a wholesaler (used for both preview and export)
  const getMergedRows = (ws: WholesalerNeed): ExportRow[] => {
    const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const wsManualAttrs = manualByWholesaler.get(ws.wholesalerId) ?? []
    if (wsManualAttrs.length === 0) {
      return ws.items.map(item => ({
        cip13: item.cip13, productName: item.productName, client: 'TOUS',
        requestedQty: item.totalDemand, supplierQty: item.toCollect,
        source: 'INITIALE' as const, editedAt: today,
      }))
    }
    const macroItems = ws.items.map(item => ({
      productId: item.productId, productName: item.productName,
      cip13: item.cip13, toCollect: item.toCollect, totalDemand: item.totalDemand,
    }))
    return mergeAttributionsForExport(macroItems, wsManualAttrs, today)
  }

  const handleExportExcel = (ws: WholesalerNeed) => {
    const merged = getMergedRows(ws)
    const rows = merged.map(row => ({
      'CIP13': row.cip13, 'Produit': row.productName, 'Client': row.client,
      'Qté fournisseur': row.supplierQty,
      'Date edition': row.editedAt,
    }))
    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Besoins')
    worksheet['!cols'] = [
      { wch: 16 }, { wch: 40 }, { wch: 12 }, { wch: 14 }, { wch: 18 },
    ]
    const monthStr = `${process.year}-${String(process.month).padStart(2, '0')}`
    XLSX.writeFile(workbook, `besoins_${ws.wholesalerCode}_${monthStr}.xlsx`)
    setExportedWholesalers(prev => new Set([...prev, ws.wholesalerId]))
    toast.success(`Export ${ws.wholesalerCode} téléchargé`)
  }

  const handleExportAll = () => { if (needs) needs.forEach(ws => handleExportExcel(ws)) }

  const toggleExpand = (wsId: string) => {
    setExpandedWholesalers(prev => {
      const next = new Set(prev)
      if (next.has(wsId)) next.delete(wsId); else next.add(wsId)
      return next
    })
  }

  const handleAddManual = (wholesalerId: string) => {
    if (!addSelectedProduct || !addSelectedCustomer) { toast.error('Sélectionnez un produit et un client'); return }
    const req = parseInt(addReqQty, 10) || 0
    const sup = parseInt(addSupQty, 10) || 0
    if (sup <= 0) { toast.error('Quantité fournisseur requise'); return }
    upsert({
      productId: addSelectedProduct.id,
      customerId: addSelectedCustomer.id,
      wholesalerId,
      requestedQuantity: req,
      supplierQuantity: sup,
    })
    resetAddForm()
  }

  const resetAddForm = () => {
    setAddingForWs(null); setAddProductSearch(''); setAddSelectedProduct(null)
    setAddSelectedCustomer(null); setAddReqQty(''); setAddSupQty('')
  }

  const handleStartEdit = (attr: ManualAttribution) => {
    setEditingAttrId(attr.id)
    setEditReqQty(String(attr.requested_quantity))
    setEditSupQty(String(attr.supplier_quantity))
  }

  const handleSaveEdit = (attr: ManualAttribution) => {
    const req = parseInt(editReqQty, 10) || 0
    const sup = parseInt(editSupQty, 10) || 0
    upsert({
      productId: attr.product_id,
      customerId: attr.customer_id,
      wholesalerId: attr.wholesaler_id,
      requestedQuantity: req,
      supplierQuantity: sup,
    })
    setEditingAttrId(null)
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
            Aucun quota trouvé pour ce mois, ou aucune commande validée ne correspond aux quotas disponibles.
          </p>
        </div>
        <div className="flex justify-end">
          <Button variant="outline" onClick={onNext}>Passer <ArrowRight className="h-4 w-4 ml-1" /></Button>
        </div>
      </div>
    )
  }

  // Compute totals including manuals
  const totalManualEdits = allManualAttrs.length
  const totalManualSupplierQty = allManualAttrs.reduce((s, a) => s + a.supplier_quantity, 0)
  const totalProducts = new Set(needs.flatMap(ws => ws.items.map(i => i.productId))).size
  const macroToCollect = needs.reduce((s, ws) => s + ws.totalToCollect, 0)
  const totalToCollect = macroToCollect + totalManualSupplierQty
  const uniqueDemand = new Map<string, number>()
  for (const ws of needs) for (const item of ws.items) if (!uniqueDemand.has(item.productId)) uniqueDemand.set(item.productId, item.totalDemand)
  const sumDemand = [...uniqueDemand.values()].reduce((s, v) => s + v, 0)
  const coverageRate = sumDemand > 0 ? Math.round((totalToCollect / sumDemand) * 100) : 0

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold">Export vers Grossistes</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Fichiers de besoins consolides a envoyer a chaque grossiste pour la collecte.
          {totalManualEdits > 0 && (
            <span className="text-blue-600 font-medium"> {totalManualEdits} edition{totalManualEdits > 1 ? 's' : ''} manuelle{totalManualEdits > 1 ? 's' : ''} incluse{totalManualEdits > 1 ? 's' : ''}.</span>
          )}
        </p>
      </div>

      {/* Summary KPIs */}
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
          {totalManualEdits > 0 && (
            <div className="flex items-center gap-1.5 text-blue-600">
              <Pencil className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">{totalManualEdits} manuelle{totalManualEdits > 1 ? 's' : ''} (+{totalManualSupplierQty.toLocaleString('fr-FR')} u.)</span>
            </div>
          )}
          {coverageRate < 100 && (
            <div className="flex items-center gap-1.5 text-amber-600">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">Couverture : {coverageRate}%</span>
            </div>
          )}
          <div className="ml-auto flex items-center gap-2">
            {/* Source filter */}
            <div className="flex items-center gap-1">
              <Filter className="h-3 w-3 text-muted-foreground" />
              {(['all', 'INITIALE', 'MANUEL'] as SourceFilter[]).map(f => (
                <button key={f} type="button" onClick={() => setSourceFilter(f)}>
                  <Badge variant={sourceFilter === f ? 'default' : 'outline'} className="text-[9px] cursor-pointer">
                    {f === 'all' ? 'Tout' : f === 'INITIALE' ? 'Initiale' : 'Manuel'}
                  </Badge>
                </button>
              ))}
            </div>
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
          const isExpanded = expandedWholesalers.has(ws.wholesalerId)
          const allRows = getMergedRows(ws)
          const filteredRows = sourceFilter === 'all' ? allRows : allRows.filter(r => r.source === sourceFilter)
          const displayRows = isExpanded ? filteredRows : filteredRows.slice(0, 5)
          const hasMore = filteredRows.length > 5
          const wsManualCount = (manualByWholesaler.get(ws.wholesalerId) ?? []).length
          const wsManualQty = (manualByWholesaler.get(ws.wholesalerId) ?? []).reduce((s, a) => s + a.supplier_quantity, 0)
          const wsTotalQty = ws.totalToCollect + wsManualQty

          return (
            <Card key={ws.wholesalerId} className={isExported ? 'border-green-200 bg-green-50/30 dark:bg-green-950/20' : ''}>
              <CardContent className="p-4">
                {/* Header */}
                <div className="flex items-center gap-3 mb-3">
                  <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${isExported ? 'bg-green-100 dark:bg-green-900' : 'bg-muted'}`}>
                    {isExported ? <Check className="h-4 w-4 text-green-600" /> : <Warehouse className="h-4 w-4 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{ws.wholesalerCode}</span>
                      <span className="text-sm text-muted-foreground">— {ws.wholesalerName}</span>
                      {wsManualCount > 0 && (
                        <Badge variant="outline" className="text-[10px] border-blue-200 text-blue-600 gap-0.5">
                          <Pencil className="h-2.5 w-2.5" /> {wsManualCount} manuelle{wsManualCount > 1 ? 's' : ''}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      <span>{filteredRows.length} lignes</span>
                      <span className="font-medium">{wsTotalQty.toLocaleString('fr-FR')} u. total</span>
                      {wsManualQty > 0 && <span className="text-blue-600">(dont {wsManualQty.toLocaleString('fr-FR')} manuelles)</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={() => { setAddingForWs(addingForWs === ws.wholesalerId ? null : ws.wholesalerId); setEditingAttrId(null) }}>
                      <Plus className="h-3 w-3" /> Ajouter
                    </Button>
                    <Button variant={isExported ? 'outline' : 'default'} size="sm" className="gap-1.5 shrink-0" onClick={() => handleExportExcel(ws)}>
                      {isExported ? <FileSpreadsheet className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
                      {isExported ? 'Re-télécharger' : 'Exporter'}
                    </Button>
                  </div>
                </div>

                {/* Add manual attribution form */}
                {addingForWs === ws.wholesalerId && (
                  <Card className="border-blue-200 bg-blue-50/30 dark:bg-blue-950/20 mb-3">
                    <CardContent className="p-3 space-y-2">
                      <p className="text-xs font-semibold text-blue-700">Ajouter une attribution manuelle pour {ws.wholesalerCode}</p>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
                        {/* Product search */}
                        <div className="col-span-2 relative">
                          <label className="text-[10px] text-muted-foreground">Produit (CIP13 ou nom)</label>
                          <Input
                            value={addSelectedProduct ? `${addSelectedProduct.cip13} — ${addSelectedProduct.name.slice(0, 30)}` : addProductSearch}
                            onChange={e => { setAddProductSearch(e.target.value); setAddSelectedProduct(null) }}
                            className="h-7 text-xs"
                            placeholder="Rechercher..."
                          />
                          {filteredProducts.length > 0 && !addSelectedProduct && (
                            <div className="absolute z-20 top-full left-0 right-0 mt-0.5 bg-background border rounded-lg shadow-lg max-h-[200px] overflow-y-auto">
                              {filteredProducts.map(p => (
                                <button key={p.id} type="button" className="w-full text-left px-2 py-1.5 hover:bg-muted text-xs flex items-center gap-2"
                                  onClick={() => { setAddSelectedProduct(p); setAddProductSearch('') }}>
                                  <span className="font-mono text-muted-foreground">{p.cip13}</span>
                                  <span className="truncate">{p.name}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        {/* Customer select */}
                        <div>
                          <label className="text-[10px] text-muted-foreground">Client</label>
                          <select
                            className="h-7 w-full rounded-md border text-xs px-2 bg-background"
                            value={addSelectedCustomer?.id ?? ''}
                            onChange={e => {
                              const c = allCustomers.find(c => c.id === e.target.value)
                              setAddSelectedCustomer(c ? { id: c.id, code: c.code ?? '?' } : null)
                            }}
                          >
                            <option value="">Choisir...</option>
                            {allCustomers.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                          </select>
                        </div>
                        {/* Quantities */}
                        <div>
                          <label className="text-[10px] text-muted-foreground">Qte dem.</label>
                          <Input type="number" value={addReqQty} onChange={e => setAddReqQty(e.target.value)} className="h-7 text-xs" placeholder="0" min={0} />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground">Qte four.</label>
                          <Input type="number" value={addSupQty} onChange={e => setAddSupQty(e.target.value)} className="h-7 text-xs" placeholder="0" min={0} />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 justify-end">
                        <Button variant="ghost" size="sm" className="text-xs h-7" onClick={resetAddForm}>Annuler</Button>
                        <Button size="sm" className="text-xs h-7 gap-1" onClick={() => handleAddManual(ws.wholesalerId)} disabled={isUpserting}>
                          {isUpserting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Ajouter
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Products table — all rows with expand */}
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">CIP13</TableHead>
                        <TableHead className="text-xs">Produit</TableHead>
                        <TableHead className="text-xs">Client</TableHead>
                        <TableHead className="text-xs text-right">Qte dem.</TableHead>
                        <TableHead className="text-xs text-right">Qte four.</TableHead>
                        <TableHead className="text-xs">Source</TableHead>
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs w-[60px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayRows.map((row, idx) => {
                        // Find corresponding manual attribution for edit
                        const wsManuals = manualByWholesaler.get(ws.wholesalerId) ?? []
                        const matchingManual = row.source === 'MANUEL'
                          ? wsManuals.find(m =>
                              (m.product?.cip13 ?? '') === row.cip13 &&
                              (m.customer?.code ?? '') === row.client &&
                              m.supplier_quantity === row.supplierQty
                            )
                          : null
                        const isEditing = matchingManual && editingAttrId === matchingManual.id

                        return (
                          <TableRow key={`${row.cip13}-${row.client}-${idx}`} className={row.source === 'MANUEL' ? 'bg-blue-50/30 dark:bg-blue-950/10' : ''}>
                            <TableCell className="font-mono text-xs">{row.cip13}</TableCell>
                            <TableCell className="text-xs truncate max-w-[180px]">{row.productName}</TableCell>
                            <TableCell className="text-xs font-medium">{row.client}</TableCell>
                            <TableCell className="text-xs text-right tabular-nums">
                              {isEditing ? (
                                <Input type="number" value={editReqQty} onChange={e => setEditReqQty(e.target.value)}
                                  className="h-6 w-16 text-xs text-right ml-auto" min={0}
                                  onKeyDown={e => { if (e.key === 'Enter' && matchingManual) handleSaveEdit(matchingManual); if (e.key === 'Escape') setEditingAttrId(null) }}
                                />
                              ) : row.requestedQty.toLocaleString('fr-FR')}
                            </TableCell>
                            <TableCell className="text-xs text-right tabular-nums font-medium">
                              {isEditing ? (
                                <Input type="number" value={editSupQty} onChange={e => setEditSupQty(e.target.value)}
                                  className="h-6 w-16 text-xs text-right ml-auto" min={0} autoFocus
                                  onKeyDown={e => { if (e.key === 'Enter' && matchingManual) handleSaveEdit(matchingManual); if (e.key === 'Escape') setEditingAttrId(null) }}
                                />
                              ) : row.supplierQty.toLocaleString('fr-FR')}
                            </TableCell>
                            <TableCell>
                              <Badge variant={row.source === 'MANUEL' ? 'default' : 'secondary'} className="text-[9px]">{row.source}</Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{row.editedAt}</TableCell>
                            <TableCell className="text-right">
                              {row.source === 'MANUEL' && matchingManual && (
                                isEditing ? (
                                  <div className="flex items-center gap-0.5 justify-end">
                                    <button type="button" onClick={() => handleSaveEdit(matchingManual)} className="p-0.5 hover:text-green-600"><Check className="h-3 w-3" /></button>
                                    <button type="button" onClick={() => setEditingAttrId(null)} className="p-0.5 hover:text-red-600"><X className="h-3 w-3" /></button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-0.5 justify-end">
                                    <button type="button" onClick={() => handleStartEdit(matchingManual)} className="p-0.5 hover:text-blue-600" title="Editer"><Pencil className="h-3 w-3" /></button>
                                    <button type="button" onClick={() => deactivate(matchingManual.id)} className="p-0.5 hover:text-red-600" title="Retirer"><X className="h-3 w-3" /></button>
                                  </div>
                                )
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>

                {/* Expand/Collapse button */}
                {hasMore && (
                  <button type="button" onClick={() => toggleExpand(ws.wholesalerId)}
                    className="w-full py-1.5 text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 transition-colors">
                    {isExpanded ? (
                      <><ChevronUp className="h-3 w-3" /> Reduire</>
                    ) : (
                      <><ChevronDown className="h-3 w-3" /> Voir les {filteredRows.length - 5} autres lignes</>
                    )}
                  </button>
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
              <Send className="h-3 w-3" /> {exportedWholesalers.size}/{needs.length} exportes
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

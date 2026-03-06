import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Play, Pause, SkipForward, SkipBack, RotateCcw, ChevronRight,
  Boxes, Truck, Users, Package, ShieldCheck, AlertTriangle, Zap,
  Search, CheckCircle, XCircle, Filter, X,
} from 'lucide-react'
import type { AllocationLog, AllocationReason } from '@/lib/allocation-engine'

interface AllocationVisualizerProps {
  logs: AllocationLog[]
  onClose?: () => void
}

const REASON_CONFIG: Record<AllocationReason, { label: string; color: string; icon: typeof Boxes; bg: string }> = {
  fefo_lot:        { label: 'Stock FEFO',       color: 'text-violet-700',  icon: Boxes,          bg: 'bg-violet-50 border-violet-200' },
  quota:           { label: 'Quota direct',     color: 'text-blue-700',    icon: ShieldCheck,    bg: 'bg-blue-50 border-blue-200' },
  quota_balanced:  { label: 'Quota reparti',    color: 'text-teal-700',    icon: ShieldCheck,    bg: 'bg-teal-50 border-teal-200' },
  fallback:        { label: 'Repartition',      color: 'text-amber-700',   icon: Truck,          bg: 'bg-amber-50 border-amber-200' },
  fallback_single: { label: 'Grossiste unique', color: 'text-orange-700',  icon: Truck,          bg: 'bg-orange-50 border-orange-200' },
  max_pct_cap:     { label: 'Limite % max',     color: 'text-red-700',     icon: AlertTriangle,  bg: 'bg-red-50 border-red-200' },
  ansm_blocked:    { label: 'Bloque ANSM',     color: 'text-rose-700',    icon: AlertTriangle,  bg: 'bg-rose-50 border-rose-200' },
  min_lot_reject:  { label: 'Lot min refuse', color: 'text-pink-700',    icon: AlertTriangle,  bg: 'bg-pink-50 border-pink-200' },
}

const SPEED_OPTIONS = [
  { label: '0.5x', ms: 1200 },
  { label: '1x', ms: 600 },
  { label: '2x', ms: 300 },
  { label: '5x', ms: 120 },
]

export default function AllocationVisualizer({ logs, onClose }: AllocationVisualizerProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speedIdx, setSpeedIdx] = useState(1)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Filters
  const [searchText, setSearchText] = useState('')
  const [filterReason, setFilterReason] = useState<string>('all')
  const [filterClient, setFilterClient] = useState<string>('all')

  const hasFilters = searchText !== '' || filterReason !== 'all' || filterClient !== 'all'

  // Unique clients for filter dropdown
  const uniqueClients = useMemo(() => {
    const map = new Map<string, string>()
    for (const log of logs) {
      if (!map.has(log.customer)) map.set(log.customer, log.customerName)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [logs])

  // Filtered logs indices (maps filtered index -> original index)
  const filteredIndices = useMemo(() => {
    const needle = searchText.toLowerCase()
    const indices: number[] = []
    for (let i = 0; i < logs.length; i++) {
      const log = logs[i]
      if (filterReason !== 'all' && log.reason !== filterReason) continue
      if (filterClient !== 'all' && log.customer !== filterClient) continue
      if (needle && !(
        log.productName.toLowerCase().includes(needle) ||
        log.productCip13.includes(needle) ||
        log.customerName.toLowerCase().includes(needle) ||
        log.customer.toLowerCase().includes(needle) ||
        log.wholesalerName.toLowerCase().includes(needle) ||
        log.wholesaler.toLowerCase().includes(needle) ||
        (log.lot?.toLowerCase().includes(needle) ?? false)
      )) continue
      indices.push(i)
    }
    return indices
  }, [logs, searchText, filterReason, filterClient])

  const total = filteredIndices.length
  // currentStep is index into filteredIndices
  const originalIdx = filteredIndices[currentStep] ?? 0
  const current = logs[originalIdx] as AllocationLog | undefined

  // Running totals up to current original index (inclusive), computed on ALL logs
  const runningStats = useMemo(() => {
    let allocated = 0
    let requested = 0
    const customerQty = new Map<string, number>()
    const wholesalerQty = new Map<string, number>()
    const reasonCounts = new Map<AllocationReason, number>()
    const seenOrders = new Set<string>()

    for (let i = 0; i <= originalIdx && i < logs.length; i++) {
      const log = logs[i]
      if (log.reason === 'max_pct_cap' || log.reason === 'ansm_blocked') continue
      allocated += log.allocated
      const orderKey = `${log.customer}-${log.product}`
      if (!seenOrders.has(orderKey)) {
        requested += log.requested
        seenOrders.add(orderKey)
      }
      customerQty.set(log.customer, (customerQty.get(log.customer) ?? 0) + log.allocated)
      wholesalerQty.set(log.wholesaler, (wholesalerQty.get(log.wholesaler) ?? 0) + log.allocated)
      reasonCounts.set(log.reason, (reasonCounts.get(log.reason) ?? 0) + 1)
    }

    return { allocated, requested, customerQty, wholesalerQty, reasonCounts }
  }, [logs, originalIdx])

  // Demand remaining for current step's customer+product
  const demandRemaining = useMemo(() => {
    if (!current || current.reason === 'max_pct_cap' || current.reason === 'ansm_blocked') return null
    let totalAllocatedForOrder = 0
    for (let i = 0; i <= originalIdx && i < logs.length; i++) {
      const log = logs[i]
      if (log.customer === current.customer && log.product === current.product
        && log.reason !== 'max_pct_cap' && log.reason !== 'ansm_blocked') {
        totalAllocatedForOrder += log.allocated
      }
    }
    return {
      customerCode: current.customer,
      customerName: current.customerName,
      productName: current.productName,
      requested: current.requested,
      allocated: totalAllocatedForOrder,
      remaining: Math.max(0, current.requested - totalAllocatedForOrder),
    }
  }, [logs, current, originalIdx])

  const rate = runningStats.requested > 0 ? (runningStats.allocated / runningStats.requested) * 100 : 0

  // Auto-play (navigates filtered steps)
  useEffect(() => {
    if (isPlaying) {
      timerRef.current = setInterval(() => {
        setCurrentStep(prev => {
          if (prev >= total - 1) {
            setIsPlaying(false)
            return prev
          }
          return prev + 1
        })
      }, SPEED_OPTIONS[speedIdx].ms)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isPlaying, speedIdx, total])

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      const activeEl = scrollRef.current.querySelector('[data-active="true"]')
      if (activeEl) activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [currentStep])

  // Reset step when filters change
  useEffect(() => {
    setCurrentStep(0)
    setIsPlaying(false)
  }, [searchText, filterReason, filterClient])

  const goTo = useCallback((step: number) => {
    setCurrentStep(Math.max(0, Math.min(step, total - 1)))
  }, [total])

  const reset = useCallback(() => {
    setIsPlaying(false)
    setCurrentStep(0)
  }, [])

  const clearFilters = useCallback(() => {
    setSearchText('')
    setFilterReason('all')
    setFilterClient('all')
  }, [])

  if (logs.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-muted-foreground">Aucune etape d'allocation a visualiser.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Controls bar */}
      <Card>
        <CardContent className="p-3 flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={reset}>
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => goTo(currentStep - 1)} disabled={currentStep === 0}>
              <SkipBack className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={isPlaying ? 'secondary' : 'default'}
              size="sm"
              className="h-8 gap-1.5 px-3"
              onClick={() => setIsPlaying(!isPlaying)}
              disabled={total === 0}
            >
              {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {isPlaying ? 'Pause' : 'Lecture'}
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => goTo(currentStep + 1)} disabled={currentStep >= total - 1}>
              <SkipForward className="h-3.5 w-3.5" />
            </Button>
          </div>

          <Separator orientation="vertical" className="h-6" />

          {/* Speed */}
          <div className="flex items-center gap-1">
            {SPEED_OPTIONS.map((s, i) => (
              <button
                key={s.label}
                type="button"
                onClick={() => setSpeedIdx(i)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                  speedIdx === i ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <Separator orientation="vertical" className="h-6" />

          {/* Progress */}
          <div className="flex items-center gap-2 flex-1 min-w-[120px]">
            <span className="text-xs tabular-nums font-mono text-muted-foreground">
              {total > 0 ? currentStep + 1 : 0}/{total}
              {hasFilters && <span className="text-muted-foreground/50"> ({logs.length})</span>}
            </span>
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-primary rounded-full"
                animate={{ width: `${total > 0 ? ((currentStep + 1) / total) * 100 : 0}%` }}
                transition={{ duration: 0.15 }}
              />
            </div>
          </div>

          {/* Coverage badge */}
          <Badge variant={rate >= 80 ? 'default' : rate >= 50 ? 'secondary' : 'destructive'} className="text-xs tabular-nums">
            {rate.toFixed(1)}%
          </Badge>

          {onClose && (
            <Button variant="ghost" size="sm" className="h-8 text-xs ml-auto" onClick={onClose}>
              Fermer
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Filter bar */}
      <Card>
        <CardContent className="p-3 flex items-center gap-2 flex-wrap">
          <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />

          <div className="relative flex-1 min-w-[160px] max-w-[280px]">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Rechercher produit, client, grossiste..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>

          <Select value={filterReason} onValueChange={setFilterReason}>
            <SelectTrigger className="h-8 w-[150px] text-xs">
              <SelectValue placeholder="Methode" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes methodes</SelectItem>
              {(Object.entries(REASON_CONFIG) as [AllocationReason, typeof REASON_CONFIG[AllocationReason]][]).map(([key, cfg]) => (
                <SelectItem key={key} value={key}>
                  <span className={`${cfg.color}`}>{cfg.label}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterClient} onValueChange={setFilterClient}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue placeholder="Client" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous clients</SelectItem>
              {uniqueClients.map(([code, name]) => (
                <SelectItem key={code} value={code}>{code} — {name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasFilters && (
            <>
              <Badge variant="secondary" className="text-[10px] gap-1">
                {total}/{logs.length} etapes
              </Badge>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={clearFilters}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {total === 0 && hasFilters && (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground">Aucune etape ne correspond aux filtres.</p>
            <Button variant="link" size="sm" onClick={clearFilters} className="mt-1 text-xs">
              Reinitialiser les filtres
            </Button>
          </CardContent>
        </Card>
      )}

      {total > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Main: current step detail */}
          <div className="lg:col-span-2 space-y-3">
            {/* Active step card */}
            <AnimatePresence mode="wait">
              {current && (
                <motion.div
                  key={originalIdx}
                  initial={{ opacity: 0, y: 10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.98 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card className={`border-2 ${REASON_CONFIG[current.reason].bg}`}>
                    <CardContent className="p-5 space-y-4">
                      {/* Header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs tabular-nums font-mono text-muted-foreground">#{current.step}</span>
                          {(() => {
                            const cfg = REASON_CONFIG[current.reason]
                            return (
                              <Badge variant="outline" className={`gap-1 text-xs ${cfg.color} ${cfg.bg}`}>
                                <cfg.icon className="h-3 w-3" />
                                {cfg.label}
                              </Badge>
                            )
                          })()}
                        </div>
                        <Badge variant="outline" className="text-xs gap-1">
                          <Zap className="h-3 w-3" />
                          Priorite {current.priority}
                        </Badge>
                      </div>

                      {/* Flow visualization */}
                      {current.reason !== 'max_pct_cap' && current.reason !== 'ansm_blocked' ? (
                        <div className="flex items-center gap-3 flex-wrap">
                          {/* Client */}
                          <div className="flex items-center gap-2 bg-background rounded-lg border px-3 py-2">
                            <Users className="h-4 w-4 text-teal-600" />
                            <div>
                              <p className="text-sm font-bold">{current.customer}</p>
                              <p className="text-[10px] text-muted-foreground">{current.customerName}</p>
                            </div>
                          </div>

                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />

                          {/* Product */}
                          <div className="flex items-center gap-2 bg-background rounded-lg border px-3 py-2 max-w-[260px]">
                            <Package className="h-4 w-4 text-blue-600 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-semibold truncate">{current.productName}</p>
                              <p className="text-[10px] text-muted-foreground">CIP: {current.productCip13} · {current.requested} u.</p>
                            </div>
                          </div>

                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />

                          {/* Wholesaler / Lot */}
                          <div className="flex items-center gap-2 bg-background rounded-lg border px-3 py-2">
                            <Truck className="h-4 w-4 text-amber-600 shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-bold">{current.wholesaler}</p>
                              <p className="text-[10px] text-muted-foreground truncate">{current.wholesalerName}</p>
                              {current.lot && (
                                <p className="text-[10px] text-violet-600 flex items-center gap-1 mt-0.5">
                                  <Boxes className="h-2.5 w-2.5 shrink-0" />
                                  Lot {current.lot} · exp. {current.expiry}
                                </p>
                              )}
                            </div>
                          </div>

                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />

                          {/* Result */}
                          <div className={`rounded-lg border px-3 py-2 ${current.full ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
                            <p className={`text-lg font-bold tabular-nums ${current.full ? 'text-green-700' : 'text-amber-700'}`}>
                              {current.allocated}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {current.full ? 'Complet' : `Partiel (${current.allocated}/${current.requested})`}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <AlertTriangle className="h-5 w-5 text-red-500" />
                          <p className="text-sm">{current.detail}</p>
                        </div>
                      )}

                      {/* Demand remaining for this customer+product */}
                      {demandRemaining && (
                        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/50 border border-dashed">
                          <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] text-muted-foreground">
                              Demande <span className="font-semibold text-foreground">{demandRemaining.customerCode}</span> pour ce produit
                            </p>
                          </div>
                          <div className="flex items-center gap-2 text-xs tabular-nums">
                            <span className="text-muted-foreground">{demandRemaining.allocated}/{demandRemaining.requested} u.</span>
                            <Badge
                              variant={demandRemaining.remaining === 0 ? 'default' : 'secondary'}
                              className={`text-[10px] ${demandRemaining.remaining === 0 ? 'bg-green-600' : ''}`}
                            >
                              {demandRemaining.remaining === 0
                                ? 'Satisfait'
                                : `Reste ${demandRemaining.remaining} u.`}
                            </Badge>
                          </div>
                        </div>
                      )}

                      {/* Detail text */}
                      <p className="text-xs text-muted-foreground italic">{current.detail}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Step timeline */}
            <Card>
              <CardContent className="p-0">
                <div ref={scrollRef} className="max-h-[300px] overflow-y-auto p-3 space-y-0.5">
                  {filteredIndices.map((origIdx, filtIdx) => {
                    const log = logs[origIdx]
                    const isActive = filtIdx === currentStep
                    const isPast = filtIdx < currentStep
                    const cfg = REASON_CONFIG[log.reason]
                    const isBlocked = log.reason === 'ansm_blocked' || log.reason === 'max_pct_cap'
                    const StatusIcon = isBlocked ? XCircle : log.full ? CheckCircle : AlertTriangle
                    const statusColor = isBlocked ? 'text-red-400' : log.full ? 'text-green-500' : 'text-amber-500'

                    return (
                      <button
                        key={origIdx}
                        type="button"
                        data-active={isActive}
                        onClick={() => { setIsPlaying(false); goTo(filtIdx) }}
                        className={`w-full flex items-center gap-2 px-2 py-1 rounded text-left transition-all text-[11px] font-mono ${
                          isActive
                            ? 'bg-primary/10 ring-1 ring-primary/30'
                            : isPast
                              ? 'opacity-60 hover:opacity-80'
                              : 'opacity-30 hover:opacity-50'
                        }`}
                      >
                        <StatusIcon className={`h-3 w-3 shrink-0 ${statusColor}`} />
                        <span className="text-muted-foreground w-5 text-right shrink-0">{log.step}</span>
                        <Badge variant="outline" className={`text-[9px] px-1 py-0 h-4 shrink-0 ${cfg.color} ${cfg.bg}`}>
                          {cfg.label.slice(0, 5)}
                        </Badge>
                        <span className="font-semibold w-12 shrink-0">[{log.customer}]</span>
                        <span className="truncate flex-1" title={`${log.productName} (${log.productCip13})`}>{log.productName}</span>
                        <span className="shrink-0" title={log.wholesalerName}>{log.wholesaler}</span>
                        <span className={`tabular-nums shrink-0 font-semibold ${isBlocked ? 'text-red-400' : log.full ? 'text-green-600' : 'text-amber-600'}`}>
                          {log.allocated}/{log.requested}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar: running totals */}
          <div className="space-y-3">
            {/* Running coverage */}
            <Card>
              <CardContent className="p-4 space-y-3">
                <h4 className="text-xs font-semibold text-muted-foreground">Couverture progressive</h4>
                <div className="text-center">
                  <p className={`text-3xl font-bold tabular-nums ${rate >= 80 ? 'text-green-600' : rate >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                    {rate.toFixed(1)}%
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {runningStats.allocated.toLocaleString('fr-FR')} / {runningStats.requested.toLocaleString('fr-FR')} u.
                  </p>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    className={`h-full rounded-full ${rate >= 80 ? 'bg-green-500' : rate >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                    animate={{ width: `${Math.min(rate, 100)}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </CardContent>
            </Card>

            {/* By reason */}
            <Card>
              <CardContent className="p-4 space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground">Par methode</h4>
                {[...runningStats.reasonCounts.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([reason, count]) => {
                    const cfg = REASON_CONFIG[reason]
                    return (
                      <div key={reason} className="flex items-center gap-2">
                        <cfg.icon className={`h-3 w-3 ${cfg.color} shrink-0`} />
                        <span className="text-xs flex-1">{cfg.label}</span>
                        <span className="text-xs font-bold tabular-nums">{count}</span>
                      </div>
                    )
                  })}
              </CardContent>
            </Card>

            {/* By customer (top 6) */}
            <Card>
              <CardContent className="p-4 space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground">Par client</h4>
                {[...runningStats.customerQty.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 6)
                  .map(([code, qty]) => (
                    <div key={code} className="flex items-center gap-2">
                      <span className="text-xs font-mono font-semibold w-14 shrink-0">{code}</span>
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-teal-500 rounded-full"
                          animate={{ width: `${runningStats.allocated > 0 ? (qty / runningStats.allocated) * 100 : 0}%` }}
                          transition={{ duration: 0.3 }}
                        />
                      </div>
                      <span className="text-[10px] tabular-nums text-muted-foreground w-12 text-right">{qty.toLocaleString('fr-FR')}</span>
                    </div>
                  ))}
              </CardContent>
            </Card>

            {/* By wholesaler */}
            <Card>
              <CardContent className="p-4 space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground">Par grossiste</h4>
                {[...runningStats.wholesalerQty.entries()]
                  .filter(([code]) => code !== '-')
                  .sort((a, b) => b[1] - a[1])
                  .map(([code, qty]) => (
                    <div key={code} className="flex items-center gap-2">
                      <span className="text-xs font-mono font-semibold w-14 shrink-0">{code}</span>
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <motion.div
                          className="h-full bg-amber-500 rounded-full"
                          animate={{ width: `${runningStats.allocated > 0 ? (qty / runningStats.allocated) * 100 : 0}%` }}
                          transition={{ duration: 0.3 }}
                        />
                      </div>
                      <span className="text-[10px] tabular-nums text-muted-foreground w-12 text-right">{qty.toLocaleString('fr-FR')}</span>
                    </div>
                  ))}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}

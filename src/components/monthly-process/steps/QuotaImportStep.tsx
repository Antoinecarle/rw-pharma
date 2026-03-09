import { useState, useRef, useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Upload, FileSpreadsheet, Check, AlertTriangle, ArrowRight, Eye, Sparkles, History, Zap, Plus, Warehouse, X } from 'lucide-react'
import { toast } from 'sonner'
import ExampleFilesLoader from '@/components/monthly-process/ExampleFilesLoader'
import type { MonthlyProcess, Wholesaler } from '@/types/database'

// --------------- Types ---------------

interface QuotaColumnMapping {
  cip13: string
  quantity: string
  extra: string
}

const FIELD_LABELS: Record<keyof QuotaColumnMapping, string> = {
  cip13: 'CIP13 Produit *',
  quantity: 'Quantite quota *',
  extra: 'Extra disponible',
}

const REQUIRED_FIELDS: (keyof QuotaColumnMapping)[] = ['cip13', 'quantity']

const STORAGE_KEY = 'rw-pharma-quota-import-history'

interface ImportHistoryEntry {
  fileName: string
  date: string
  rowCount: number
  wholesalerCode: string | null
}

function getImportHistory(): ImportHistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]').slice(0, 3)
  } catch { return [] }
}

function addImportHistory(entry: ImportHistoryEntry) {
  const history = getImportHistory()
  history.unshift(entry)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, 5)))
}

function getMappingStorageKey(wholesalerCode: string) {
  return `rw-pharma-quota-mapping-${wholesalerCode}`
}

function getSavedMapping(wholesalerCode: string): QuotaColumnMapping | null {
  try {
    const saved = localStorage.getItem(getMappingStorageKey(wholesalerCode))
    return saved ? JSON.parse(saved) : null
  } catch { return null }
}

function saveMappingForWholesaler(wholesalerCode: string, mapping: QuotaColumnMapping) {
  localStorage.setItem(getMappingStorageKey(wholesalerCode), JSON.stringify(mapping))
}

interface MappingConfidence {
  field: keyof QuotaColumnMapping
  source: 'auto' | 'saved' | 'manual' | 'none'
}

type FileStatus = 'pending' | 'mapping' | 'preview' | 'importing' | 'done' | 'error'

interface SkippedQuotaItem {
  rowIndex: number
  cip13: string
  quantity: number
  reason: 'unknown_product' | 'invalid_quantity' | 'ansm_blocked'
}

interface QueuedQuotaFile {
  id: string
  file: File
  fileName: string
  detectedWholesaler: string | null
  manualWholesaler: string | null
  status: FileStatus
  headers: string[]
  rows: Record<string, string>[]
  sheetNames: string[]
  selectedSheet: string
  workbook: XLSX.WorkBook | null
  mapping: QuotaColumnMapping
  confidence: MappingConfidence[]
  importResult: { inserted: number; updated: number; errors: number; skipped: number }
  importProgress: { current: number; total: number; phase: string }
  skippedItems: SkippedQuotaItem[]
}

function createQueuedFile(file: File): QueuedQuotaFile {
  return {
    id: crypto.randomUUID(),
    file,
    fileName: file.name,
    detectedWholesaler: null,
    manualWholesaler: null,
    status: 'pending',
    headers: [],
    rows: [],
    sheetNames: [],
    selectedSheet: '',
    workbook: null,
    mapping: { cip13: '', quantity: '', extra: '' },
    confidence: [],
    importResult: { inserted: 0, updated: 0, errors: 0, skipped: 0 },
    importProgress: { current: 0, total: 0, phase: '' },
    skippedItems: [],
  }
}

// --------------- Auto-detect wholesaler from filename ---------------

function detectWholesalerFromFilename(filename: string, wholesalers: Pick<Wholesaler, 'code' | 'name'>[]): string | null {
  const upper = filename.toUpperCase()
  for (const w of wholesalers) {
    if (w.code && upper.includes(w.code.toUpperCase())) return w.code
    if (w.name && upper.includes(w.name.toUpperCase())) return w.code ?? w.name
  }
  return null
}

// --------------- Auto-detect column mapping ---------------

function autoDetectMapping(headers: string[], wholesalerCode: string | null): { mapping: QuotaColumnMapping; confidence: MappingConfidence[] } {
  const saved = wholesalerCode ? getSavedMapping(wholesalerCode) : null
  const confidenceMap: MappingConfidence[] = []

  if (saved && headers.includes(saved.cip13) && headers.includes(saved.quantity)) {
    const resultMapping = { ...saved }
    for (const field of Object.keys(saved) as (keyof QuotaColumnMapping)[]) {
      if (saved[field] && headers.includes(saved[field])) {
        confidenceMap.push({ field, source: 'saved' })
      } else {
        resultMapping[field] = ''
        confidenceMap.push({ field, source: 'none' })
      }
    }
    return { mapping: resultMapping, confidence: confidenceMap }
  }

  const autoMap: QuotaColumnMapping = { cip13: '', quantity: '', extra: '' }
  const usedHeaders = new Set<string>()

  const fieldPatterns: { field: keyof QuotaColumnMapping; patterns: RegExp[] }[] = [
    {
      field: 'cip13',
      patterns: [/^cip\s*13$/i, /cip.*13/i, /^cip$/i, /code.*produit/i, /product.*code/i, /artikelnummer/i, /code.*cip/i],
    },
    {
      field: 'quantity',
      patterns: [/quota/i, /contingent/i, /quantit/i, /^qty/i, /alloue/i, /disponible/i, /menge/i, /quantity/i, /^qte/i],
    },
    {
      field: 'extra',
      patterns: [/extra/i, /suppl/i, /bonus/i, /additionn/i, /zusatz/i, /hors.*quota/i],
    },
  ]

  for (const { field, patterns } of fieldPatterns) {
    for (const pattern of patterns) {
      if (autoMap[field]) break
      const match = headers.find(h => !usedHeaders.has(h) && pattern.test(h))
      if (match) {
        autoMap[field] = match
        usedHeaders.add(match)
        confidenceMap.push({ field, source: 'auto' })
      }
    }
  }

  for (const field of Object.keys(FIELD_LABELS) as (keyof QuotaColumnMapping)[]) {
    if (!confidenceMap.find(c => c.field === field)) {
      confidenceMap.push({ field, source: autoMap[field] ? 'auto' : 'none' })
    }
  }

  return { mapping: autoMap, confidence: confidenceMap }
}

// --------------- Props ---------------

interface QuotaImportStepProps {
  process: MonthlyProcess
  onNext: () => void
}

export default function QuotaImportStep({ process, onNext }: QuotaImportStepProps) {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [queue, setQueue] = useState<QueuedQuotaFile[]>([])
  const [activeFileId, setActiveFileId] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [showSkipped, setShowSkipped] = useState<string | null>(null)

  const { data: existingQuotas } = useQuery({
    queryKey: ['wholesaler_quotas', process.id, 'count'],
    queryFn: async () => {
      const monthStr = `${process.year}-${String(process.month).padStart(2, '0')}-01`
      const { data } = await supabase
        .from('wholesaler_quotas')
        .select('id')
        .eq('month', monthStr)
      return data?.length ?? 0
    },
  })

  const { data: wholesalers } = useQuery({
    queryKey: ['wholesalers', 'all'],
    queryFn: async () => {
      const { data } = await supabase.from('wholesalers').select('id, code, name')
      return (data ?? []) as Pick<Wholesaler, 'id' | 'code' | 'name'>[]
    },
  })

  const importHistory = getImportHistory()

  // --------------- Queue helpers ---------------

  const updateFile = useCallback((id: string, updates: Partial<QueuedQuotaFile>) => {
    setQueue(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f))
  }, [])

  const allDone = queue.length > 0 && queue.every(f => f.status === 'done')
  const hasActiveImport = queue.some(f => f.status === 'importing')
  const totalInserted = queue.filter(f => f.status === 'done').reduce((s, f) => s + f.importResult.inserted, 0)

  const getWholesalerCode = (f: QueuedQuotaFile) => f.detectedWholesaler ?? f.manualWholesaler

  // --------------- File processing ---------------

  const processFile = useCallback((file: File) => {
    const qf = createQueuedFile(file)

    const reader = new FileReader()
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target?.result as ArrayBuffer)
      const wb = XLSX.read(data, { type: 'array' })
      const sheetName = wb.SheetNames[0]
      const ws = wb.Sheets[sheetName]
      const json = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' })

      if (json.length === 0) {
        toast.error(`Fichier "${file.name}" vide`)
        return
      }

      const hdrs = Object.keys(json[0])
      const detected = wholesalers ? detectWholesalerFromFilename(file.name, wholesalers) : null
      const { mapping, confidence } = autoDetectMapping(hdrs, detected)

      const updatedFile: QueuedQuotaFile = {
        ...qf,
        status: 'mapping',
        detectedWholesaler: detected,
        headers: hdrs,
        rows: json,
        sheetNames: wb.SheetNames,
        selectedSheet: sheetName,
        workbook: wb,
        mapping,
        confidence,
      }

      setQueue(prev => [...prev, updatedFile])
      setActiveFileId(updatedFile.id)
    }
    reader.readAsArrayBuffer(file)
  }, [wholesalers])

  const handleFiles = useCallback((files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      processFile(file)
    }
  }, [processFile])

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    handleFiles(files)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true) }, [])
  const handleDragLeave = useCallback(() => setIsDragOver(false), [])

  const handleSheetChange = (fileId: string, sheetName: string) => {
    const f = queue.find(x => x.id === fileId)
    if (!f || !f.workbook) return
    const ws = f.workbook.Sheets[sheetName]
    const json = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' })
    if (json.length === 0) { toast.error('Feuille vide'); return }
    const hdrs = Object.keys(json[0])
    const wholesalerCode = getWholesalerCode(f)
    const { mapping, confidence } = autoDetectMapping(hdrs, wholesalerCode)
    updateFile(fileId, { selectedSheet: sheetName, headers: hdrs, rows: json, mapping, confidence })
  }

  const updateMapping = (fileId: string, field: keyof QuotaColumnMapping, value: string) => {
    const f = queue.find(x => x.id === fileId)
    if (!f) return
    const newMapping = { ...f.mapping, [field]: value === 'none' ? '' : value }
    const newConfidence = f.confidence.map(c =>
      c.field === field ? { ...c, source: value === 'none' ? 'none' as const : 'manual' as const } : c
    )
    updateFile(fileId, { mapping: newMapping, confidence: newConfidence })
  }

  const removeFile = (fileId: string) => {
    setQueue(prev => prev.filter(f => f.id !== fileId))
    if (activeFileId === fileId) setActiveFileId(null)
  }

  const canProceed = (f: QueuedQuotaFile) => {
    const wholesalerCode = getWholesalerCode(f)
    return REQUIRED_FIELDS.every(fld => f.mapping[fld]) && !!wholesalerCode
  }

  // --------------- Import mutation ---------------

  const importMut = useMutation({
    mutationFn: async (fileId: string) => {
      const f = queue.find(x => x.id === fileId)
      if (!f) throw new Error('Fichier introuvable')

      const wholesalerCode = getWholesalerCode(f)

      updateFile(fileId, { status: 'importing', importProgress: { current: 0, total: f.rows.length, phase: 'Chargement des references...' } })

      // Load all products (paginated to avoid 1000-row limit)
      let allProducts: { id: string; cip13: string; name: string; is_ansm_blocked: boolean }[] = []
      let from = 0
      const pageSize = 1000
      while (true) {
        const { data: page } = await supabase.from('products').select('id, cip13, name, is_ansm_blocked').range(from, from + pageSize - 1)
        if (!page || page.length === 0) break
        allProducts = allProducts.concat(page)
        if (page.length < pageSize) break
        from += pageSize
      }

      const productMap = new Map(allProducts.map(p => [p.cip13, p]))
      const wholesalersList = wholesalers ?? []
      const wholesaler = wholesalersList.find(w => w.code?.toUpperCase() === wholesalerCode?.toUpperCase())

      if (!wholesaler) {
        throw new Error(`Grossiste "${wholesalerCode ?? '?'}" introuvable en base. Verifiez le code grossiste.`)
      }

      const monthStr = `${process.year}-${String(process.month).padStart(2, '0')}-01`
      let inserted = 0
      let updated = 0
      let errors = 0
      let skipped = 0
      const skippedDetails: SkippedQuotaItem[] = []
      const batchSize = 100

      updateFile(fileId, { importProgress: { current: 0, total: f.rows.length, phase: 'Validation et insertion...' } })

      for (let i = 0; i < f.rows.length; i += batchSize) {
        const batch = f.rows.slice(i, i + batchSize).map((row, batchIdx) => {
          const rowIndex = i + batchIdx
          const cip13 = String(row[f.mapping.cip13] || '').trim()
          const qty = parseInt(String(row[f.mapping.quantity] || '0').replace(/\s/g, ''), 10)
          const extra = f.mapping.extra ? parseInt(String(row[f.mapping.extra] || '0').replace(/\s/g, ''), 10) || 0 : 0

          const product = productMap.get(cip13)

          if (!product) {
            skippedDetails.push({ rowIndex, cip13, quantity: qty, reason: 'unknown_product' })
            return null
          }

          if (qty <= 0 && extra <= 0) {
            skippedDetails.push({ rowIndex, cip13, quantity: qty, reason: 'invalid_quantity' })
            return null
          }

          return {
            wholesaler_id: wholesaler.id,
            product_id: product.id,
            monthly_process_id: process.id,
            month: monthStr,
            quota_quantity: qty > 0 ? qty : 0,
            extra_available: extra,
            import_file_name: f.fileName,
            metadata: {},
          }
        })

        const validBatch = batch.filter(Boolean) as NonNullable<typeof batch[number]>[]
        skipped += batch.length - validBatch.length

        if (validBatch.length > 0) {
          const { error, data } = await supabase
            .from('wholesaler_quotas')
            .upsert(validBatch, { onConflict: 'wholesaler_id,product_id,month', ignoreDuplicates: false })
            .select('id')

          if (error) {
            errors += validBatch.length
            console.error('Batch error:', error)
          } else {
            // We can't easily distinguish inserted vs updated from upsert response,
            // so we count all as "processed" and track separately
            inserted += data?.length ?? validBatch.length
          }
        }

        updateFile(fileId, {
          importProgress: {
            current: Math.min(i + batchSize, f.rows.length),
            total: f.rows.length,
            phase: `${Math.min(i + batchSize, f.rows.length)} / ${f.rows.length} lignes traitees`,
          },
        })
      }

      // Update quotas_count on the process
      const totalQuotas = (existingQuotas ?? 0) + inserted
      await supabase
        .from('monthly_processes')
        .update({ quotas_count: totalQuotas, status: 'importing_quotas' })
        .eq('id', process.id)

      if (wholesalerCode) {
        saveMappingForWholesaler(wholesalerCode, f.mapping)
      }

      addImportHistory({
        fileName: f.fileName,
        date: new Date().toISOString(),
        rowCount: f.rows.length,
        wholesalerCode,
      })

      return { fileId, inserted, updated, errors, skipped, skippedDetails }
    },
    onSuccess: (result) => {
      updateFile(result.fileId, {
        status: 'done',
        importResult: { inserted: result.inserted, updated: result.updated, errors: result.errors, skipped: result.skipped },
        skippedItems: result.skippedDetails,
      })
      queryClient.invalidateQueries({ queryKey: ['wholesaler_quotas'] })
      queryClient.invalidateQueries({ queryKey: ['monthly-processes'] })
      toast.success(`${result.inserted} quotas importes`)
    },
    onError: (err: Error, fileId: string) => {
      updateFile(fileId, { status: 'mapping' })
      toast.error(`Erreur: ${err.message}`)
    },
  })

  // --------------- Render helpers ---------------

  const getConfidenceBadge = (conf: MappingConfidence) => {
    if (conf.source === 'none') return null
    if (conf.source === 'saved') return <Badge variant="default" className="text-[9px] h-4 gap-0.5"><History className="h-2.5 w-2.5" /> Memorise</Badge>
    if (conf.source === 'auto') return <Badge variant="secondary" className="text-[9px] h-4 gap-0.5"><Zap className="h-2.5 w-2.5" /> Auto</Badge>
    return null
  }

  const getSampleValues = (f: QueuedQuotaFile, field: keyof QuotaColumnMapping) => {
    const col = f.mapping[field]
    if (!col) return []
    return f.rows.slice(0, 3).map(r => String(r[col] || '').trim()).filter(Boolean)
  }

  // --------------- File card render ---------------

  const renderFileCard = (f: QueuedQuotaFile) => {
    const isActive = activeFileId === f.id
    const wholesalerCode = getWholesalerCode(f)
    const progressPercent = f.importProgress.total > 0 ? (f.importProgress.current / f.importProgress.total) * 100 : 0

    return (
      <div key={f.id} className="space-y-0">
        <Card
          className={`transition-all cursor-pointer ${
            f.status === 'done'
              ? 'border-green-200 bg-green-50/30 dark:bg-green-950/20'
              : f.status === 'error'
                ? 'border-red-200 bg-red-50/30'
                : isActive
                  ? 'border-primary/40 bg-primary/[0.02]'
                  : 'hover:border-primary/20'
          }`}
          onClick={() => {
            if (f.status !== 'importing') setActiveFileId(isActive ? null : f.id)
          }}
        >
          <CardContent className="p-3.5 flex items-center gap-3">
            <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
              f.status === 'done' ? 'bg-green-100 dark:bg-green-900' : 'bg-muted'
            }`}>
              {f.status === 'done'
                ? <Check className="h-4 w-4 text-green-600" />
                : f.status === 'importing'
                  ? <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                  : <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
              }
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium truncate">{f.fileName}</span>
                <span className="text-xs text-muted-foreground">{f.rows.length} lignes</span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                {wholesalerCode ? (
                  <Badge variant={f.detectedWholesaler ? 'default' : 'secondary'} className="text-[10px] h-4 gap-0.5">
                    {f.detectedWholesaler ? <Sparkles className="h-2.5 w-2.5" /> : <Warehouse className="h-2.5 w-2.5" />}
                    {wholesalerCode}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] h-4 text-amber-600 border-amber-200">
                    Grossiste non defini
                  </Badge>
                )}
                {f.status === 'done' && (
                  <span className="text-[11px] text-green-600 font-medium">
                    {f.importResult.inserted} importes
                    {f.importResult.skipped > 0 && <span className="text-amber-600"> / {f.importResult.skipped} ignores</span>}
                  </span>
                )}
                {f.confidence.some(c => c.source === 'saved') && f.status !== 'done' && (
                  <Badge variant="secondary" className="text-[9px] h-4 gap-0.5">
                    <History className="h-2.5 w-2.5" /> Mapping memorise
                  </Badge>
                )}
              </div>
            </div>

            {f.status !== 'done' && f.status !== 'importing' && (
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); removeFile(f.id) }}>
                <X className="h-3.5 w-3.5" />
              </Button>
            )}

            {f.status === 'done' && (
              <div className="h-8 w-8 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center shrink-0">
                <Check className="h-4 w-4 text-green-600" />
              </div>
            )}
          </CardContent>

          {f.status === 'importing' && (
            <div className="px-3.5 pb-3">
              <Progress value={progressPercent} className="h-1.5" />
              <p className="text-[11px] text-muted-foreground mt-1">{f.importProgress.phase}</p>
            </div>
          )}
        </Card>

        {/* Expanded mapping/preview */}
        {isActive && f.status !== 'done' && f.status !== 'importing' && (
          <Card className="border-t-0 rounded-t-none border-primary/20">
            <CardContent className="p-4 space-y-4">
              {/* Wholesaler selector (when not auto-detected) */}
              {!f.detectedWholesaler && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold flex items-center gap-1.5">
                    <Warehouse className="h-3 w-3" /> Grossiste pour ce fichier *
                  </Label>
                  <Select
                    value={f.manualWholesaler ?? 'none'}
                    onValueChange={(v) => updateFile(f.id, { manualWholesaler: v === 'none' ? null : v })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Selectionner le grossiste..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- Selectionner --</SelectItem>
                      {(wholesalers ?? []).map(w => (
                        <SelectItem key={w.id} value={w.code ?? w.id}>{w.code} — {w.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Sheet selector */}
              {f.sheetNames.length > 1 && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Feuille</Label>
                  <Select value={f.selectedSheet} onValueChange={(v) => handleSheetChange(f.id, v)}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {f.sheetNames.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Column mapping */}
              {(f.status === 'mapping' || f.status === 'pending') && (
                <>
                  <p className="text-sm text-muted-foreground">Mappez les colonnes aux champs quotas.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {(Object.keys(FIELD_LABELS) as (keyof QuotaColumnMapping)[]).map((field) => {
                      const samples = getSampleValues(f, field)
                      const conf = f.confidence.find(c => c.field === field)
                      return (
                        <div key={field} className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Label className="text-xs">{FIELD_LABELS[field]}</Label>
                            {conf && getConfidenceBadge(conf)}
                            {f.mapping[field] && <Check className="h-3 w-3 text-green-500 ml-auto" />}
                          </div>
                          <Select
                            value={f.mapping[field] || 'none'}
                            onValueChange={(v) => updateMapping(f.id, field, v)}
                          >
                            <SelectTrigger className="h-9"><SelectValue placeholder="Non mappe" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">-- Non mappe --</SelectItem>
                              {f.headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          {samples.length > 0 && (
                            <p className="text-[10px] text-muted-foreground font-mono truncate">
                              Ex: {samples.join(', ')}
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  <div className="flex items-center gap-2">
                    <Progress
                      value={(Object.values(f.mapping).filter(Boolean).length / Object.keys(f.mapping).length) * 100}
                      className="h-1.5 flex-1"
                    />
                    <span className="text-xs text-muted-foreground">
                      {Object.values(f.mapping).filter(Boolean).length}/{Object.keys(f.mapping).length} champs
                    </span>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={() => {
                        if (canProceed(f)) updateFile(f.id, { status: 'preview' })
                        else toast.error('Champs obligatoires manquants (CIP13, Quantite, Grossiste)')
                      }}
                      disabled={!canProceed(f)}
                    >
                      Apercu
                    </Button>
                  </div>
                </>
              )}

              {/* Preview */}
              {f.status === 'preview' && (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Apercu des 10 premieres lignes sur {f.rows.length} total. Grossiste : <strong>{wholesalerCode}</strong>
                  </p>
                  <div className="border rounded-lg overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">#</TableHead>
                          <TableHead>CIP13</TableHead>
                          <TableHead>Quantite quota</TableHead>
                          <TableHead>Extra</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {f.rows.slice(0, 10).map((row, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                            <TableCell className="font-mono text-sm">{row[f.mapping.cip13]}</TableCell>
                            <TableCell>{row[f.mapping.quantity]}</TableCell>
                            <TableCell>{f.mapping.extra ? row[f.mapping.extra] : '-'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex justify-between">
                    <Button variant="outline" size="sm" onClick={() => updateFile(f.id, { status: 'mapping' })}>
                      Retour au mapping
                    </Button>
                    <Button size="sm" onClick={() => importMut.mutate(f.id)} disabled={hasActiveImport}>
                      Importer {f.rows.length} quotas
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Skipped items warning */}
        {f.status === 'done' && f.skippedItems.length > 0 && (
          <Card className="border-t-0 rounded-t-none border-amber-200/60 bg-amber-50/30 dark:bg-amber-950/20">
            <CardContent className="p-3 flex items-center gap-3">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
              <p className="text-xs flex-1">{f.skippedItems.length} lignes ignorees (produits inconnus / quantites invalides)</p>
              <Button
                variant="outline"
                size="sm"
                className="gap-1 shrink-0 text-xs h-7"
                onClick={(e) => { e.stopPropagation(); setShowSkipped(showSkipped === f.id ? null : f.id) }}
              >
                <Eye className="h-3 w-3" /> {showSkipped === f.id ? 'Masquer' : 'Voir'}
              </Button>
            </CardContent>
            {showSkipped === f.id && (
              <div className="px-3 pb-3">
                <div className="border rounded-lg overflow-x-auto max-h-48 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">Ligne</TableHead>
                        <TableHead>CIP13</TableHead>
                        <TableHead>Quantite</TableHead>
                        <TableHead>Raison</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {f.skippedItems.slice(0, 50).map((item, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs">{item.rowIndex + 1}</TableCell>
                          <TableCell className="font-mono text-xs">{item.cip13}</TableCell>
                          <TableCell className="text-xs">{item.quantity}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[9px]">
                              {item.reason === 'unknown_product' ? 'Produit inconnu' :
                               item.reason === 'invalid_quantity' ? 'Quantite invalide' : 'Bloque ANSM'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </Card>
        )}
      </div>
    )
  }

  // --------------- Main render ---------------

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold">Import des Quotas Grossistes</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Importez les fichiers de quotas recus des grossistes pour ce mois. Un fichier par grossiste.
        </p>
      </div>

      {existingQuotas != null && existingQuotas > 0 && queue.length === 0 && (
        <Card className="ivory-card-highlight">
          <CardContent className="p-4 flex items-center gap-3">
            <FileSpreadsheet className="h-5 w-5 text-primary shrink-0" />
            <p className="text-sm">
              <strong>{existingQuotas}</strong> quotas deja importes pour ce mois.
            </p>
          </CardContent>
        </Card>
      )}

      {/* File queue */}
      {queue.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium">{queue.length} fichier{queue.length > 1 ? 's' : ''}</span>
            <Badge variant="secondary" className="text-xs gap-1">
              <Check className="h-3 w-3" />
              {queue.filter(f => f.status === 'done').length}/{queue.length} importes
            </Badge>
            {(totalInserted > 0 || (existingQuotas ?? 0) > 0) && (
              <Badge variant="default" className="text-xs gap-1">
                {totalInserted + (existingQuotas ?? 0)} quotas total
              </Badge>
            )}
          </div>

          <div className="space-y-2">
            {queue.map(f => renderFileCard(f))}
          </div>
        </div>
      )}

      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-xl text-center cursor-pointer transition-all duration-200 ${
          queue.length > 0 ? 'p-6' : 'p-10'
        } ${
          isDragOver
            ? 'border-primary bg-primary/5 scale-[1.01]'
            : 'hover:border-primary/50 hover:bg-muted/30'
        }`}
        onClick={() => fileRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <div className={`mx-auto mb-3 flex items-center justify-center transition-all ${
          queue.length > 0 ? 'h-10 w-10 rounded-xl' : 'h-14 w-14 rounded-2xl'
        } ${isDragOver ? 'bg-primary/20 scale-110' : 'bg-muted'}`}>
          {queue.length > 0
            ? <Plus className={`h-5 w-5 transition-colors ${isDragOver ? 'text-primary' : 'text-muted-foreground'}`} />
            : <Upload className={`h-7 w-7 transition-colors ${isDragOver ? 'text-primary' : 'text-muted-foreground'}`} />
          }
        </div>
        <p className="text-sm font-medium">
          {isDragOver
            ? 'Deposez les fichiers ici'
            : queue.length > 0
              ? 'Ajouter un autre fichier grossiste'
              : 'Deposez des fichiers Excel de quotas ou cliquez pour selectionner'
          }
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          .xlsx, .xls, .csv — Un fichier par grossiste (Alliance, CERP, OCP, Epsilon...)
        </p>
      </div>
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileInput} multiple className="hidden" />

      {/* Example files suggestion */}
      {queue.length === 0 && (
        <ExampleFilesLoader category="quotas" onLoadFiles={(files) => handleFiles(files)} />
      )}

      {/* Import history */}
      {queue.length === 0 && importHistory.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <History className="h-3 w-3" /> Derniers imports quotas
          </p>
          <div className="flex flex-wrap gap-2">
            {importHistory.map((h, i) => (
              <Badge key={i} variant="outline" className="gap-1.5 py-1 px-2.5 text-xs">
                <FileSpreadsheet className="h-3 w-3" />
                {h.fileName.length > 25 ? h.fileName.slice(0, 25) + '...' : h.fileName}
                <span className="text-muted-foreground">
                  {h.rowCount} lignes
                  {h.wholesalerCode && <> &middot; {h.wholesalerCode}</>}
                </span>
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Next step */}
      <div className="flex justify-end">
        {(allDone || (existingQuotas != null && existingQuotas > 0)) && !hasActiveImport && (
          <Button onClick={onNext} className="gap-2">
            Passer aux commandes <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}

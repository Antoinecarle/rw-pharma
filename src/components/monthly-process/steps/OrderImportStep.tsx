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
import { Upload, FileSpreadsheet, Check, AlertTriangle, ArrowRight, Eye, Sparkles, History, Zap, Plus, User, X } from 'lucide-react'
import { toast } from 'sonner'
import SkippedItemsReviewModal, {
  type SkippedItem, type ResolvedItem,
} from '@/components/allocations/SkippedItemsReviewModal'
import type { MonthlyProcess, Customer, Product } from '@/types/database'

// --------------- Types ---------------

interface OrderColumnMapping {
  cip13: string
  quantity: string
  unit_price: string
}

const FIELD_LABELS: Record<keyof OrderColumnMapping, string> = {
  cip13: 'CIP13 Produit *',
  quantity: 'Quantite *',
  unit_price: 'Prix unitaire',
}

const REQUIRED_FIELDS: (keyof OrderColumnMapping)[] = ['cip13', 'quantity']

const CLIENT_CODES = ['ORI', 'MPA', 'MEDCOR', 'CC', 'ABA', 'BMODESTO', 'AXI', 'BROCACEF', '2CARE4', 'MELY']

const STORAGE_KEY = 'rw-pharma-import-history'

interface ImportHistoryEntry {
  fileName: string
  date: string
  rowCount: number
  clientCode: string | null
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

function detectClientFromFilename(filename: string): string | null {
  const upper = filename.toUpperCase()
  for (const code of CLIENT_CODES) {
    if (upper.includes(code)) return code
  }
  return null
}

function getMappingStorageKey(customerCode: string) {
  return `rw-pharma-mapping-${customerCode}`
}

function getSavedMapping(customerCode: string): OrderColumnMapping | null {
  try {
    const saved = localStorage.getItem(getMappingStorageKey(customerCode))
    return saved ? JSON.parse(saved) : null
  } catch { return null }
}

function saveMappingForCustomer(customerCode: string, mapping: OrderColumnMapping) {
  localStorage.setItem(getMappingStorageKey(customerCode), JSON.stringify(mapping))
}

interface MappingConfidence {
  field: keyof OrderColumnMapping
  source: 'auto' | 'saved' | 'manual' | 'none'
}

type FileStatus = 'pending' | 'mapping' | 'preview' | 'importing' | 'done' | 'error'

interface QueuedFile {
  id: string
  file: File
  fileName: string
  detectedClient: string | null
  manualClient: string | null
  status: FileStatus
  headers: string[]
  rows: Record<string, string>[]
  sheetNames: string[]
  selectedSheet: string
  workbook: XLSX.WorkBook | null
  mapping: OrderColumnMapping
  confidence: MappingConfidence[]
  importResult: { inserted: number; errors: number; skipped: number }
  importProgress: { current: number; total: number; phase: string }
  skippedItems: SkippedItem[]
}

function createQueuedFile(file: File): QueuedFile {
  const fileName = file.name
  const detectedClient = detectClientFromFilename(fileName)
  return {
    id: crypto.randomUUID(),
    file,
    fileName,
    detectedClient,
    manualClient: null,
    status: 'pending',
    headers: [],
    rows: [],
    sheetNames: [],
    selectedSheet: '',
    workbook: null,
    mapping: { cip13: '', quantity: '', unit_price: '' },
    confidence: [],
    importResult: { inserted: 0, errors: 0, skipped: 0 },
    importProgress: { current: 0, total: 0, phase: '' },
    skippedItems: [],
  }
}

// --------------- Auto-detect column mapping ---------------

function autoDetectMapping(headers: string[], clientCode: string | null): { mapping: OrderColumnMapping; confidence: MappingConfidence[] } {
  const saved = clientCode ? getSavedMapping(clientCode) : null
  const confidenceMap: MappingConfidence[] = []

  if (saved && headers.includes(saved.cip13) && headers.includes(saved.quantity)) {
    const resultMapping = { ...saved }
    for (const field of Object.keys(saved) as (keyof OrderColumnMapping)[]) {
      if (saved[field] && headers.includes(saved[field])) {
        confidenceMap.push({ field, source: 'saved' })
      } else {
        resultMapping[field] = ''
        confidenceMap.push({ field, source: 'none' })
      }
    }
    return { mapping: resultMapping, confidence: confidenceMap }
  }

  const autoMap: OrderColumnMapping = { cip13: '', quantity: '', unit_price: '' }
  const usedHeaders = new Set<string>()

  const fieldPatterns: { field: keyof OrderColumnMapping; patterns: RegExp[] }[] = [
    {
      field: 'cip13',
      patterns: [/^cip\s*13$/i, /cip.*13/i, /^cip$/i, /artikelnummer/i, /code.*cip/i, /product.*code/i],
    },
    {
      field: 'quantity',
      patterns: [/qte.*command/i, /quantit/i, /^qty/i, /quantity/i, /^qte/i, /commandee?/i, /menge/i, /bestell/i, /ordered/i],
    },
    {
      field: 'unit_price',
      patterns: [/prix.*unit/i, /unit.*pri/i, /price/i, /^prix/i, /^pfht$/i, /einkaufspreis/i, /preis/i],
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

  for (const field of Object.keys(FIELD_LABELS) as (keyof OrderColumnMapping)[]) {
    if (!confidenceMap.find(c => c.field === field)) {
      confidenceMap.push({ field, source: autoMap[field] ? 'auto' : 'none' })
    }
  }

  return { mapping: autoMap, confidence: confidenceMap }
}

// --------------- Props ---------------

interface OrderImportStepProps {
  process: MonthlyProcess
  onNext: () => void
}

export default function OrderImportStep({ process, onNext }: OrderImportStepProps) {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [queue, setQueue] = useState<QueuedFile[]>([])
  const [activeFileId, setActiveFileId] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [skippedModalOpen, setSkippedModalOpen] = useState(false)
  const [skippedModalFileId, setSkippedModalFileId] = useState<string | null>(null)
  const [cachedCustomers, setCachedCustomers] = useState<Pick<Customer, 'id' | 'code' | 'name'>[]>([])
  const [cachedProducts, setCachedProducts] = useState<Pick<Product, 'id' | 'cip13' | 'name'>[]>([])

  const { data: existingOrders } = useQuery({
    queryKey: ['orders', process.id, 'count'],
    queryFn: async () => {
      const { count } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('monthly_process_id', process.id)
      return count ?? 0
    },
  })

  const { data: customers } = useQuery({
    queryKey: ['customers', 'all'],
    queryFn: async () => {
      const { data } = await supabase.from('customers').select('id, code, name')
      return (data ?? []) as Pick<Customer, 'id' | 'code' | 'name'>[]
    },
  })

  const importHistory = getImportHistory()

  // --------------- Queue helpers ---------------

  const updateFile = useCallback((id: string, updates: Partial<QueuedFile>) => {
    setQueue(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f))
  }, [])

  const activeFile = queue.find(f => f.id === activeFileId)

  const allDone = queue.length > 0 && queue.every(f => f.status === 'done')
  const hasActiveImport = queue.some(f => f.status === 'importing')
  const totalImported = queue.filter(f => f.status === 'done').reduce((s, f) => s + f.importResult.inserted, 0)

  const getClientCode = (f: QueuedFile) => f.detectedClient ?? f.manualClient

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
      const clientCode = qf.detectedClient
      const { mapping, confidence } = autoDetectMapping(hdrs, clientCode)

      const updatedFile: QueuedFile = {
        ...qf,
        status: 'mapping',
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
  }, [])

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
    const clientCode = getClientCode(f)
    const { mapping, confidence } = autoDetectMapping(hdrs, clientCode)
    updateFile(fileId, { selectedSheet: sheetName, headers: hdrs, rows: json, mapping, confidence })
  }

  const updateMapping = (fileId: string, field: keyof OrderColumnMapping, value: string) => {
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

  // --------------- Import mutation ---------------

  const importMut = useMutation({
    mutationFn: async (fileId: string) => {
      const f = queue.find(x => x.id === fileId)
      if (!f) throw new Error('Fichier introuvable')

      const clientCode = getClientCode(f)

      updateFile(fileId, { status: 'importing', importProgress: { current: 0, total: f.rows.length, phase: 'Chargement des references...' } })

      const { data: custData } = await supabase.from('customers').select('id, code, name')

      let allProducts: { id: string; cip13: string; name: string }[] = []
      let from = 0
      const pageSize = 1000
      while (true) {
        const { data: page } = await supabase.from('products').select('id, cip13, name').range(from, from + pageSize - 1)
        if (!page || page.length === 0) break
        allProducts = allProducts.concat(page)
        if (page.length < pageSize) break
        from += pageSize
      }

      const customersList = (custData ?? []) as Pick<Customer, 'id' | 'code' | 'name'>[]
      const productsList = allProducts as Pick<Product, 'id' | 'cip13' | 'name'>[]
      setCachedCustomers(customersList)
      setCachedProducts(productsList)

      const customerMap = new Map(customersList.map(c => [c.code?.toUpperCase(), c.id]))
      const productMap = new Map(productsList.map(p => [p.cip13, p.id]))

      const fileCustomerId = clientCode ? customerMap.get(clientCode.toUpperCase()) : undefined
      if (!fileCustomerId) {
        throw new Error(`Client "${clientCode ?? '?'}" introuvable en base. Verifiez le code client.`)
      }

      let inserted = 0
      let errors = 0
      let skipped = 0
      const skippedDetails: SkippedItem[] = []
      const batchSize = 100

      updateFile(fileId, { importProgress: { current: 0, total: f.rows.length, phase: 'Validation et insertion...' } })

      for (let i = 0; i < f.rows.length; i += batchSize) {
        const batch = f.rows.slice(i, i + batchSize).map((row, batchIdx) => {
          const rowIndex = i + batchIdx
          const cip13 = String(row[f.mapping.cip13] || '').trim()
          const qty = parseInt(String(row[f.mapping.quantity] || '0'), 10)
          const price = f.mapping.unit_price ? parseFloat(String(row[f.mapping.unit_price]).replace(',', '.')) || null : null

          const productId = productMap.get(cip13)

          if (!productId || qty <= 0) {
            const reason: SkippedItem['reason'] = !productId ? 'unknown_product' : 'invalid_quantity'
            skippedDetails.push({
              rowIndex,
              customerCode: clientCode ?? '',
              cip13,
              quantity: qty,
              unitPrice: price,
              reason,
            })
            return null
          }

          return {
            monthly_process_id: process.id,
            customer_id: fileCustomerId,
            product_id: productId,
            quantity: qty,
            unit_price: price,
            status: 'pending' as const,
            metadata: {},
          }
        })

        const validBatch = batch.filter(Boolean) as NonNullable<typeof batch[number]>[]
        skipped += batch.length - validBatch.length

        if (validBatch.length > 0) {
          const { error, data } = await supabase.from('orders').insert(validBatch).select('id')
          if (error) {
            errors += validBatch.length
            console.error('Batch error:', error)
          } else {
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

      // Compute total across all done files + this one
      const doneInserted = queue
        .filter(x => x.id !== fileId && x.status === 'done')
        .reduce((s, x) => s + x.importResult.inserted, 0)
      const currentTotal = (existingOrders ?? 0) + doneInserted + inserted

      await supabase
        .from('monthly_processes')
        .update({ orders_count: currentTotal, status: 'importing' })
        .eq('id', process.id)

      if (clientCode) {
        saveMappingForCustomer(clientCode, f.mapping)
      }

      addImportHistory({
        fileName: f.fileName,
        date: new Date().toISOString(),
        rowCount: f.rows.length,
        clientCode,
      })

      return { fileId, inserted, errors, skipped, skippedDetails }
    },
    onSuccess: (result) => {
      updateFile(result.fileId, {
        status: 'done',
        importResult: { inserted: result.inserted, errors: result.errors, skipped: result.skipped },
        skippedItems: result.skippedDetails,
      })
      queryClient.invalidateQueries({ queryKey: ['orders', process.id] })
      queryClient.invalidateQueries({ queryKey: ['monthly-processes'] })
      toast.success(`${result.inserted} commandes importees`)
    },
    onError: (err: Error, fileId: string) => {
      updateFile(fileId, { status: 'mapping' })
      toast.error(`Erreur: ${err.message}`)
    },
  })

  const handleResolvedItems = async (resolved: ResolvedItem[]) => {
    if (resolved.length === 0 || !skippedModalFileId) return
    const ordersToInsert = resolved.map(r => ({
      monthly_process_id: process.id,
      customer_id: r.customerId,
      product_id: r.productId,
      quantity: r.quantity,
      unit_price: r.unitPrice,
      status: 'pending' as const,
      metadata: {},
    }))

    const { error, data } = await supabase.from('orders').insert(ordersToInsert).select('id')
    if (error) { toast.error(`Erreur: ${error.message}`); return }

    const count = data?.length ?? resolved.length
    const f = queue.find(x => x.id === skippedModalFileId)
    if (f) {
      const resolvedIndexes = new Set(resolved.map(r => r.rowIndex))
      updateFile(skippedModalFileId, {
        importResult: { ...f.importResult, inserted: f.importResult.inserted + count, skipped: f.importResult.skipped - count },
        skippedItems: f.skippedItems.filter(s => !resolvedIndexes.has(s.rowIndex)),
      })
    }

    queryClient.invalidateQueries({ queryKey: ['orders', process.id] })
    queryClient.invalidateQueries({ queryKey: ['monthly-processes'] })
    toast.success(`${count} commandes recuperees`)
  }

  // --------------- Render helpers ---------------

  const getConfidenceBadge = (conf: MappingConfidence) => {
    if (conf.source === 'none') return null
    if (conf.source === 'saved') return <Badge variant="default" className="text-[9px] h-4 gap-0.5"><History className="h-2.5 w-2.5" /> Memorise</Badge>
    if (conf.source === 'auto') return <Badge variant="secondary" className="text-[9px] h-4 gap-0.5"><Zap className="h-2.5 w-2.5" /> Auto</Badge>
    return null
  }

  const getSampleValues = (f: QueuedFile, field: keyof OrderColumnMapping) => {
    const col = f.mapping[field]
    if (!col) return []
    return f.rows.slice(0, 3).map(r => String(r[col] || '').trim()).filter(Boolean)
  }

  const canProceed = (f: QueuedFile) => {
    const clientCode = getClientCode(f)
    return REQUIRED_FIELDS.every(fld => f.mapping[fld]) && !!clientCode
  }

  // --------------- File card render ---------------

  const renderFileCard = (f: QueuedFile) => {
    const isActive = activeFileId === f.id
    const clientCode = getClientCode(f)
    const progressPercent = f.importProgress.total > 0 ? (f.importProgress.current / f.importProgress.total) * 100 : 0

    return (
      <div key={f.id} className="space-y-0">
        {/* Card header */}
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
                {clientCode ? (
                  <Badge variant={f.detectedClient ? 'default' : 'secondary'} className="text-[10px] h-4 gap-0.5">
                    {f.detectedClient ? <Sparkles className="h-2.5 w-2.5" /> : <User className="h-2.5 w-2.5" />}
                    {clientCode}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] h-4 text-amber-600 border-amber-200">
                    Client non defini
                  </Badge>
                )}
                {f.status === 'done' && (
                  <span className="text-[11px] text-green-600 font-medium">
                    {f.importResult.inserted} importees
                    {f.importResult.skipped > 0 && <span className="text-amber-600"> / {f.importResult.skipped} ignorees</span>}
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
              {/* Client selector (when not auto-detected) */}
              {!f.detectedClient && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold flex items-center gap-1.5">
                    <User className="h-3 w-3" /> Client pour ce fichier *
                  </Label>
                  <Select
                    value={f.manualClient ?? 'none'}
                    onValueChange={(v) => updateFile(f.id, { manualClient: v === 'none' ? null : v })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Selectionner le client..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- Selectionner --</SelectItem>
                      {(customers ?? []).map(c => (
                        <SelectItem key={c.id} value={c.code ?? c.id}>{c.code} — {c.name}</SelectItem>
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
                  <p className="text-sm text-muted-foreground">Mappez les colonnes aux champs commande.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(Object.keys(FIELD_LABELS) as (keyof OrderColumnMapping)[]).map((field) => {
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
                        else toast.error('Champs obligatoires manquants (CIP13, Quantite, Client)')
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
                    Apercu des 10 premieres lignes sur {f.rows.length} total. Client : <strong>{clientCode}</strong>
                  </p>
                  <div className="border rounded-lg overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">#</TableHead>
                          <TableHead>CIP13</TableHead>
                          <TableHead>Quantite</TableHead>
                          <TableHead>Prix</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {f.rows.slice(0, 10).map((row, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                            <TableCell className="font-mono text-sm">{row[f.mapping.cip13]}</TableCell>
                            <TableCell>{row[f.mapping.quantity]}</TableCell>
                            <TableCell>{f.mapping.unit_price ? row[f.mapping.unit_price] : '-'}</TableCell>
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
                      Importer {f.rows.length} commandes
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
                onClick={(e) => { e.stopPropagation(); setSkippedModalFileId(f.id); setSkippedModalOpen(true) }}
              >
                <Eye className="h-3 w-3" /> Examiner
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    )
  }

  // --------------- Main render ---------------

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold">Importation des Commandes</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Importez les fichiers Excel de commandes clients pour ce mois. Un fichier par client.
        </p>
      </div>

      {existingOrders != null && existingOrders > 0 && queue.length === 0 && (
        <Card className="ivory-card-highlight">
          <CardContent className="p-4 flex items-center gap-3">
            <FileSpreadsheet className="h-5 w-5 text-primary shrink-0" />
            <p className="text-sm">
              <strong>{existingOrders}</strong> commandes deja importees pour ce processus.
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
            {(totalImported > 0 || (existingOrders ?? 0) > 0) && (
              <Badge variant="default" className="text-xs gap-1">
                {totalImported + (existingOrders ?? 0)} commandes total
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
              ? 'Ajouter un autre fichier client'
              : 'Deposez des fichiers Excel ou cliquez pour selectionner'
          }
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          .xlsx, .xls, .csv — Un fichier par client (ORI, MPA, AXI...)
        </p>
      </div>
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileInput} multiple className="hidden" />

      {/* Import history */}
      {queue.length === 0 && importHistory.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <History className="h-3 w-3" /> Derniers imports
          </p>
          <div className="flex flex-wrap gap-2">
            {importHistory.map((h, i) => (
              <Badge key={i} variant="outline" className="gap-1.5 py-1 px-2.5 text-xs">
                <FileSpreadsheet className="h-3 w-3" />
                {h.fileName.length > 25 ? h.fileName.slice(0, 25) + '...' : h.fileName}
                <span className="text-muted-foreground">
                  {h.rowCount} lignes
                  {h.clientCode && <> &middot; {h.clientCode}</>}
                </span>
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Next step */}
      <div className="flex justify-end">
        {(allDone || (existingOrders != null && existingOrders > 0)) && !hasActiveImport && (
          <Button onClick={onNext} className="gap-2">
            Passer a l'etape suivante <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Skipped items modal */}
      {skippedModalFileId && (
        <SkippedItemsReviewModal
          open={skippedModalOpen}
          onOpenChange={setSkippedModalOpen}
          skippedItems={queue.find(x => x.id === skippedModalFileId)?.skippedItems ?? []}
          existingCustomers={cachedCustomers}
          existingProducts={cachedProducts}
          onResolved={handleResolvedItems}
        />
      )}
    </div>
  )
}

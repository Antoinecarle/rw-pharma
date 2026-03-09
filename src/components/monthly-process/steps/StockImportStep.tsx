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
import { Upload, FileSpreadsheet, Check, AlertTriangle, ArrowRight, Eye, Sparkles, History, Zap, Plus, Warehouse, X, PackageCheck, Keyboard, RotateCcw, Hand } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import ExampleFilesLoader from '@/components/monthly-process/ExampleFilesLoader'
import HorizontalBarChart from '@/components/ui/horizontal-bar'
import type { MonthlyProcess, Wholesaler } from '@/types/database'
import {
  type MappingConfidence,
  type StockField,
  STOCK_PATTERNS,
  autoDetectMapping,
  detectEntityFromFilename,
  detectEntityFromData,
  getSampleValues as getSharedSampleValues,
  getUnmappedHeaders,
} from '@/lib/column-detection'

// --------------- Types ---------------

type StockColumnMapping = Record<StockField, string>

const FIELD_LABELS: Record<StockField, string> = {
  cip13: 'CIP13 Produit *',
  lot_number: 'Numero de lot *',
  expiry_date: 'Date expiration *',
  quantity: 'Quantite *',
  unit_cost: 'Cout unitaire',
  date_reception: 'Date reception',
  productName: 'Nom produit',
  wholesalerColumn: 'Grossiste (multi)',
}

const ALL_FIELDS: StockField[] = Object.keys(FIELD_LABELS) as StockField[]
const REQUIRED_FIELDS: StockField[] = ['cip13', 'lot_number', 'expiry_date', 'quantity']

const STORAGE_KEY = 'rw-pharma-stock-import-history'

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
  return `rw-pharma-stock-mapping-${wholesalerCode}`
}

function getSavedMapping(wholesalerCode: string): StockColumnMapping | null {
  try {
    const saved = localStorage.getItem(getMappingStorageKey(wholesalerCode))
    return saved ? JSON.parse(saved) : null
  } catch { return null }
}

function saveMappingForWholesaler(wholesalerCode: string, mapping: StockColumnMapping) {
  localStorage.setItem(getMappingStorageKey(wholesalerCode), JSON.stringify(mapping))
}

type StockMappingConfidence = MappingConfidence<StockField>

type FileStatus = 'pending' | 'mapping' | 'preview' | 'importing' | 'done' | 'error'

interface SkippedStockItem {
  rowIndex: number
  cip13: string
  reason: 'unknown_product' | 'invalid_quantity' | 'invalid_expiry' | 'missing_lot'
}

interface QueuedStockFile {
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
  mapping: StockColumnMapping
  confidence: StockMappingConfidence[]
  importResult: { inserted: number; errors: number; skipped: number }
  importProgress: { current: number; total: number; phase: string }
  skippedItems: SkippedStockItem[]
}

function emptyMapping(): StockColumnMapping {
  const m = {} as StockColumnMapping
  for (const f of ALL_FIELDS) m[f] = ''
  return m
}

function createQueuedFile(file: File): QueuedStockFile {
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
    mapping: emptyMapping(),
    confidence: [],
    importResult: { inserted: 0, errors: 0, skipped: 0 },
    importProgress: { current: 0, total: 0, phase: '' },
    skippedItems: [],
  }
}

// --------------- Auto-detect (delegates to shared module) ---------------

function runAutoDetect(headers: string[], wholesalerCode: string | null) {
  const saved = wholesalerCode ? getSavedMapping(wholesalerCode) : null
  const fullSaved = saved ? { ...emptyMapping(), ...saved } : null
  return autoDetectMapping<StockField>(
    headers, STOCK_PATTERNS, ALL_FIELDS,
    fullSaved, ['cip13', 'lot_number'],
  )
}

// --------------- Parse expiry date ---------------

function parseExpiryDate(raw: string): string | null {
  if (!raw) return null
  const trimmed = String(raw).trim()

  // Try ISO format: 2026-03-01
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed

  // Try DD/MM/YYYY or DD-MM-YYYY
  const dmy = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/)
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`

  // Try MM/YYYY (assume 1st of month)
  const my = trimmed.match(/^(\d{1,2})[/\-.](\d{4})$/)
  if (my) return `${my[2]}-${my[1].padStart(2, '0')}-01`

  // Try YYYY/MM
  const ym = trimmed.match(/^(\d{4})[/\-.](\d{1,2})$/)
  if (ym) return `${ym[1]}-${ym[2].padStart(2, '0')}-01`

  // Try Excel serial number
  const serial = Number(trimmed)
  if (!isNaN(serial) && serial > 30000 && serial < 100000) {
    const date = new Date((serial - 25569) * 86400 * 1000)
    if (!isNaN(date.getTime())) return date.toISOString().slice(0, 10)
  }

  return null
}

// --------------- Props ---------------

interface StockImportStepProps {
  process: MonthlyProcess
  onNext: () => void
}

type StockImportSource = 'excel' | 'manual'

export default function StockImportStep({ process, onNext }: StockImportStepProps) {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [importSource, setImportSource] = useState<StockImportSource>('excel')
  const [queue, setQueue] = useState<QueuedStockFile[]>([])
  const [activeFileId, setActiveFileId] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [showSkipped, setShowSkipped] = useState<string | null>(null)
  // Manual stock entry
  const [manualWholesaler, setManualWholesaler] = useState('')
  const [manualStockRows, setManualStockRows] = useState<{ cip13: string; lot_number: string; expiry_date: string; quantity: string; unit_cost: string }[]>([
    { cip13: '', lot_number: '', expiry_date: '', quantity: '', unit_cost: '' },
  ])

  const { data: existingStock } = useQuery({
    queryKey: ['collected_stock', process.id, 'count'],
    queryFn: async () => {
      const { data } = await supabase
        .from('collected_stock')
        .select('id')
        .eq('monthly_process_id', process.id)
      return data?.length ?? 0
    },
  })

  const { data: stockSummary } = useQuery({
    queryKey: ['collected_stock', process.id, 'summary'],
    queryFn: async () => {
      const { data } = await supabase
        .from('collected_stock')
        .select('wholesaler_id, quantity, wholesaler:wholesalers(code, name)')
        .eq('monthly_process_id', process.id)
      if (!data || data.length === 0) return null

      const byWholesaler = new Map<string, { code: string; name: string; totalQty: number; lotCount: number }>()
      for (const s of data) {
        const ws = s.wholesaler as unknown as { code: string; name: string } | null
        const code = ws?.code ?? 'N/A'
        const name = ws?.name ?? code
        const existing = byWholesaler.get(code) ?? { code, name, totalQty: 0, lotCount: 0 }
        existing.totalQty += s.quantity ?? 0
        existing.lotCount += 1
        byWholesaler.set(code, existing)
      }

      const entries = [...byWholesaler.values()].sort((a, b) => b.totalQty - a.totalQty)
      return {
        totalLots: data.length,
        totalQty: entries.reduce((s, e) => s + e.totalQty, 0),
        wholesalerCount: entries.length,
        entries,
      }
    },
    enabled: (existingStock ?? 0) > 0,
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

  const updateFile = useCallback((id: string, updates: Partial<QueuedStockFile>) => {
    setQueue(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f))
  }, [])

  const allDone = queue.length > 0 && queue.every(f => f.status === 'done')
  const hasActiveImport = queue.some(f => f.status === 'importing')
  const totalInserted = queue.filter(f => f.status === 'done').reduce((s, f) => s + f.importResult.inserted, 0)

  const getWholesalerCode = (f: QueuedStockFile) => f.detectedWholesaler ?? f.manualWholesaler

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
      let detected = wholesalers ? detectEntityFromFilename(file.name, wholesalers) : null
      if (!detected && wholesalers) {
        detected = detectEntityFromData(hdrs, json, wholesalers)
      }
      const { mapping, confidence } = runAutoDetect(hdrs, detected)

      const updatedFile: QueuedStockFile = {
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
    const { mapping, confidence } = runAutoDetect(hdrs, wholesalerCode)
    updateFile(fileId, { selectedSheet: sheetName, headers: hdrs, rows: json, mapping, confidence })
  }

  const updateMapping = (fileId: string, field: StockField, value: string) => {
    const f = queue.find(x => x.id === fileId)
    if (!f) return
    const newMapping = { ...f.mapping, [field]: value === 'none' ? '' : value }
    const newConfidence = f.confidence.map(c =>
      c.field === field ? { ...c, source: value === 'none' ? 'none' as const : 'manual' as const } : c
    )
    updateFile(fileId, { mapping: newMapping, confidence: newConfidence })
  }

  const resetMapping = (fileId: string) => {
    const f = queue.find(x => x.id === fileId)
    if (!f) return
    const wholesalerCode = getWholesalerCode(f)
    const { mapping, confidence } = runAutoDetect(f.headers, wholesalerCode)
    updateFile(fileId, { mapping, confidence })
  }

  const removeFile = (fileId: string) => {
    setQueue(prev => prev.filter(f => f.id !== fileId))
    if (activeFileId === fileId) setActiveFileId(null)
  }

  const canProceed = (f: QueuedStockFile) => {
    const wholesalerCode = getWholesalerCode(f)
    const hasWholesalerColumn = !!f.mapping.wholesalerColumn
    return REQUIRED_FIELDS.every(fld => f.mapping[fld]) && (!!wholesalerCode || hasWholesalerColumn)
  }

  // --------------- Import mutation ---------------

  const importMut = useMutation({
    mutationFn: async (fileId: string) => {
      const f = queue.find(x => x.id === fileId)
      if (!f) throw new Error('Fichier introuvable')

      const wholesalerCode = getWholesalerCode(f)

      updateFile(fileId, { status: 'importing', importProgress: { current: 0, total: f.rows.length, phase: 'Chargement des references...' } })

      // Load all products (paginated)
      let allProducts: { id: string; cip13: string }[] = []
      let from = 0
      const pageSize = 1000
      while (true) {
        const { data: page } = await supabase.from('products').select('id, cip13').range(from, from + pageSize - 1)
        if (!page || page.length === 0) break
        allProducts = allProducts.concat(page)
        if (page.length < pageSize) break
        from += pageSize
      }

      const productMap = new Map(allProducts.map(p => [p.cip13, p]))

      // Build CIP7 reverse lookup: CIP7 = CIP13[5:12] (French pharma standard)
      const cip7Map = new Map<string, typeof allProducts[0]>()
      for (const p of allProducts) {
        if (p.cip13 && p.cip13.length === 13) {
          const c7 = p.cip13.substring(5, 12)
          if (!cip7Map.has(c7)) cip7Map.set(c7, p)
        }
      }
      const resolveProduct = (code: string) => {
        return productMap.get(code) ?? (code.length === 7 && /^\d+$/.test(code) ? cip7Map.get(code) : null) ?? null
      }

      const wholesalersList = wholesalers ?? []
      const wholesaler = wholesalersList.find(w => w.code?.toUpperCase() === wholesalerCode?.toUpperCase())

      if (!wholesaler) {
        throw new Error(`Grossiste "${wholesalerCode ?? '?'}" introuvable en base.`)
      }

      let inserted = 0
      let errors = 0
      let skipped = 0
      const skippedDetails: SkippedStockItem[] = []
      const batchSize = 100

      updateFile(fileId, { importProgress: { current: 0, total: f.rows.length, phase: 'Validation et insertion...' } })

      for (let i = 0; i < f.rows.length; i += batchSize) {
        const batch = f.rows.slice(i, i + batchSize).map((row, batchIdx) => {
          const rowIndex = i + batchIdx
          const cip13 = String(row[f.mapping.cip13] || '').trim()
          const lotNumber = String(row[f.mapping.lot_number] || '').trim()
          const expiryRaw = String(row[f.mapping.expiry_date] || '').trim()
          const qty = parseInt(String(row[f.mapping.quantity] || '0').replace(/\s/g, ''), 10)
          const unitCost = f.mapping.unit_cost
            ? parseFloat(String(row[f.mapping.unit_cost] || '0').replace(',', '.').replace(/\s/g, '')) || null
            : null
          const dateReceptionRaw = f.mapping.date_reception ? String(row[f.mapping.date_reception] || '').trim() : ''
          const dateReception = dateReceptionRaw ? parseExpiryDate(dateReceptionRaw) : null

          const product = resolveProduct(cip13)
          if (!product) {
            skippedDetails.push({ rowIndex, cip13, reason: 'unknown_product' })
            return null
          }

          if (!lotNumber) {
            skippedDetails.push({ rowIndex, cip13, reason: 'missing_lot' })
            return null
          }

          const expiryDate = parseExpiryDate(expiryRaw)
          if (!expiryDate) {
            skippedDetails.push({ rowIndex, cip13, reason: 'invalid_expiry' })
            return null
          }

          if (qty <= 0) {
            skippedDetails.push({ rowIndex, cip13, reason: 'invalid_quantity' })
            return null
          }

          return {
            monthly_process_id: process.id,
            monthly_order_id: null,
            wholesaler_id: wholesaler.id,
            product_id: product.id,
            cip13,
            lot_number: lotNumber,
            expiry_date: expiryDate,
            quantity: qty,
            unit_cost: unitCost,
            date_reception: dateReception,
            status: 'received',
            import_file_name: f.fileName,
            metadata: {},
          }
        })

        const validBatch = batch.filter(Boolean) as NonNullable<typeof batch[number]>[]
        skipped += batch.length - validBatch.length

        if (validBatch.length > 0) {
          // Upsert lots first (deduplicate by cip13+lot_number)
          const uniqueLots = new Map<string, { product_id: string; cip13: string; lot_number: string; expiry_date: string; monthly_process_id: string }>()
          for (const item of validBatch) {
            const key = `${item.cip13}::${item.lot_number}`
            if (!uniqueLots.has(key)) {
              uniqueLots.set(key, {
                product_id: item.product_id!,
                cip13: item.cip13,
                lot_number: item.lot_number,
                expiry_date: item.expiry_date,
                monthly_process_id: process.id,
              })
            }
          }

          // Upsert lots (conflict on cip13+lot_number)
          const lotRows = [...uniqueLots.values()]
          const { data: upsertedLots } = await supabase
            .from('lots')
            .upsert(lotRows, { onConflict: 'cip13,lot_number' })
            .select('id, cip13, lot_number')

          // Build lot lookup
          const lotLookup = new Map<string, string>()
          for (const lot of upsertedLots ?? []) {
            lotLookup.set(`${lot.cip13}::${lot.lot_number}`, lot.id)
          }

          // Add lot_id to each stock row
          const stockWithLots = validBatch.map(item => ({
            ...item,
            lot_id: lotLookup.get(`${item.cip13}::${item.lot_number}`) ?? null,
          }))

          const { error, data } = await supabase
            .from('collected_stock')
            .insert(stockWithLots)
            .select('id')

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

      // Update process status
      await supabase
        .from('monthly_processes')
        .update({ status: 'collecting_stock' })
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

      return { fileId, inserted, errors, skipped, skippedDetails }
    },
    onSuccess: (result) => {
      updateFile(result.fileId, {
        status: 'done',
        importResult: { inserted: result.inserted, errors: result.errors, skipped: result.skipped },
        skippedItems: result.skippedDetails,
      })
      queryClient.invalidateQueries({ queryKey: ['collected_stock'] })
      queryClient.invalidateQueries({ queryKey: ['monthly-processes'] })
      toast.success(`${result.inserted} lots importes`)
    },
    onError: (err: Error, fileId: string) => {
      updateFile(fileId, { status: 'mapping' })
      toast.error(`Erreur: ${err.message}`)
    },
  })

  // --------------- Manual stock import ---------------

  const manualStockMut = useMutation({
    mutationFn: async () => {
      if (!manualWholesaler) throw new Error('Selectionnez un grossiste')
      const ws = (wholesalers ?? []).find(w => w.code === manualWholesaler)
      if (!ws) throw new Error('Grossiste introuvable')

      let allProducts: { id: string; cip13: string }[] = []
      let from = 0
      while (true) {
        const { data: page } = await supabase.from('products').select('id, cip13').range(from, from + 999)
        if (!page || page.length === 0) break
        allProducts = allProducts.concat(page)
        if (page.length < 1000) break
        from += 1000
      }
      const productMap = new Map(allProducts.map(p => [p.cip13, p]))

      const validRows = manualStockRows
        .filter(r => r.cip13.trim() && r.lot_number.trim() && parseInt(r.quantity) > 0)
        .map(r => {
          const product = productMap.get(r.cip13.trim())
          if (!product) return null
          const expiry = parseExpiryDate(r.expiry_date)
          if (!expiry) return null
          return {
            monthly_process_id: process.id,
            monthly_order_id: null,
            wholesaler_id: ws.id,
            product_id: product.id,
            cip13: r.cip13.trim(),
            lot_number: r.lot_number.trim(),
            expiry_date: expiry,
            quantity: parseInt(r.quantity),
            unit_cost: r.unit_cost ? parseFloat(r.unit_cost.replace(',', '.')) : null,
            status: 'received',
            data_source: 'manual',
            metadata: {},
          }
        })
        .filter(Boolean) as Record<string, unknown>[]

      if (validRows.length === 0) throw new Error('Aucune ligne valide')

      // Upsert lots
      const uniqueLots = new Map<string, Record<string, unknown>>()
      for (const item of validRows) {
        const key = `${item.cip13}::${item.lot_number}`
        if (!uniqueLots.has(key)) {
          uniqueLots.set(key, {
            product_id: item.product_id,
            cip13: item.cip13,
            lot_number: item.lot_number,
            expiry_date: item.expiry_date,
            monthly_process_id: process.id,
          })
        }
      }
      const { data: upsertedLots } = await supabase
        .from('lots')
        .upsert([...uniqueLots.values()], { onConflict: 'cip13,lot_number' })
        .select('id, cip13, lot_number')
      const lotLookup = new Map<string, string>()
      for (const lot of upsertedLots ?? []) {
        lotLookup.set(`${lot.cip13}::${lot.lot_number}`, lot.id)
      }

      const stockWithLots = validRows.map(item => ({
        ...item,
        lot_id: lotLookup.get(`${item.cip13}::${item.lot_number}`) ?? null,
      }))

      const { error } = await supabase.from('collected_stock').insert(stockWithLots)
      if (error) throw error

      await supabase
        .from('monthly_processes')
        .update({ status: 'collecting_stock' })
        .eq('id', process.id)

      return validRows.length
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['collected_stock'] })
      queryClient.invalidateQueries({ queryKey: ['monthly-processes'] })
      toast.success(`${count} lots ajoutes manuellement`)
      setManualStockRows([{ cip13: '', lot_number: '', expiry_date: '', quantity: '', unit_cost: '' }])
      setManualWholesaler('')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const addManualStockRow = () => setManualStockRows(prev => [...prev, { cip13: '', lot_number: '', expiry_date: '', quantity: '', unit_cost: '' }])
  const updateManualStockRow = (i: number, field: string, value: string) => {
    setManualStockRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r))
  }
  const removeManualStockRow = (i: number) => {
    if (manualStockRows.length <= 1) return
    setManualStockRows(prev => prev.filter((_, idx) => idx !== i))
  }

  // --------------- Render helpers ---------------

  const getConfidenceBadge = (conf: StockMappingConfidence) => {
    if (conf.source === 'none') return null
    if (conf.source === 'saved') return <Badge variant="default" className="text-[9px] h-4 gap-0.5"><History className="h-2.5 w-2.5" /> Memorise</Badge>
    if (conf.source === 'auto') return <Badge variant="secondary" className="text-[9px] h-4 gap-0.5"><Zap className="h-2.5 w-2.5" /> Auto</Badge>
    if (conf.source === 'manual') return <Badge variant="outline" className="text-[9px] h-4 gap-0.5 border-blue-300 text-blue-600"><Hand className="h-2.5 w-2.5" /> Manuel</Badge>
    return null
  }

  const getSampleValues = (f: QueuedStockFile, field: StockField) => {
    return getSharedSampleValues(f.rows, f.mapping, field)
  }

  // --------------- File card render ---------------

  const renderFileCard = (f: QueuedStockFile) => {
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
                  : <PackageCheck className="h-4 w-4 text-muted-foreground" />
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
                    {f.importResult.inserted} lots importes
                    {f.importResult.skipped > 0 && <span className="text-amber-600"> / {f.importResult.skipped} ignores</span>}
                  </span>
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
              {/* Wholesaler selector */}
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
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">Mappez les colonnes aux champs stock (lot, expiration, quantite).</p>
                    <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground" onClick={() => resetMapping(f.id)}>
                      <RotateCcw className="h-3 w-3" /> Reinitialiser
                    </Button>
                  </div>

                  {/* Alert for missing required fields */}
                  {!REQUIRED_FIELDS.every(fld => f.mapping[fld]) && (
                    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                      <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                      <p className="text-xs text-red-600 dark:text-red-400">
                        Champs obligatoires manquants : {REQUIRED_FIELDS.filter(fld => !f.mapping[fld]).map(fld => FIELD_LABELS[fld].replace(' *', '')).join(', ')}
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {(ALL_FIELDS).map((field) => {
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

                  {/* Unmapped columns */}
                  {(() => {
                    const unmapped = getUnmappedHeaders(f.headers, f.mapping)
                    return unmapped.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 items-center">
                        <span className="text-[10px] text-muted-foreground">Colonnes non mappees :</span>
                        {unmapped.map(h => (
                          <Badge key={h} variant="outline" className="text-[9px] h-4 text-muted-foreground/70">{h}</Badge>
                        ))}
                      </div>
                    ) : null
                  })()}

                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={() => {
                        if (canProceed(f)) updateFile(f.id, { status: 'preview' })
                        else toast.error('Champs obligatoires manquants (CIP13, Lot, Expiration, Quantite, Grossiste)')
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
                          <TableHead>Lot</TableHead>
                          <TableHead>Expiration</TableHead>
                          <TableHead>Quantite</TableHead>
                          {f.mapping.unit_cost && <TableHead>Cout</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {f.rows.slice(0, 10).map((row, i) => (
                          <TableRow key={i}>
                            <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                            <TableCell className="font-mono text-sm">{row[f.mapping.cip13]}</TableCell>
                            <TableCell className="text-sm">{row[f.mapping.lot_number]}</TableCell>
                            <TableCell className="text-sm">{row[f.mapping.expiry_date]}</TableCell>
                            <TableCell className="text-sm">{row[f.mapping.quantity]}</TableCell>
                            {f.mapping.unit_cost && <TableCell className="text-sm">{row[f.mapping.unit_cost]}</TableCell>}
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
                      Importer {f.rows.length} lots
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
              <p className="text-xs flex-1">{f.skippedItems.length} lignes ignorees</p>
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
                        <TableHead>Raison</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {f.skippedItems.slice(0, 50).map((item, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs">{item.rowIndex + 1}</TableCell>
                          <TableCell className="font-mono text-xs">{item.cip13}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[9px]">
                              {item.reason === 'unknown_product' ? 'Produit inconnu' :
                               item.reason === 'invalid_quantity' ? 'Quantite invalide' :
                               item.reason === 'invalid_expiry' ? 'Date invalide' : 'Lot manquant'}
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
        <h3 className="text-lg font-semibold">Reception des Stocks Collectes</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Importez les stocks recus des grossistes ou saisissez-les directement.
        </p>
      </div>

      {/* Source toggle */}
      <div className="flex gap-1.5">
        {([
          { value: 'excel' as StockImportSource, label: 'Fichier Excel', icon: FileSpreadsheet },
          { value: 'manual' as StockImportSource, label: 'Saisie directe', icon: Keyboard },
        ]).map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setImportSource(opt.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all flex items-center gap-1.5 ${
              importSource === opt.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border hover:bg-muted text-muted-foreground'
            }`}
          >
            <opt.icon className="h-3 w-3" />
            {opt.label}
          </button>
        ))}
      </div>

      {/* Manual stock entry */}
      {importSource === 'manual' && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Grossiste *</Label>
              <Select value={manualWholesaler || 'none'} onValueChange={(v) => setManualWholesaler(v === 'none' ? '' : v)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Selectionner le grossiste..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">-- Selectionner --</SelectItem>
                  {(wholesalers ?? []).map(w => (
                    <SelectItem key={w.id} value={w.code ?? w.id}>{w.code} — {w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-semibold">Lignes de stock</Label>
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>CIP13 *</TableHead>
                      <TableHead>N° Lot *</TableHead>
                      <TableHead>Expiration *</TableHead>
                      <TableHead>Quantite *</TableHead>
                      <TableHead>Cout unit.</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {manualStockRows.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell><Input className="h-7 text-sm font-mono" placeholder="3400930..." value={row.cip13} onChange={e => updateManualStockRow(i, 'cip13', e.target.value)} /></TableCell>
                        <TableCell><Input className="h-7 text-sm" placeholder="D800305N" value={row.lot_number} onChange={e => updateManualStockRow(i, 'lot_number', e.target.value)} /></TableCell>
                        <TableCell><Input className="h-7 text-sm" placeholder="2026-09-01" value={row.expiry_date} onChange={e => updateManualStockRow(i, 'expiry_date', e.target.value)} /></TableCell>
                        <TableCell><Input type="number" className="h-7 text-sm w-20" placeholder="0" value={row.quantity} onChange={e => updateManualStockRow(i, 'quantity', e.target.value)} /></TableCell>
                        <TableCell><Input className="h-7 text-sm w-20" placeholder="0.00" value={row.unit_cost} onChange={e => updateManualStockRow(i, 'unit_cost', e.target.value)} /></TableCell>
                        <TableCell>
                          {manualStockRows.length > 1 && (
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeManualStockRow(i)}>
                              <X className="h-3 w-3" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Button variant="outline" size="sm" onClick={addManualStockRow} className="gap-1">
                <Plus className="h-3 w-3" /> Ajouter une ligne
              </Button>
            </div>

            <div className="flex justify-end">
              <Button
                onClick={() => manualStockMut.mutate()}
                disabled={manualStockMut.isPending || !manualWholesaler || manualStockRows.every(r => !r.cip13.trim())}
                className="gap-2"
              >
                {manualStockMut.isPending ? 'Import en cours...' : 'Importer les stocks'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {existingStock != null && existingStock > 0 && queue.length === 0 && (
        <Card className="ivory-card-highlight">
          <CardContent className="p-4 flex items-center gap-3">
            <PackageCheck className="h-5 w-5 text-primary shrink-0" />
            <p className="text-sm">
              <strong>{existingStock}</strong> lots deja importes pour ce processus.
            </p>
          </CardContent>
        </Card>
      )}

      {stockSummary && queue.length === 0 && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold">{stockSummary.wholesalerCount}</p>
                <p className="text-xs text-muted-foreground">Grossistes</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold">{stockSummary.totalLots.toLocaleString('fr-FR')}</p>
                <p className="text-xs text-muted-foreground">Lots recus</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold">{stockSummary.totalQty.toLocaleString('fr-FR')}</p>
                <p className="text-xs text-muted-foreground">Unites en stock</p>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm font-semibold mb-3">Stock par grossiste</p>
              <HorizontalBarChart
                items={stockSummary.entries.map(e => ({
                  label: e.name,
                  code: e.code,
                  value: e.totalQty,
                }))}
                formatValue={(v) => `${v.toLocaleString('fr-FR')} u.`}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* File queue (Excel mode) */}
      {importSource === 'excel' && queue.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium">{queue.length} fichier{queue.length > 1 ? 's' : ''}</span>
            <Badge variant="secondary" className="text-xs gap-1">
              <Check className="h-3 w-3" />
              {queue.filter(f => f.status === 'done').length}/{queue.length} importes
            </Badge>
            {(totalInserted > 0 || (existingStock ?? 0) > 0) && (
              <Badge variant="default" className="text-xs gap-1">
                {totalInserted + (existingStock ?? 0)} lots total
              </Badge>
            )}
          </div>

          <div className="space-y-2">
            {queue.map(f => renderFileCard(f))}
          </div>
        </div>
      )}

      {/* Drop zone (Excel mode) */}
      {importSource === 'excel' && <div
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
              ? 'Ajouter un autre fichier de stock'
              : 'Deposez des fichiers de stock collecte ou cliquez pour selectionner'
          }
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          .xlsx, .xls, .csv — Un fichier par grossiste avec lots, dates d'expiration et quantites
        </p>
      </div>}
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileInput} multiple className="hidden" />

      {/* Example files suggestion */}
      {importSource === 'excel' && queue.length === 0 && (
        <ExampleFilesLoader category="stock" onLoadFiles={(files) => handleFiles(files)} />
      )}

      {/* Import history (Excel mode) */}
      {importSource === 'excel' && queue.length === 0 && importHistory.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
            <History className="h-3 w-3" /> Derniers imports stock
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
        {(allDone || (existingStock != null && existingStock > 0)) && !hasActiveImport && (
          <Button onClick={onNext} className="gap-2">
            Passer a l'allocation par lot <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}

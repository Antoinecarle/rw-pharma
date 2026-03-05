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
import { Upload, FileSpreadsheet, Check, AlertTriangle, ArrowRight, Eye, Sparkles, History, Zap } from 'lucide-react'
import { toast } from 'sonner'
import SkippedItemsReviewModal, {
  type SkippedItem, type ResolvedItem,
} from '@/components/allocations/SkippedItemsReviewModal'
import type { MonthlyProcess, Customer, Product } from '@/types/database'

interface OrderColumnMapping {
  customer_code: string
  cip13: string
  quantity: string
  unit_price: string
}

const FIELD_LABELS: Record<keyof OrderColumnMapping, string> = {
  customer_code: 'Code Client *',
  cip13: 'CIP13 Produit *',
  quantity: 'Quantite *',
  unit_price: 'Prix unitaire',
}

const REQUIRED_FIELDS: (keyof OrderColumnMapping)[] = ['customer_code', 'cip13', 'quantity']

// Known client codes for auto-detection from filename
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

interface OrderImportStepProps {
  process: MonthlyProcess
  onNext: () => void
}

export default function OrderImportStep({ process, onNext }: OrderImportStepProps) {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview' | 'importing' | 'done'>('upload')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [selectedSheet, setSelectedSheet] = useState<string>('')
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null)
  const [mapping, setMapping] = useState<OrderColumnMapping>({
    customer_code: '', cip13: '', quantity: '', unit_price: '',
  })
  const [confidence, setConfidence] = useState<MappingConfidence[]>([])
  const [importResult, setImportResult] = useState({ inserted: 0, errors: 0, skipped: 0 })
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, phase: '' })
  const [skippedItems, setSkippedItems] = useState<SkippedItem[]>([])
  const [skippedModalOpen, setSkippedModalOpen] = useState(false)
  const [cachedCustomers, setCachedCustomers] = useState<Pick<Customer, 'id' | 'code' | 'name'>[]>([])
  const [cachedProducts, setCachedProducts] = useState<Pick<Product, 'id' | 'cip13' | 'name'>[]>([])
  const [fileName, setFileName] = useState('')
  const [detectedClient, setDetectedClient] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)

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

  const importHistory = getImportHistory()

  const reset = () => {
    setStep('upload')
    setHeaders([])
    setRows([])
    setSheetNames([])
    setSelectedSheet('')
    setWorkbook(null)
    setMapping({ customer_code: '', cip13: '', quantity: '', unit_price: '' })
    setConfidence([])
    setImportResult({ inserted: 0, errors: 0, skipped: 0 })
    setImportProgress({ current: 0, total: 0, phase: '' })
    setFileName('')
    setDetectedClient(null)
    setIsDragOver(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const processFile = (file: File) => {
    const name = file.name
    setFileName(name)
    const client = detectClientFromFilename(name)
    setDetectedClient(client)

    const reader = new FileReader()
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target?.result as ArrayBuffer)
      const wb = XLSX.read(data, { type: 'array' })
      setWorkbook(wb)
      setSheetNames(wb.SheetNames)
      setSelectedSheet(wb.SheetNames[0])
      loadSheet(wb, wb.SheetNames[0], client)
    }
    reader.readAsArrayBuffer(file)
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    processFile(file)
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false)
  }, [])

  const loadSheet = (wb: XLSX.WorkBook, sheetName: string, clientCode?: string | null) => {
    const ws = wb.Sheets[sheetName]
    const json = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' })
    if (json.length === 0) { toast.error('Feuille vide'); return }
    const hdrs = Object.keys(json[0])
    setHeaders(hdrs)
    setRows(json)

    // Try saved mapping for this client first
    const client = clientCode ?? detectedClient
    const saved = client ? getSavedMapping(client) : null
    const confidenceMap: MappingConfidence[] = []

    let resultMapping: OrderColumnMapping

    if (saved && hdrs.includes(saved.customer_code) && hdrs.includes(saved.cip13) && hdrs.includes(saved.quantity)) {
      // Use saved mapping — all required columns still exist
      resultMapping = { ...saved }
      // Validate each field still exists in headers
      for (const field of Object.keys(saved) as (keyof OrderColumnMapping)[]) {
        if (saved[field] && hdrs.includes(saved[field])) {
          confidenceMap.push({ field, source: 'saved' })
        } else {
          resultMapping[field] = ''
          confidenceMap.push({ field, source: 'none' })
        }
      }
    } else {
      // Auto-detect mapping
      const autoMap: OrderColumnMapping = { customer_code: '', cip13: '', quantity: '', unit_price: '' }
      for (const h of hdrs) {
        const lower = h.toLowerCase().replace(/[^a-z0-9]/g, '')
        if (lower.includes('client') || lower.includes('customer') || lower.includes('code')) {
          if (!autoMap.customer_code) {
            autoMap.customer_code = h
            confidenceMap.push({ field: 'customer_code', source: 'auto' })
          }
        }
        if (lower.includes('cip13') || lower.includes('cip')) {
          if (!autoMap.cip13) {
            autoMap.cip13 = h
            confidenceMap.push({ field: 'cip13', source: 'auto' })
          }
        }
        if (lower.includes('qty') || lower.includes('quantit') || lower.includes('quantity')) {
          if (!autoMap.quantity) {
            autoMap.quantity = h
            confidenceMap.push({ field: 'quantity', source: 'auto' })
          }
        }
        if (lower.includes('prix') || lower.includes('price') || lower.includes('unitprice')) {
          if (!autoMap.unit_price) {
            autoMap.unit_price = h
            confidenceMap.push({ field: 'unit_price', source: 'auto' })
          }
        }
      }
      // Fill missing confidence entries
      for (const field of Object.keys(FIELD_LABELS) as (keyof OrderColumnMapping)[]) {
        if (!confidenceMap.find(c => c.field === field)) {
          confidenceMap.push({ field, source: autoMap[field] ? 'auto' : 'none' })
        }
      }
      resultMapping = autoMap
    }

    setMapping(resultMapping)
    setConfidence(confidenceMap)
    setStep('mapping')
  }

  const handleSheetChange = (name: string) => {
    setSelectedSheet(name)
    if (workbook) loadSheet(workbook, name)
  }

  const updateMapping = (field: keyof OrderColumnMapping, value: string) => {
    setMapping(prev => ({ ...prev, [field]: value === 'none' ? '' : value }))
    setConfidence(prev => prev.map(c =>
      c.field === field ? { ...c, source: value === 'none' ? 'none' : 'manual' as const } : c
    ))
  }

  const canProceed = REQUIRED_FIELDS.every((f) => mapping[f])

  const getConfidenceBadge = (field: keyof OrderColumnMapping) => {
    const c = confidence.find(c => c.field === field)
    if (!c || c.source === 'none') return null
    if (c.source === 'saved') return <Badge variant="default" className="text-[9px] h-4 gap-0.5"><History className="h-2.5 w-2.5" /> Memorise</Badge>
    if (c.source === 'auto') return <Badge variant="secondary" className="text-[9px] h-4 gap-0.5"><Zap className="h-2.5 w-2.5" /> Auto</Badge>
    return null
  }

  const getSampleValues = (field: keyof OrderColumnMapping) => {
    const col = mapping[field]
    if (!col) return []
    return rows.slice(0, 3).map(r => String(r[col] || '').trim()).filter(Boolean)
  }

  const importMut = useMutation({
    mutationFn: async () => {
      setStep('importing')
      setImportProgress({ current: 0, total: rows.length, phase: 'Chargement des references...' })

      // Fetch all customers and products for matching
      const { data: customers } = await supabase.from('customers').select('id, code, name')
      const { data: products } = await supabase.from('products').select('id, cip13, name')

      const customersList = (customers ?? []) as Pick<Customer, 'id' | 'code' | 'name'>[]
      const productsList = (products ?? []) as Pick<Product, 'id' | 'cip13' | 'name'>[]
      setCachedCustomers(customersList)
      setCachedProducts(productsList)

      const customerMap = new Map(customersList.map((c) => [c.code?.toUpperCase(), c.id]))
      const productMap = new Map(productsList.map((p) => [p.cip13, p.id]))

      let inserted = 0
      let errors = 0
      let skipped = 0
      const skippedDetails: SkippedItem[] = []
      const batchSize = 100

      setImportProgress({ current: 0, total: rows.length, phase: 'Validation et insertion...' })

      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize).map((row, batchIdx) => {
          const rowIndex = i + batchIdx
          const code = String(row[mapping.customer_code] || '').trim().toUpperCase()
          const cip13 = String(row[mapping.cip13] || '').trim()
          const qty = parseInt(String(row[mapping.quantity] || '0'), 10)
          const price = mapping.unit_price ? parseFloat(String(row[mapping.unit_price]).replace(',', '.')) || null : null

          const customerId = customerMap.get(code)
          const productId = productMap.get(cip13)

          if (!customerId || !productId || qty <= 0) {
            let reason: SkippedItem['reason'] = 'invalid_quantity'
            if (!customerId && !productId) reason = 'both_unknown'
            else if (!customerId) reason = 'unknown_customer'
            else if (!productId) reason = 'unknown_product'

            skippedDetails.push({
              rowIndex,
              customerCode: code,
              cip13,
              quantity: qty,
              unitPrice: price,
              reason,
            })
            return null
          }

          return {
            monthly_process_id: process.id,
            customer_id: customerId,
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
          const { error, data } = await supabase
            .from('orders')
            .insert(validBatch)
            .select('id')

          if (error) {
            errors += validBatch.length
            console.error('Batch error:', error)
          } else {
            inserted += data?.length ?? validBatch.length
          }
        }

        setImportProgress({
          current: Math.min(i + batchSize, rows.length),
          total: rows.length,
          phase: `${Math.min(i + batchSize, rows.length)} / ${rows.length} lignes traitees`,
        })
      }

      // Update process orders_count
      await supabase
        .from('monthly_processes')
        .update({ orders_count: (existingOrders ?? 0) + inserted, status: 'importing' })
        .eq('id', process.id)

      // Save mapping for this client
      if (detectedClient) {
        saveMappingForCustomer(detectedClient, mapping)
      }

      // Save import history
      addImportHistory({
        fileName,
        date: new Date().toISOString(),
        rowCount: rows.length,
        clientCode: detectedClient,
      })

      setSkippedItems(skippedDetails)
      return { inserted, errors, skipped }
    },
    onSuccess: (result) => {
      setImportResult(result)
      setStep('done')
      queryClient.invalidateQueries({ queryKey: ['orders', process.id] })
      queryClient.invalidateQueries({ queryKey: ['monthly-processes'] })
      toast.success(`${result.inserted} commandes importees`)
    },
    onError: (err: Error) => {
      toast.error(`Erreur: ${err.message}`)
      setStep('preview')
    },
  })

  const handleResolvedItems = async (resolved: ResolvedItem[]) => {
    if (resolved.length === 0) return
    const ordersToInsert = resolved.map((r) => ({
      monthly_process_id: process.id,
      customer_id: r.customerId,
      product_id: r.productId,
      quantity: r.quantity,
      unit_price: r.unitPrice,
      status: 'pending' as const,
      metadata: {},
    }))

    const { error, data } = await supabase.from('orders').insert(ordersToInsert).select('id')
    if (error) {
      toast.error(`Erreur lors de l'insertion: ${error.message}`)
      return
    }
    const count = data?.length ?? resolved.length
    setImportResult((prev) => ({
      ...prev,
      inserted: prev.inserted + count,
      skipped: prev.skipped - count,
    }))
    const resolvedIndexes = new Set(resolved.map((r) => r.rowIndex))
    setSkippedItems((prev) => prev.filter((s) => !resolvedIndexes.has(s.rowIndex)))

    await supabase
      .from('monthly_processes')
      .update({ orders_count: (existingOrders ?? 0) + importResult.inserted + count })
      .eq('id', process.id)

    queryClient.invalidateQueries({ queryKey: ['orders', process.id] })
    queryClient.invalidateQueries({ queryKey: ['monthly-processes'] })
    toast.success(`${count} commandes recuperees`)
  }

  const progressPercent = importProgress.total > 0 ? (importProgress.current / importProgress.total) * 100 : 0

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Importation des Commandes</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Importez les fichiers Excel de commandes clients pour ce mois.
        </p>
      </div>

      {existingOrders != null && existingOrders > 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4 flex items-center gap-3">
            <FileSpreadsheet className="h-5 w-5 text-primary shrink-0" />
            <p className="text-sm">
              <strong>{existingOrders}</strong> commandes deja importees pour ce processus.
            </p>
          </CardContent>
        </Card>
      )}

      {step === 'upload' && (
        <div className="space-y-4">
          <div
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all duration-200 ${
              isDragOver
                ? 'border-primary bg-primary/5 scale-[1.01]'
                : 'hover:border-primary/50 hover:bg-muted/30'
            }`}
            onClick={() => fileRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <div className={`h-14 w-14 rounded-2xl mx-auto mb-4 flex items-center justify-center transition-all ${
              isDragOver ? 'bg-primary/20 scale-110' : 'bg-muted'
            }`}>
              <Upload className={`h-7 w-7 transition-colors ${isDragOver ? 'text-primary' : 'text-muted-foreground'}`} />
            </div>
            <p className="text-sm font-medium">
              {isDragOver ? 'Deposez le fichier ici' : 'Deposez un fichier Excel ou cliquez pour selectionner'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">.xlsx, .xls, .csv — Formats commandes clients (ORI, MPA, AXI...)</p>
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />

          {/* Import history */}
          {importHistory.length > 0 && (
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

          {existingOrders != null && existingOrders > 0 && (
            <div className="flex justify-end">
              <Button onClick={onNext} className="gap-2">
                Passer a l'etape suivante <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}

      {step === 'mapping' && (
        <div className="space-y-4">
          {/* File info + detected client */}
          <Card className="border-muted">
            <CardContent className="p-3 flex items-center gap-3 flex-wrap">
              <Badge variant="outline" className="gap-1.5 py-1">
                <FileSpreadsheet className="h-3 w-3" />
                {fileName}
              </Badge>
              <span className="text-xs text-muted-foreground">{rows.length} lignes</span>
              {detectedClient && (
                <Badge variant="default" className="gap-1 text-xs">
                  <Sparkles className="h-3 w-3" />
                  Client detecte : {detectedClient}
                </Badge>
              )}
              {confidence.some(c => c.source === 'saved') && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  <History className="h-3 w-3" />
                  Mapping memorise applique
                </Badge>
              )}
            </CardContent>
          </Card>

          {sheetNames.length > 1 && (
            <div className="space-y-2">
              <Label>Feuille</Label>
              <Select value={selectedSheet} onValueChange={handleSheetChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {sheetNames.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            Mappez les colonnes aux champs commande.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(Object.keys(FIELD_LABELS) as (keyof OrderColumnMapping)[]).map((field) => {
              const samples = getSampleValues(field)
              return (
                <div key={field} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">{FIELD_LABELS[field]}</Label>
                    {getConfidenceBadge(field)}
                    {mapping[field] && (
                      <Check className="h-3 w-3 text-green-500 ml-auto" />
                    )}
                  </div>
                  <Select
                    value={mapping[field] || 'none'}
                    onValueChange={(v) => updateMapping(field, v)}
                  >
                    <SelectTrigger className="h-9"><SelectValue placeholder="Non mappe" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- Non mappe --</SelectItem>
                      {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {/* Sample values preview */}
                  {samples.length > 0 && (
                    <p className="text-[10px] text-muted-foreground font-mono truncate">
                      Ex: {samples.join(', ')}
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          {/* Mapping completeness indicator */}
          <div className="flex items-center gap-2">
            <Progress
              value={(Object.values(mapping).filter(Boolean).length / Object.keys(mapping).length) * 100}
              className="h-1.5 flex-1"
            />
            <span className="text-xs text-muted-foreground">
              {Object.values(mapping).filter(Boolean).length}/{Object.keys(mapping).length} champs mappes
            </span>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={reset}>Retour</Button>
            <Button onClick={() => { if (canProceed) setStep('preview'); else toast.error('Champs obligatoires manquants') }} disabled={!canProceed}>
              Apercu
            </Button>
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Apercu des 10 premieres lignes sur {rows.length} total.
          </p>
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Code Client</TableHead>
                  <TableHead>CIP13</TableHead>
                  <TableHead>Quantite</TableHead>
                  <TableHead>Prix</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, 10).map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-muted-foreground text-xs">{i + 1}</TableCell>
                    <TableCell className="font-mono text-sm">{row[mapping.customer_code]}</TableCell>
                    <TableCell className="font-mono text-sm">{row[mapping.cip13]}</TableCell>
                    <TableCell>{row[mapping.quantity]}</TableCell>
                    <TableCell>{mapping.unit_price ? row[mapping.unit_price] : '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep('mapping')}>Retour</Button>
            <Button onClick={() => importMut.mutate()}>
              Importer {rows.length} commandes
            </Button>
          </div>
        </div>
      )}

      {step === 'importing' && (
        <div className="py-10 text-center space-y-4">
          <div className="relative mx-auto w-16 h-16">
            <div className="animate-spin h-16 w-16 border-4 border-primary border-t-transparent rounded-full" />
            <FileSpreadsheet className="h-6 w-6 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          </div>
          <p className="font-medium">Import en cours...</p>
          <div className="max-w-xs mx-auto space-y-2">
            <Progress value={progressPercent} className="h-2" />
            <p className="text-sm text-muted-foreground">{importProgress.phase}</p>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="py-8 text-center space-y-4">
          <div className="h-16 w-16 rounded-2xl bg-green-100 dark:bg-green-950 flex items-center justify-center mx-auto">
            <Check className="h-8 w-8 text-green-600" />
          </div>
          <div>
            <p className="text-lg font-medium">Import termine</p>
            <div className="flex items-center justify-center gap-4 mt-2">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{importResult.inserted}</p>
                <p className="text-xs text-muted-foreground">Importees</p>
              </div>
              {importResult.skipped > 0 && (
                <div className="text-center">
                  <p className="text-2xl font-bold text-amber-600">{importResult.skipped}</p>
                  <p className="text-xs text-muted-foreground">Ignorees</p>
                </div>
              )}
              {importResult.errors > 0 && (
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-600">{importResult.errors}</p>
                  <p className="text-xs text-muted-foreground">Erreurs</p>
                </div>
              )}
            </div>
          </div>

          {skippedItems.length > 0 && (
            <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 text-left max-w-md mx-auto">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                  <p className="text-sm font-medium">{skippedItems.length} lignes a verifier</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Clients ou produits non reconnus. Vous pouvez les creer ou les mapper sans quitter ce flow.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSkippedModalOpen(true)}
                  className="gap-1.5 w-full"
                >
                  <Eye className="h-3.5 w-3.5" />
                  Examiner les lignes ignorees
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-center gap-3">
            <Button variant="outline" onClick={reset}>Importer un autre fichier</Button>
            <Button onClick={onNext} className="gap-2">
              Etape suivante <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <SkippedItemsReviewModal
        open={skippedModalOpen}
        onOpenChange={setSkippedModalOpen}
        skippedItems={skippedItems}
        existingCustomers={cachedCustomers}
        existingProducts={cachedProducts}
        onResolved={handleResolvedItems}
      />
    </div>
  )
}

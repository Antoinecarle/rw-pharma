import { useState, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Upload, FileSpreadsheet, Check, AlertTriangle, ArrowRight, Eye } from 'lucide-react'
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
  const [importResult, setImportResult] = useState({ inserted: 0, errors: 0, skipped: 0 })
  const [skippedItems, setSkippedItems] = useState<SkippedItem[]>([])
  const [skippedModalOpen, setSkippedModalOpen] = useState(false)
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

  const reset = () => {
    setStep('upload')
    setHeaders([])
    setRows([])
    setSheetNames([])
    setSelectedSheet('')
    setWorkbook(null)
    setMapping({ customer_code: '', cip13: '', quantity: '', unit_price: '' })
    setImportResult({ inserted: 0, errors: 0, skipped: 0 })
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target?.result as ArrayBuffer)
      const wb = XLSX.read(data, { type: 'array' })
      setWorkbook(wb)
      setSheetNames(wb.SheetNames)
      setSelectedSheet(wb.SheetNames[0])
      loadSheet(wb, wb.SheetNames[0])
    }
    reader.readAsArrayBuffer(file)
  }

  const loadSheet = (wb: XLSX.WorkBook, sheetName: string) => {
    const ws = wb.Sheets[sheetName]
    const json = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' })
    if (json.length === 0) { toast.error('Feuille vide'); return }
    const hdrs = Object.keys(json[0])
    setHeaders(hdrs)
    setRows(json)

    const autoMap: OrderColumnMapping = { customer_code: '', cip13: '', quantity: '', unit_price: '' }
    for (const h of hdrs) {
      const lower = h.toLowerCase().replace(/[^a-z0-9]/g, '')
      if (lower.includes('client') || lower.includes('customer') || lower.includes('code')) autoMap.customer_code = autoMap.customer_code || h
      if (lower.includes('cip13') || lower.includes('cip')) autoMap.cip13 = autoMap.cip13 || h
      if (lower.includes('qty') || lower.includes('quantit') || lower.includes('quantity')) autoMap.quantity = autoMap.quantity || h
      if (lower.includes('prix') || lower.includes('price') || lower.includes('unitprice')) autoMap.unit_price = autoMap.unit_price || h
    }
    setMapping(autoMap)
    setStep('mapping')
  }

  const handleSheetChange = (name: string) => {
    setSelectedSheet(name)
    if (workbook) loadSheet(workbook, name)
  }

  const canProceed = REQUIRED_FIELDS.every((f) => mapping[f])

  const importMut = useMutation({
    mutationFn: async () => {
      setStep('importing')
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

        if (validBatch.length === 0) continue

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

      // Update process orders_count
      await supabase
        .from('monthly_processes')
        .update({ orders_count: (existingOrders ?? 0) + inserted, status: 'importing' })
        .eq('id', process.id)

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
    // Remove resolved from skippedItems
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
            className="border-2 border-dashed rounded-lg p-10 text-center cursor-pointer hover:border-primary transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm font-medium">Cliquez pour selectionner un fichier Excel</p>
            <p className="text-xs text-muted-foreground mt-1">.xlsx, .xls, .csv</p>
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />

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
            {rows.length} lignes detectees. Mappez les colonnes aux champs commande.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(Object.keys(FIELD_LABELS) as (keyof OrderColumnMapping)[]).map((field) => (
              <div key={field} className="space-y-1">
                <Label className="text-xs">{FIELD_LABELS[field]}</Label>
                <Select
                  value={mapping[field] || 'none'}
                  onValueChange={(v) => setMapping({ ...mapping, [field]: v === 'none' ? '' : v })}
                >
                  <SelectTrigger className="h-9"><SelectValue placeholder="Non mappe" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">-- Non mappe --</SelectItem>
                    {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
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
            Apercu des 5 premieres lignes sur {rows.length} total.
          </p>
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code Client</TableHead>
                  <TableHead>CIP13</TableHead>
                  <TableHead>Quantite</TableHead>
                  <TableHead>Prix</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, 5).map((row, i) => (
                  <TableRow key={i}>
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
        <div className="py-10 text-center space-y-3">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
          <p className="font-medium">Import en cours...</p>
          <p className="text-sm text-muted-foreground">Veuillez patienter</p>
        </div>
      )}

      {step === 'done' && (
        <div className="py-8 text-center space-y-4">
          <Check className="h-12 w-12 text-green-500 mx-auto" />
          <div>
            <p className="text-lg font-medium">Import termine</p>
            <p className="text-sm text-muted-foreground mt-1">
              {importResult.inserted} commandes importees
              {importResult.skipped > 0 && <span className="text-amber-600 ml-2">{importResult.skipped} ignorees</span>}
              {importResult.errors > 0 && (
                <span className="text-destructive ml-2">
                  <AlertTriangle className="h-3 w-3 inline" /> {importResult.errors} erreurs
                </span>
              )}
            </p>
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

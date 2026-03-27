import { useState, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Upload, FileSpreadsheet, Check, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

interface ColumnMapping {
  cip13: string
  name: string
  cip7: string
  eunb: string
  pfht: string
  laboratory: string
}

const REQUIRED_FIELDS: (keyof ColumnMapping)[] = ['cip13', 'name']
const FIELD_LABELS: Record<keyof ColumnMapping, string> = {
  cip13: 'CIP13 *',
  name: 'Nom du produit *',
  cip7: 'CIP7',
  eunb: 'EUNB',
  pfht: 'PFHT (Prix)',
  laboratory: 'Laboratoire',
}

interface ExcelImportProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function ExcelImport({ open, onOpenChange }: ExcelImportProps) {
  const queryClient = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview' | 'importing' | 'done'>('upload')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [selectedSheet, setSelectedSheet] = useState<string>('')
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null)
  const [mapping, setMapping] = useState<ColumnMapping>({
    cip13: '',
    name: '',
    cip7: '',
    eunb: '',
    pfht: '',
    laboratory: '',
  })
  const [importResult, setImportResult] = useState<{ inserted: number; errors: number }>({ inserted: 0, errors: 0 })

  const reset = () => {
    setStep('upload')
    setHeaders([])
    setRows([])
    setSheetNames([])
    setSelectedSheet('')
    setWorkbook(null)
    setMapping({ cip13: '', name: '', cip7: '', eunb: '', pfht: '', laboratory: '' })
    setImportResult({ inserted: 0, errors: 0 })
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
    if (json.length === 0) {
      toast.error('Feuille vide')
      return
    }
    const hdrs = Object.keys(json[0])
    setHeaders(hdrs)
    setRows(json)

    // Auto-detect mapping
    const autoMap: ColumnMapping = { cip13: '', name: '', cip7: '', eunb: '', pfht: '', laboratory: '' }
    for (const h of hdrs) {
      const lower = h.toLowerCase().replace(/[^a-z0-9]/g, '')
      if (lower.includes('cip13') || lower === 'cip13') autoMap.cip13 = h
      else if (lower.includes('cip7') || lower === 'cip7') autoMap.cip7 = h
      else if (lower.includes('eunb') || lower === 'eu') autoMap.eunb = h
      else if (lower.includes('pfht') || lower.includes('prix')) autoMap.pfht = h
      else if (lower.includes('labo') || lower.includes('laboratory')) autoMap.laboratory = h
      else if (lower.includes('product') || lower.includes('produit') || lower.includes('nom') || lower === 'name') autoMap.name = h
    }
    setMapping(autoMap)
    setStep('mapping')
  }

  const handleSheetChange = (name: string) => {
    setSelectedSheet(name)
    if (workbook) loadSheet(workbook, name)
  }

  const canProceed = REQUIRED_FIELDS.every((f) => mapping[f])

  const goToPreview = () => {
    if (!canProceed) {
      toast.error('Veuillez mapper les champs obligatoires (CIP13, Nom)')
      return
    }
    setStep('preview')
  }

  const importMut = useMutation({
    mutationFn: async () => {
      setStep('importing')
      let inserted = 0
      let errors = 0

      // Process in batches of 100
      const batchSize = 100
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize).map((row) => ({
          cip13: String(row[mapping.cip13] || '').trim(),
          name: String(row[mapping.name] || '').trim(),
          cip7: mapping.cip7 ? String(row[mapping.cip7] || '').trim() || null : null,
          eunb: mapping.eunb ? String(row[mapping.eunb] || '').trim() || null : null,
          pfht: mapping.pfht ? parseFloat(String(row[mapping.pfht]).replace(',', '.')) || null : null,
          laboratory: mapping.laboratory ? String(row[mapping.laboratory] || '').trim() || null : null,
          is_ansm_blocked: false,
          metadata: {},
        })).filter((p) => p.cip13 && p.name)

        if (batch.length === 0) continue

        const { error, data } = await supabase
          .from('products')
          .upsert(batch, { onConflict: 'cip13' })
          .select('id')

        if (error) {
          errors += batch.length
          console.error('Batch error:', error)
        } else {
          inserted += data?.length ?? batch.length
        }
      }

      return { inserted, errors }
    },
    onSuccess: (result) => {
      setImportResult(result)
      setStep('done')
      queryClient.invalidateQueries({ queryKey: ['products'] })
      toast.success(`${result.inserted} produits importés`)
    },
    onError: (err: Error) => {
      toast.error(`Erreur: ${err.message}`)
      setStep('preview')
    },
  })

  const previewRows = rows.slice(0, 5)

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset()
        onOpenChange(v)
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            <FileSpreadsheet className="h-5 w-5 inline mr-2" />
            Import catalogue produits
          </DialogTitle>
          <DialogDescription>
            Importez un fichier Excel (.xlsx) contenant votre catalogue produits
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4">
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm font-medium">Cliquez pour sélectionner un fichier Excel</p>
              <p className="text-xs text-muted-foreground mt-1">.xlsx, .xls, .csv</p>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFile}
              className="hidden"
            />
          </div>
        )}

        {step === 'mapping' && (
          <div className="space-y-4">
            {sheetNames.length > 1 && (
              <div className="space-y-2">
                <Label>Feuille</Label>
                <Select value={selectedSheet} onValueChange={handleSheetChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sheetNames.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <p className="text-sm text-muted-foreground">
              {rows.length} lignes détectées. Mappez les colonnes du fichier aux champs produit.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(Object.keys(FIELD_LABELS) as (keyof ColumnMapping)[]).map((field) => {
                const isRequired = REQUIRED_FIELDS.includes(field)
                const isOptionalUnmapped = !isRequired && !mapping[field]
                return (
                  <div key={field} className={`space-y-1 ${isOptionalUnmapped ? 'opacity-60' : ''}`}>
                    <div className="flex items-center gap-1.5">
                      <Label className="text-xs">{FIELD_LABELS[field]}</Label>
                      {!isRequired && <span className="text-[9px] text-muted-foreground italic">(optionnel)</span>}
                    </div>
                    <Select
                      value={mapping[field] || 'none'}
                      onValueChange={(v) => setMapping({ ...mapping, [field]: v === 'none' ? '' : v })}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Non mappe" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">-- Non mappe --</SelectItem>
                        {headers.map((h) => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {isOptionalUnmapped && (
                      <p className="text-[10px] text-muted-foreground/50 italic">Optionnel — sera ignore</p>
                    )}
                  </div>
                )
              })}
            </div>

            {(() => {
              const reqMapped = REQUIRED_FIELDS.filter(f => mapping[f]).length
              const reqTotal = REQUIRED_FIELDS.length
              const allFields = Object.keys(FIELD_LABELS) as (keyof ColumnMapping)[]
              const optFields = allFields.filter(f => !REQUIRED_FIELDS.includes(f))
              const optMapped = optFields.filter(f => mapping[f]).length
              const optTotal = optFields.length
              const allReqDone = reqMapped === reqTotal
              return (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className={`h-1.5 flex-1 rounded-full bg-muted overflow-hidden`}>
                      <div
                        className={`h-full rounded-full transition-all ${allReqDone ? 'bg-green-500' : 'bg-primary'}`}
                        style={{ width: `${allReqDone ? 100 : (reqMapped / reqTotal) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      Requis : {reqMapped}/{reqTotal} {allReqDone ? '✓' : ''} · Optionnels : {optMapped}/{optTotal}
                    </span>
                  </div>
                  {allReqDone && (
                    <p className="text-[11px] text-green-600 dark:text-green-400 font-medium">
                      Tous les champs obligatoires sont mappes — vous pouvez continuer.
                    </p>
                  )}
                </div>
              )
            })()}

            <DialogFooter>
              <Button variant="outline" onClick={reset}>Retour</Button>
              <Button onClick={goToPreview} disabled={!canProceed}>
                Aperçu
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Aperçu des 5 premières lignes sur {rows.length} total.
            </p>

            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>CIP13</TableHead>
                    <TableHead>Nom</TableHead>
                    <TableHead>Labo</TableHead>
                    <TableHead>PFHT</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-sm">{row[mapping.cip13]}</TableCell>
                      <TableCell>{row[mapping.name]}</TableCell>
                      <TableCell className="text-muted-foreground">{mapping.laboratory ? row[mapping.laboratory] : '-'}</TableCell>
                      <TableCell>{mapping.pfht ? row[mapping.pfht] : '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('mapping')}>Retour</Button>
              <Button onClick={() => importMut.mutate()}>
                Importer {rows.length} produits
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'importing' && (
          <div className="py-8 text-center space-y-3">
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
                {importResult.inserted} produits importes
                {importResult.errors > 0 && (
                  <span className="text-destructive ml-2">
                    <AlertTriangle className="h-3 w-3 inline" /> {importResult.errors} erreurs
                  </span>
                )}
              </p>
            </div>
            <Button onClick={() => { reset(); onOpenChange(false) }}>
              Fermer
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

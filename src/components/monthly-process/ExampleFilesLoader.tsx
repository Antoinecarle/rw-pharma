import { useState } from 'react'
import { FileSpreadsheet, FlaskConical, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'

// --------------- Storage config ---------------

const BUCKET = 'example-files'

function getPublicUrl(path: string): string {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}

async function fetchCsvAsFile(storagePath: string, fileName: string): Promise<File> {
  const url = getPublicUrl(storagePath)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Impossible de charger ${fileName}`)
  const blob = await res.blob()
  return new File([blob], fileName, { type: 'text/csv' })
}

// --------------- Example file definitions ---------------

interface ExampleFileDef {
  name: string
  storagePath: string
  entity: string
}

interface ExampleFileGroup {
  label: string
  files: ExampleFileDef[]
}

export type ExampleCategory = 'orders' | 'stock' | 'quotas'

const ORDER_EXAMPLES: ExampleFileGroup[] = [
  {
    label: 'Avril 2027 (10 produits, 7 clients)',
    files: [
      { name: 'commandes_ori_avril_2027.csv', storagePath: 'commandes/avril2027/commandes_ori_avril_2027.csv', entity: 'ORIFARM' },
      { name: 'commandes_mpa_avril_2027.csv', storagePath: 'commandes/avril2027/commandes_mpa_avril_2027.csv', entity: 'MPA' },
      { name: 'commandes_aba_avril_2027.csv', storagePath: 'commandes/avril2027/commandes_aba_avril_2027.csv', entity: 'ABACUS' },
      { name: 'commandes_axi_avril_2027.csv', storagePath: 'commandes/avril2027/commandes_axi_avril_2027.csv', entity: 'AXICORP' },
      { name: 'commandes_cc_avril_2027.csv', storagePath: 'commandes/avril2027/commandes_cc_avril_2027.csv', entity: 'CC PHARMA' },
      { name: 'commandes_medcor_avril_2027.csv', storagePath: 'commandes/avril2027/commandes_medcor_avril_2027.csv', entity: 'MEDCOR' },
      { name: 'commandes_brocacef_avril_2027.csv', storagePath: 'commandes/avril2027/commandes_brocacef_avril_2027.csv', entity: 'BROCACEF' },
    ],
  },
  {
    label: 'Janvier 2026',
    files: [
      { name: 'commande_orifarm_jan2026.csv', storagePath: 'commandes/jan2026/commande_orifarm_jan2026.csv', entity: 'ORIFARM' },
      { name: 'commande_mpa_jan2026.csv', storagePath: 'commandes/jan2026/commande_mpa_jan2026.csv', entity: 'MPA' },
      { name: 'commande_axicorp_jan2026.csv', storagePath: 'commandes/jan2026/commande_axicorp_jan2026.csv', entity: 'AXICORP' },
      { name: 'commande_medcor_jan2026.csv', storagePath: 'commandes/jan2026/commande_medcor_jan2026.csv', entity: 'MEDCOR' },
    ],
  },
  {
    label: 'Mars 2026',
    files: [
      { name: 'commandes_orifarm_mars_2026.csv', storagePath: 'commandes/mars2026/commandes_orifarm_mars_2026.csv', entity: 'ORIFARM' },
      { name: 'commandes_mpa_mars_2026.csv', storagePath: 'commandes/mars2026/commandes_mpa_mars_2026.csv', entity: 'MPA' },
      { name: 'commandes_axicorp_mars_2026.csv', storagePath: 'commandes/mars2026/commandes_axicorp_mars_2026.csv', entity: 'AXICORP' },
      { name: 'commandes_ccpharma_mars_2026.csv', storagePath: 'commandes/mars2026/commandes_ccpharma_mars_2026.csv', entity: 'CC PHARMA' },
    ],
  },
]

const STOCK_EXAMPLES: ExampleFileGroup[] = [
  {
    label: 'Avril 2027 (32 lots, 5 grossistes)',
    files: [
      { name: 'stock_collecte_avril_2027.csv', storagePath: 'stock/avril2027/stock_collecte_avril_2027.csv', entity: 'Tous grossistes' },
      { name: 'stock_epsilon_avril_2027.csv', storagePath: 'stock/avril2027/stock_epsilon_avril_2027.csv', entity: 'EPSILON' },
      { name: 'stock_ginkgo_avril_2027.csv', storagePath: 'stock/avril2027/stock_ginkgo_avril_2027.csv', entity: "GINK'GO" },
      { name: 'stock_sna_avril_2027.csv', storagePath: 'stock/avril2027/stock_sna_avril_2027.csv', entity: 'SNA' },
      { name: 'stock_so_avril_2027.csv', storagePath: 'stock/avril2027/stock_so_avril_2027.csv', entity: 'SO' },
      { name: 'stock_ocp_avril_2027.csv', storagePath: 'stock/avril2027/stock_ocp_avril_2027.csv', entity: 'OCP' },
    ],
  },
  {
    label: 'Janvier 2026',
    files: [
      { name: 'stock_epsilon_jan2026.csv', storagePath: 'stock/jan2026/stock_epsilon_jan2026.csv', entity: 'EPSILON' },
      { name: 'stock_ginkgo_jan2026.csv', storagePath: 'stock/jan2026/stock_ginkgo_jan2026.csv', entity: "GINK'GO" },
      { name: 'stock_sna_jan2026.csv', storagePath: 'stock/jan2026/stock_sna_jan2026.csv', entity: 'SNA' },
      { name: 'stock_so_jan2026.csv', storagePath: 'stock/jan2026/stock_so_jan2026.csv', entity: 'SO' },
    ],
  },
  {
    label: 'Mars 2026',
    files: [
      { name: 'stock_collecte_mars_2026.csv', storagePath: 'stock/mars2026/stock_collecte_mars_2026.csv', entity: 'Tous grossistes' },
    ],
  },
]

const QUOTA_EXAMPLES: ExampleFileGroup[] = [
  {
    label: 'Avril 2027 (29 quotas, 10 produits)',
    files: [
      { name: 'quotas_avril_2027.csv', storagePath: 'quotas/avril2027/quotas_avril_2027.csv', entity: 'Tous grossistes' },
    ],
  },
  {
    label: 'Janvier 2026',
    files: [
      { name: 'quotas_jan2026.csv', storagePath: 'quotas/jan2026/quotas_jan2026.csv', entity: 'Tous grossistes' },
    ],
  },
  {
    label: 'Mars 2026',
    files: [
      { name: 'quotas_mars_2026.csv', storagePath: 'quotas/mars2026/quotas_mars_2026.csv', entity: 'Tous grossistes' },
    ],
  },
]

const EXAMPLES: Record<ExampleCategory, ExampleFileGroup[]> = {
  orders: ORDER_EXAMPLES,
  stock: STOCK_EXAMPLES,
  quotas: QUOTA_EXAMPLES,
}

// --------------- Component ---------------

interface ExampleFilesLoaderProps {
  category: ExampleCategory
  onLoadFiles: (files: File[]) => void
}

export default function ExampleFilesLoader({ category, onLoadFiles }: ExampleFilesLoaderProps) {
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)
  const groups = EXAMPLES[category]

  const handleLoadGroup = async (group: ExampleFileGroup) => {
    const key = group.label
    setLoading(key)
    try {
      const files = await Promise.all(
        group.files.map(f => fetchCsvAsFile(f.storagePath, f.name))
      )
      onLoadFiles(files)
      toast.success(`${files.length} fichier(s) charge(s) depuis "${group.label}"`)
    } catch (err) {
      toast.error(`Erreur : ${err instanceof Error ? err.message : 'Echec du chargement'}`)
    } finally {
      setLoading(null)
    }
  }

  const handleLoadSingle = async (f: ExampleFileDef) => {
    setLoading(f.name)
    try {
      const file = await fetchCsvAsFile(f.storagePath, f.name)
      onLoadFiles([file])
    } catch (err) {
      toast.error(`Erreur : ${err instanceof Error ? err.message : 'Echec du chargement'}`)
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-purple-300/50 bg-purple-50/30 dark:bg-purple-950/10 p-3 space-y-2">
      <button
        type="button"
        className="flex items-center gap-2 w-full text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <FlaskConical className="h-3.5 w-3.5 text-purple-500 shrink-0" />
        <span className="text-xs font-medium text-purple-700 dark:text-purple-300">
          Fichiers d'exemple disponibles
        </span>
        <Badge variant="outline" className="text-[9px] border-purple-300 text-purple-500 px-1.5 py-0">
          Supabase Storage
        </Badge>
        {expanded
          ? <ChevronUp className="h-3 w-3 text-purple-400 ml-auto" />
          : <ChevronDown className="h-3 w-3 text-purple-400 ml-auto" />
        }
      </button>

      {expanded && (
        <div className="space-y-3 pt-1">
          {groups.map((group) => (
            <div key={group.label} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium text-muted-foreground">{group.label}</span>
                <button
                  type="button"
                  className="text-[10px] text-purple-600 hover:text-purple-800 underline underline-offset-2 inline-flex items-center gap-1"
                  onClick={() => handleLoadGroup(group)}
                  disabled={loading !== null}
                >
                  {loading === group.label && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                  Charger tout ({group.files.length})
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {group.files.map((f) => (
                  <button
                    key={f.name}
                    type="button"
                    className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] bg-white dark:bg-gray-900 border border-purple-200/50 hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/20 transition-colors disabled:opacity-50"
                    onClick={(e) => { e.stopPropagation(); handleLoadSingle(f) }}
                    disabled={loading !== null}
                    title={f.name}
                  >
                    {loading === f.name
                      ? <Loader2 className="h-3 w-3 text-purple-400 animate-spin" />
                      : <FileSpreadsheet className="h-3 w-3 text-purple-400" />
                    }
                    <span className="text-purple-700 dark:text-purple-300">{f.entity}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

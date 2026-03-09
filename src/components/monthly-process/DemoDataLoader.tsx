import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FlaskConical, Loader2, Trash2, CheckCircle2, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

import scenarioComplet from '../../../data/examples/demo-scenarios/scenario_complet.json'
import scenarioNotion from '../../../data/examples/demo-scenarios/scenario_notion_jan2026.json'

const SCENARIOS: Record<string, { label: string; data: unknown }> = {
  complet: {
    label: 'Scenario Complet (6 clients, 10 produits)',
    data: scenarioComplet,
  },
  notion_jan2026: {
    label: 'Scenario Notion Jan 2026 (4 clients, 2 produits, FEFO)',
    data: scenarioNotion,
  },
}

interface DemoResult {
  success: boolean
  process_id?: string
  counts?: Record<string, number>
  error?: string
}

export default function DemoDataLoader() {
  // Only render in dev mode
  if (!import.meta.env.DEV) return null

  const [selectedScenario, setSelectedScenario] = useState('complet')
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const loadMut = useMutation({
    mutationFn: async () => {
      const scenario = SCENARIOS[selectedScenario]?.data
      if (!scenario) throw new Error('Scenario introuvable')

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Non authentifie')

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/load-demo-data`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ action: 'load', scenario }),
        }
      )

      const result: DemoResult = await res.json()
      if (!res.ok || !result.success) {
        throw new Error(result.error ?? 'Erreur inconnue')
      }
      return result
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['monthly-processes'] })
      toast.success(
        `Demo chargee : ${result.counts?.quotas ?? 0} quotas, ${result.counts?.orders ?? 0} commandes, ${result.counts?.lots ?? 0} lots, ${result.counts?.collected_stock ?? 0} stocks`
      )
      if (result.process_id) {
        navigate(`/monthly-processes/${result.process_id}`)
      }
    },
    onError: (err: Error) => toast.error(`Echec : ${err.message}`),
  })

  const cleanupMut = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Non authentifie')

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/load-demo-data`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ action: 'cleanup' }),
        }
      )

      const result = await res.json()
      if (!res.ok || !result.success) {
        throw new Error(result.error ?? 'Erreur inconnue')
      }
      return result
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['monthly-processes'] })
      toast.success(`Donnees demo nettoyees (${result.cleaned ?? 0} processus supprimes)`)
    },
    onError: (err: Error) => toast.error(`Echec nettoyage : ${err.message}`),
  })

  const isLoading = loadMut.isPending || cleanupMut.isPending

  return (
    <div className="rounded-xl border-2 border-dashed p-4 space-y-3"
      style={{ borderColor: 'rgba(168, 85, 247, 0.3)', background: 'rgba(168, 85, 247, 0.04)' }}>
      <div className="flex items-center gap-2">
        <FlaskConical className="h-4 w-4 text-purple-500" />
        <span className="text-sm font-medium text-purple-700 dark:text-purple-300">
          Mode Demo
        </span>
        <Badge variant="outline" className="text-[10px] border-purple-300 text-purple-600">
          DEV ONLY
        </Badge>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Select value={selectedScenario} onValueChange={setSelectedScenario} disabled={isLoading}>
          <SelectTrigger className="w-[300px] h-9 text-sm rounded-lg">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(SCENARIOS).map(([key, { label }]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          size="sm"
          className="rounded-lg gap-1.5 bg-purple-600 hover:bg-purple-700 text-white"
          onClick={() => loadMut.mutate()}
          disabled={isLoading}
        >
          {loadMut.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : loadMut.isSuccess ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : loadMut.isError ? (
            <AlertCircle className="h-3.5 w-3.5" />
          ) : (
            <FlaskConical className="h-3.5 w-3.5" />
          )}
          Charger Donnees Demo
        </Button>

        <Button
          size="sm"
          variant="outline"
          className="rounded-lg gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/5"
          onClick={() => cleanupMut.mutate()}
          disabled={isLoading}
        >
          {cleanupMut.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
          Nettoyer Demo
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Charge un jeu de donnees complet (quotas, commandes, lots, stock) pour tester le parcours de bout en bout.
        Les donnees precedentes marquees [DEMO] seront automatiquement nettoyees avant chargement.
      </p>
    </div>
  )
}

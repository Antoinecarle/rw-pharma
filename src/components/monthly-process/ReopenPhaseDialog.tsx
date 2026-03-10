import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, RotateCcw, Trash2, Archive } from 'lucide-react'
import { toast } from 'sonner'
import { PHASES } from './PhaseTabBar'
import type { MonthlyProcess } from '@/types/database'

interface ReopenPhaseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  process: MonthlyProcess
  targetPhaseId: number // Phase to reopen (1, 2, or 3)
  onReopened: (newStep: number) => void
}

/** What gets deleted/reset when reopening each phase */
const PHASE_IMPACTS: Record<number, { deletions: string[]; preserved: string[] }> = {
  1: {
    deletions: [
      'Toutes les allocations seront supprimees',
      'Le processus reviendra a l\'etape 1 (Import Quotas)',
    ],
    preserved: [
      'Le stock collecte est conserve (il existe physiquement)',
      'Les quotas et commandes de base sont conserves',
    ],
  },
  2: {
    deletions: [
      'Toutes les allocations seront supprimees',
      'Le processus reviendra a l\'etape 5 (Reception Stock)',
    ],
    preserved: [
      'Les commandes validees sont conservees',
      'Le stock collecte est conserve',
      'Les quotas sont conserves',
    ],
  },
  3: {
    deletions: [
      'La date de cloture sera annulee',
      'Le processus reviendra a l\'etape 8 (Revue Allocations)',
    ],
    preserved: [
      'Toutes les allocations sont conservees (mode edition)',
      'Les commandes et le stock sont conserves',
    ],
  },
}

export default function ReopenPhaseDialog({ open, onOpenChange, process, targetPhaseId, onReopened }: ReopenPhaseDialogProps) {
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')
  const targetPhase = PHASES[targetPhaseId - 1]
  const impacts = PHASE_IMPACTS[targetPhaseId]

  const reopenMut = useMutation({
    mutationFn: async () => {
      const fromStep = process.current_step
      let toStep: number

      if (targetPhaseId === 1) {
        toStep = 1
        // Delete all allocations
        const { error: delErr } = await supabase
          .from('allocations')
          .delete()
          .eq('monthly_process_id', process.id)
        if (delErr) throw delErr
        // Reset order statuses back to validated (so they can be re-allocated)
        await supabase
          .from('orders')
          .update({ status: 'validated', allocated_quantity: 0 })
          .eq('monthly_process_id', process.id)
          .in('status', ['allocated', 'partially_allocated'])
        // Reset process
        const { error: updErr } = await supabase
          .from('monthly_processes')
          .update({
            current_step: toStep,
            status: 'importing_quotas',
            phase: 'commandes',
            allocations_count: 0,
            date_cloture: null,
          })
          .eq('id', process.id)
        if (updErr) throw updErr
      } else if (targetPhaseId === 2) {
        toStep = 5
        // Delete all allocations
        const { error: delErr } = await supabase
          .from('allocations')
          .delete()
          .eq('monthly_process_id', process.id)
        if (delErr) throw delErr
        // Reset order statuses back to validated (so they can be re-allocated)
        await supabase
          .from('orders')
          .update({ status: 'validated', allocated_quantity: 0 })
          .eq('monthly_process_id', process.id)
          .in('status', ['allocated', 'partially_allocated'])
        // Reset process
        const { error: updErr } = await supabase
          .from('monthly_processes')
          .update({
            current_step: toStep,
            status: 'collecting_stock',
            phase: 'collecte',
            allocations_count: 0,
            date_cloture: null,
          })
          .eq('id', process.id)
        if (updErr) throw updErr
      } else {
        toStep = 8
        // Just reopen — keep allocations but unlock for editing
        const { error: updErr } = await supabase
          .from('monthly_processes')
          .update({
            current_step: toStep,
            status: 'reviewing_allocations',
            phase: 'allocation',
            date_cloture: null,
          })
          .eq('id', process.id)
        if (updErr) throw updErr
      }

      // Log the reopening for audit (non-blocking — table might not exist yet)
      try {
        await supabase
          .from('phase_reopenings')
          .insert({
            monthly_process_id: process.id,
            from_step: fromStep,
            to_step: toStep,
            reason: reason.trim() || null,
            impact_summary: {
              phase_reopened: targetPhaseId,
              allocations_deleted: targetPhaseId < 3,
            },
          })
      } catch {
        // Audit log failure is non-blocking
      }

      return toStep
    },
    onSuccess: (newStep) => {
      queryClient.invalidateQueries({ queryKey: ['monthly-processes', process.id] })
      queryClient.invalidateQueries({ queryKey: ['allocations', process.id] })
      queryClient.invalidateQueries({ queryKey: ['orders', process.id] })
      toast.success(`Phase ${targetPhaseId} reouverte — retour a l'etape ${newStep}`)
      setReason('')
      onOpenChange(false)
      onReopened(newStep)
    },
    onError: (err: Error) => toast.error(err.message),
  })

  if (!targetPhase || !impacts) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 bg-amber-50 dark:bg-amber-950">
              <RotateCcw className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <DialogTitle>Reouvrir Phase {targetPhaseId} — {targetPhase.label}</DialogTitle>
              <DialogDescription className="mt-1">
                Cette action renverra le processus a une etape anterieure.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Deletions */}
          <div>
            <p className="text-xs font-semibold text-destructive flex items-center gap-1.5 mb-2">
              <Trash2 className="h-3.5 w-3.5" />
              Impact de la reouverture
            </p>
            <div className="space-y-1.5">
              {impacts.deletions.map((d, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">{d}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Preserved */}
          <div>
            <p className="text-xs font-semibold text-green-600 flex items-center gap-1.5 mb-2">
              <Archive className="h-3.5 w-3.5" />
              Donnees conservees
            </p>
            <div className="space-y-1.5">
              {impacts.preserved.map((p, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <Badge variant="outline" className="h-4 w-4 p-0 flex items-center justify-center text-[9px] text-green-600 border-green-300 shrink-0 mt-0.5">
                    ✓
                  </Badge>
                  <span className="text-muted-foreground">{p}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Reason (optional) */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Raison (optionnel — pour la tracabilite)
            </label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: commande client modifiee, erreur d'import..."
              className="mt-1.5 resize-none"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            variant="destructive"
            onClick={() => reopenMut.mutate()}
            disabled={reopenMut.isPending}
            className="gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            {reopenMut.isPending ? 'Reouverture...' : `Reouvrir Phase ${targetPhaseId}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

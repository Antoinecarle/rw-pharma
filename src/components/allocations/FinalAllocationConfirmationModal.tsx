import { useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  AlertTriangle, CheckCircle, BarChart3, Truck, Users, ArrowLeft, ShieldAlert,
} from 'lucide-react'

interface WholesalerSummary {
  code: string
  name: string
  count: number
  totalQty: number
}

interface CustomerSummary {
  code: string
  name: string
  count: number
  totalQty: number
}

interface FinalAllocationConfirmationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  proposedCount: number
  totalAllocations: number
  totalRequested: number
  totalAllocated: number
  fulfillmentRate: string
  wholesalerSummary: WholesalerSummary[]
  customerSummary: CustomerSummary[]
  onConfirm: () => void
  onBack: () => void
  loading: boolean
}

const CONFIRM_TEXT = 'CONFIRMER'

export default function FinalAllocationConfirmationModal({
  open, onOpenChange, proposedCount, totalAllocations, totalRequested, totalAllocated,
  fulfillmentRate, wholesalerSummary, customerSummary, onConfirm, onBack, loading,
}: FinalAllocationConfirmationModalProps) {
  const [confirmText, setConfirmText] = useState('')
  const [checked, setChecked] = useState(false)

  const canConfirm = confirmText === CONFIRM_TEXT && checked

  const handleClose = (open: boolean) => {
    if (!open) {
      setConfirmText('')
      setChecked(false)
    }
    onOpenChange(open)
  }

  const fulfillmentNum = parseFloat(fulfillmentRate)
  const fulfillmentColor = fulfillmentNum >= 90 ? 'text-green-600' : fulfillmentNum >= 70 ? 'text-amber-600' : 'text-red-600'

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-amber-50 flex items-center justify-center">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
            </div>
            Confirmation des allocations
          </DialogTitle>
          <DialogDescription>
            Vérifiez le résumé ci-dessous avant de confirmer. Cette action est irréversible.
          </DialogDescription>
        </DialogHeader>

        {/* Warning banner */}
        <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800 dark:text-amber-200">
            <p className="font-medium">Action irréversible</p>
            <p className="text-xs mt-0.5 opacity-80">
              Une fois confirmées, les {proposedCount} allocations ne pourront plus être modifiées.
            </p>
          </div>
        </div>

        {/* KPI Summary */}
        <div className="grid grid-cols-2 gap-2">
          <Card>
            <CardContent className="p-3 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-lg font-bold">{totalAllocations}</p>
                <p className="text-[10px] text-muted-foreground">Allocations totales</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 flex items-center gap-2">
              <CheckCircle className={`h-4 w-4 ${fulfillmentColor}`} />
              <div>
                <p className={`text-lg font-bold ${fulfillmentColor}`}>{fulfillmentRate}%</p>
                <p className="text-[10px] text-muted-foreground">Taux de couverture</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Quantité demandée</span>
            <span className="font-medium tabular-nums">{totalRequested.toLocaleString('fr-FR')} unités</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Quantité allouée</span>
            <span className="font-medium tabular-nums">{totalAllocated.toLocaleString('fr-FR')} unités</span>
          </div>
        </div>

        <Separator />

        {/* Wholesaler breakdown */}
        {wholesalerSummary.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-1">
              <Truck className="h-3 w-3" /> Par grossiste
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {wholesalerSummary.map((w) => (
                <Badge key={w.code} variant="outline" className="gap-1 py-1 px-2 text-xs">
                  <span className="font-bold">{w.code}</span>
                  <span className="text-muted-foreground">{w.count} / {w.totalQty.toLocaleString('fr-FR')} u.</span>
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Customer breakdown */}
        {customerSummary.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-1">
              <Users className="h-3 w-3" /> Par client
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {customerSummary.map((c) => (
                <Badge key={c.code} variant="outline" className="gap-1 py-1 px-2 text-xs">
                  <span className="font-bold">{c.code}</span>
                  <span className="text-muted-foreground">{c.count} / {c.totalQty.toLocaleString('fr-FR')} u.</span>
                </Badge>
              ))}
            </div>
          </div>
        )}

        <Separator />

        {/* Confirmation requirement */}
        <div className="space-y-3">
          <div className="flex items-start gap-2">
            <Checkbox
              id="confirm-check"
              checked={checked}
              onCheckedChange={(c) => setChecked(c === true)}
            />
            <Label htmlFor="confirm-check" className="text-sm cursor-pointer leading-tight">
              J'ai vérifié les allocations et je confirme la répartition proposée
            </Label>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Tapez <span className="font-mono font-bold text-foreground">{CONFIRM_TEXT}</span> pour valider
            </Label>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
              placeholder={CONFIRM_TEXT}
              className="font-mono text-center tracking-widest"
              autoComplete="off"
            />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => { handleClose(false); onBack() }} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            Modifier les allocations
          </Button>
          <Button
            onClick={() => { onConfirm(); handleClose(false) }}
            disabled={!canConfirm || loading}
            className="gap-1.5"
          >
            <CheckCircle className="h-4 w-4" />
            {loading ? 'Confirmation...' : `Confirmer ${proposedCount} allocations`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

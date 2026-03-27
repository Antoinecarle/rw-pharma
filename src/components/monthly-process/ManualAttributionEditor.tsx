import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Check, X, Loader2 } from 'lucide-react'
import type { ManualAttribution } from '@/types/database'

interface ManualAttributionEditorProps {
  /** Existing active manual attribution for this cell, if any */
  existing: ManualAttribution | null
  /** Max requested quantity (from customer order) */
  maxRequested: number
  /** Max supplier quantity (wholesaler quota total) */
  maxSupplier: number
  /** Whether save is in progress */
  isSaving: boolean
  /** Save callback */
  onSave: (requestedQty: number, supplierQty: number) => void
  /** Cancel callback */
  onCancel: () => void
}

export default function ManualAttributionEditor({
  existing,
  maxRequested,
  maxSupplier,
  isSaving,
  onSave,
  onCancel,
}: ManualAttributionEditorProps) {
  const [reqQty, setReqQty] = useState(String(existing?.requested_quantity ?? maxRequested))
  const [supQty, setSupQty] = useState(String(existing?.supplier_quantity ?? 0))

  const handleSave = () => {
    const req = parseInt(reqQty, 10)
    const sup = parseInt(supQty, 10)
    if (isNaN(req) || req < 0 || isNaN(sup) || sup < 0) return
    if (req === 0 && sup === 0) return // Skip empty attributions
    onSave(req, sup)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') onCancel()
  }

  return (
    <div className="flex flex-col gap-1 p-1 min-w-[90px]">
      <div className="flex items-center gap-1">
        <Input
          type="number"
          value={reqQty}
          onChange={e => setReqQty(e.target.value)}
          onKeyDown={handleKeyDown}
          className="h-6 w-16 text-[10px] text-center"
          placeholder="Dem."
          title="Quantité demandée"
          autoFocus
          min={0}
          max={maxRequested}
        />
        <span className="text-[8px] text-muted-foreground">dem.</span>
      </div>
      <div className="flex items-center gap-1">
        <Input
          type="number"
          value={supQty}
          onChange={e => setSupQty(e.target.value)}
          onKeyDown={handleKeyDown}
          className="h-6 w-16 text-[10px] text-center"
          placeholder="Four."
          title="Quantité fournisseur"
          min={0}
          max={maxSupplier}
        />
        <span className="text-[8px] text-muted-foreground">four.</span>
      </div>
      <div className="flex items-center justify-center gap-1 mt-0.5">
        {isSaving ? (
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        ) : (
          <>
            <button type="button" onClick={handleSave} className="p-0.5 hover:text-green-600" title="Valider">
              <Check className="h-3 w-3" />
            </button>
            <button type="button" onClick={onCancel} className="p-0.5 hover:text-red-600" title="Annuler">
              <X className="h-3 w-3" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

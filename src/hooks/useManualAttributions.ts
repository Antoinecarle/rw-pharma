import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import type { ManualAttribution } from '@/types/database'

interface UpsertInput {
  productId: string
  customerId: string
  wholesalerId: string
  requestedQuantity: number
  supplierQuantity: number
  note?: string
}

export function useManualAttributions(processId: string) {
  const queryClient = useQueryClient()
  const queryKey = ['manual-attributions', processId]

  // ── Load all active manual attributions for this process ──
  const { data: manualAttrs = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('manual_attributions')
        .select('*, customer:customers(id, name, code), product:products(id, cip13, name), wholesaler:wholesalers(id, name, code)')
        .eq('monthly_process_id', processId)
        .eq('is_active', true)
        .order('edited_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as ManualAttribution[]
    },
    enabled: !!processId,
  })

  // ── Upsert via RPC (atomic: deactivate old + insert new) ──
  const upsertMutation = useMutation({
    mutationFn: async (input: UpsertInput) => {
      const { data, error } = await supabase.rpc('upsert_manual_attribution', {
        p_monthly_process_id: processId,
        p_product_id: input.productId,
        p_customer_id: input.customerId,
        p_wholesaler_id: input.wholesalerId,
        p_requested_quantity: input.requestedQuantity,
        p_supplier_quantity: input.supplierQuantity,
        p_note: input.note ?? null,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
      toast.success('Attribution manuelle enregistree')
    },
    onError: (err: Error) => toast.error(`Erreur: ${err.message}`),
  })

  // ── Deactivate (soft-delete) ──
  const deactivateMutation = useMutation({
    mutationFn: async (attrId: string) => {
      const { error } = await supabase
        .from('manual_attributions')
        .update({ is_active: false })
        .eq('id', attrId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey })
      toast.success('Attribution manuelle desactivee')
    },
    onError: (err: Error) => toast.error(`Erreur: ${err.message}`),
  })

  // ── Load full history (all versions) for a specific triplet ──
  const loadHistory = async (productId: string, customerId: string, wholesalerId: string) => {
    const { data, error } = await supabase
      .from('manual_attributions')
      .select('*, customer:customers(id, name, code), product:products(id, cip13, name), wholesaler:wholesalers(id, name, code)')
      .eq('monthly_process_id', processId)
      .eq('product_id', productId)
      .eq('customer_id', customerId)
      .eq('wholesaler_id', wholesalerId)
      .order('version', { ascending: false })
    if (error) throw error
    return (data ?? []) as ManualAttribution[]
  }

  // ── Helpers (memoized) ──

  // Get active attribution for a specific cell (product × wholesaler × customer)
  const getForCell = useMemo(() => {
    const map = new Map<string, ManualAttribution>()
    for (const attr of manualAttrs) {
      map.set(`${attr.product_id}::${attr.wholesaler_id}::${attr.customer_id}`, attr)
    }
    return (productId: string, wholesalerId: string, customerId: string) =>
      map.get(`${productId}::${wholesalerId}::${customerId}`) ?? null
  }, [manualAttrs])

  // Get all active manual attributions for a product × wholesaler (across all customers)
  const getForProductWholesaler = useMemo(() => {
    const map = new Map<string, ManualAttribution[]>()
    for (const attr of manualAttrs) {
      const key = `${attr.product_id}::${attr.wholesaler_id}`
      const list = map.get(key) ?? []
      list.push(attr)
      map.set(key, list)
    }
    return (productId: string, wholesalerId: string) =>
      map.get(`${productId}::${wholesalerId}`) ?? []
  }, [manualAttrs])

  // Total manual supplier_quantity for a product × wholesaler
  const getTotalManual = useMemo(() => {
    const map = new Map<string, number>()
    for (const attr of manualAttrs) {
      const key = `${attr.product_id}::${attr.wholesaler_id}`
      map.set(key, (map.get(key) ?? 0) + attr.supplier_quantity)
    }
    return (productId: string, wholesalerId: string) =>
      map.get(`${productId}::${wholesalerId}`) ?? 0
  }, [manualAttrs])

  // Get all active manual attributions for a wholesaler (for export)
  const getForWholesaler = useMemo(() => {
    const map = new Map<string, ManualAttribution[]>()
    for (const attr of manualAttrs) {
      const list = map.get(attr.wholesaler_id) ?? []
      list.push(attr)
      map.set(attr.wholesaler_id, list)
    }
    return (wholesalerId: string) =>
      map.get(wholesalerId) ?? []
  }, [manualAttrs])

  return {
    manualAttrs,
    isLoading,
    upsert: upsertMutation.mutate,
    upsertAsync: upsertMutation.mutateAsync,
    isUpserting: upsertMutation.isPending,
    deactivate: deactivateMutation.mutate,
    isDeactivating: deactivateMutation.isPending,
    loadHistory,
    getForCell,
    getForProductWholesaler,
    getTotalManual,
    getForWholesaler,
  }
}

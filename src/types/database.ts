export interface Database {
  public: {
    Tables: {
      products: {
        Row: Product
        Insert: ProductInsert
        Update: ProductUpdate
      }
      wholesalers: {
        Row: Wholesaler
        Insert: WholesalerInsert
        Update: WholesalerUpdate
      }
      wholesaler_quotas: {
        Row: WholesalerQuota
        Insert: WholesalerQuotaInsert
        Update: WholesalerQuotaUpdate
      }
      customers: {
        Row: Customer
        Insert: CustomerInsert
        Update: CustomerUpdate
      }
    }
  }
}

export interface Product {
  id: string
  cip13: string
  cip7: string | null
  name: string
  eunb: string | null
  pfht: number | null
  laboratory: string | null
  is_ansm_blocked: boolean
  is_demo_generated: boolean
  categorie: string | null
  expiry_dates: string[] | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type ProductInsert = Omit<Product, 'id' | 'created_at' | 'updated_at'>
export type ProductUpdate = Partial<ProductInsert>

export interface Wholesaler {
  id: string
  name: string
  code: string | null
  type: string | null
  contact_email: string | null
  drive_folder_url: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type WholesalerInsert = Omit<Wholesaler, 'id' | 'created_at' | 'updated_at'>
export type WholesalerUpdate = Partial<WholesalerInsert>

export interface WholesalerQuota {
  id: string
  wholesaler_id: string
  product_id: string
  monthly_process_id: string | null
  month: string
  quota_quantity: number
  extra_available: number
  quota_used: number
  import_file_name: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export type WholesalerQuotaInsert = Omit<WholesalerQuota, 'id' | 'created_at'>
export type WholesalerQuotaUpdate = Partial<WholesalerQuotaInsert>

export interface Customer {
  id: string
  name: string
  code: string | null
  country: string | null
  contact_email: string | null
  is_top_client: boolean
  min_lot_acceptable: number | null
  allocation_preferences: Record<string, unknown>
  documents: Record<string, unknown> | null
  excel_column_mapping: Record<string, unknown>
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type CustomerInsert = Omit<Customer, 'id' | 'created_at' | 'updated_at'>
export type CustomerUpdate = Partial<CustomerInsert>

export type MonthlyProcessStatus = 'draft' | 'importing_quotas' | 'importing_orders' | 'reviewing_orders' | 'exporting_wholesalers' | 'attente_stock' | 'collecting_stock' | 'aggregating_stock' | 'allocating_lots' | 'reviewing_allocations' | 'finalizing' | 'completed'

export type MonthlyProcessPhase = 'commandes' | 'attente_stock' | 'collecte' | 'allocation' | 'cloture'

export interface MonthlyProcess {
  id: string
  month: number
  year: number
  status: MonthlyProcessStatus
  phase: MonthlyProcessPhase
  current_step: number
  quotas_count: number
  orders_count: number
  allocations_count: number
  date_ouverture: string | null
  date_cloture: string | null
  notes: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type MonthlyProcessInsert = Omit<MonthlyProcess, 'id' | 'created_at' | 'updated_at' | 'orders_count' | 'allocations_count'>
export type MonthlyProcessUpdate = Partial<MonthlyProcessInsert>

export type OrderStatus = 'pending' | 'validated' | 'partially_allocated' | 'allocated' | 'rejected'

export interface Order {
  id: string
  monthly_process_id: string
  customer_id: string
  product_id: string
  quantity: number
  unit_price: number | null
  allocated_quantity: number
  status: OrderStatus
  comment: string | null
  data_source: string
  metadata: Record<string, unknown>
  created_at: string
  // Joined fields
  customer?: Customer
  product?: Product
}

export type OrderInsert = Omit<Order, 'id' | 'created_at' | 'customer' | 'product'>
export type OrderUpdate = Partial<OrderInsert>

export type AllocationStatus = 'proposed' | 'confirmed' | 'rejected'

export interface Allocation {
  id: string
  monthly_process_id: string
  order_id: string | null
  customer_id: string
  product_id: string
  wholesaler_id: string
  stock_id: string | null
  requested_quantity: number
  allocated_quantity: number
  client_sold_quantity: number
  prix_applique: number | null
  refusal_reason: string | null
  status: AllocationStatus
  confirmation_status: 'pending' | 'confirmed' | 'refused'
  confirmation_note: string | null
  confirmed_at: string | null
  debt_resolution_id: string | null
  metadata: Record<string, unknown>
  created_at: string
  // Joined fields
  customer?: Customer
  product?: Product
  wholesaler?: Wholesaler
}

export type AllocationInsert = Omit<Allocation, 'id' | 'created_at' | 'customer' | 'product' | 'wholesaler'>
export type AllocationUpdate = Partial<AllocationInsert>

// ── Client Debts ─────────────────────────────────────────────────

export type ClientDebtStatus = 'pending' | 'partially_resolved' | 'resolved'

export interface ClientDebt {
  id: string
  customer_id: string
  product_id: string
  monthly_process_id: string | null
  month: string
  quantity_requested: number
  quantity_allocated: number
  quantity_owed: number
  resolved_quantity: number
  status: ClientDebtStatus
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  // Joined
  customer?: Customer
  product?: Product
}

export type ClientDebtInsert = Omit<ClientDebt, 'id' | 'created_at' | 'updated_at' | 'customer' | 'product'>
export type ClientDebtUpdate = Partial<ClientDebtInsert>

// ── Lots ─────────────────────────────────────────────────────────

export interface Lot {
  id: string
  product_id: string | null
  cip13: string
  lot_number: string
  expiry_date: string
  manufacture_date: string | null
  origin: string | null
  monthly_process_id: string | null
  metadata: Record<string, unknown>
  created_at: string
  // Joined
  product?: Product
}

export type LotInsert = Omit<Lot, 'id' | 'created_at' | 'product'>
export type LotUpdate = Partial<LotInsert>

// ── Collected Stock ──────────────────────────────────────────────

export interface CollectedStock {
  id: string
  monthly_order_id: string | null
  monthly_process_id: string | null
  wholesaler_id: string
  product_id: string | null
  cip13: string
  lot_id: string | null
  lot_number: string
  expiry_date: string
  fabrication_date: string | null
  quantity: number
  unit_cost: number | null
  date_reception: string | null
  import_file_id: string | null
  import_file_name: string | null
  data_source: string
  status: string
  metadata: Record<string, unknown>
  created_at: string
  // Joined
  wholesaler?: Wholesaler
  product?: Product
  lot?: Lot
}

// ── ANSM ──────────────────────────────────────────────────────────

export interface AnsmBlockedProduct {
  id: string
  cip13: string
  product_name: string | null
  blocked_date: string
  source_url: string | null
  created_at: string
}

export type AnsmSyncStatus = 'running' | 'success' | 'failed'

export interface AnsmSyncLog {
  id: string
  started_at: string
  finished_at: string | null
  status: AnsmSyncStatus
  message: string | null
  products_blocked: number
  products_unblocked: number
  total_ansm_count: number
  created_at: string
}

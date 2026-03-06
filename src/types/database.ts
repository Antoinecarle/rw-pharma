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
  month: string
  quota_quantity: number
  extra_available: number
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
  allocation_preferences: Record<string, unknown>
  documents: Record<string, unknown> | null
  excel_column_mapping: Record<string, unknown>
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type CustomerInsert = Omit<Customer, 'id' | 'created_at' | 'updated_at'>
export type CustomerUpdate = Partial<CustomerInsert>

export type MonthlyProcessStatus = 'draft' | 'importing' | 'reviewing_orders' | 'allocating' | 'reviewing_allocations' | 'finalizing' | 'completed'

export interface MonthlyProcess {
  id: string
  month: number
  year: number
  status: MonthlyProcessStatus
  current_step: number
  orders_count: number
  allocations_count: number
  notes: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type MonthlyProcessInsert = Omit<MonthlyProcess, 'id' | 'created_at' | 'updated_at' | 'orders_count' | 'allocations_count'>
export type MonthlyProcessUpdate = Partial<MonthlyProcessInsert>

export type OrderStatus = 'pending' | 'validated' | 'allocated' | 'rejected'

export interface Order {
  id: string
  monthly_process_id: string
  customer_id: string
  product_id: string
  quantity: number
  unit_price: number | null
  status: OrderStatus
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
  requested_quantity: number
  allocated_quantity: number
  status: AllocationStatus
  metadata: Record<string, unknown>
  created_at: string
  // Joined fields
  customer?: Customer
  product?: Product
  wholesaler?: Wholesaler
}

export type AllocationInsert = Omit<Allocation, 'id' | 'created_at' | 'customer' | 'product' | 'wholesaler'>
export type AllocationUpdate = Partial<AllocationInsert>

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

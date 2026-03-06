import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Customer, CustomerInsert } from '@/types/database'
import { motion, AnimatePresence } from 'framer-motion'
import type { Variants } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import StarRating from '@/components/ui/star-rating'
import GradientSlider from '@/components/ui/gradient-slider'
import StepperInput from '@/components/ui/stepper-input'
import { Plus, Pencil, Trash2, Star, FileText, Users, Globe, Mail, UserPlus, AlertTriangle, CheckCircle2, Send, Copy, Link2, Clock, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import ConfirmDialog from '@/components/ConfirmDialog'
import { useAuth } from '@/hooks/useAuth'

const COUNTRIES = [
  { code: 'DE', name: 'Allemagne' },
  { code: 'DK', name: 'Danemark' },
  { code: 'SE', name: 'Suede' },
  { code: 'NO', name: 'Norvege' },
  { code: 'NL', name: 'Pays-Bas' },
  { code: 'BE', name: 'Belgique' },
]

const FLAG_EMOJI: Record<string, string> = {
  DE: '\u{1F1E9}\u{1F1EA}', DK: '\u{1F1E9}\u{1F1F0}', SE: '\u{1F1F8}\u{1F1EA}',
  NO: '\u{1F1F3}\u{1F1F4}', NL: '\u{1F1F3}\u{1F1F1}', BE: '\u{1F1E7}\u{1F1EA}',
}

interface CustomerDocuments { wda_number?: string; wda_expiry?: string; gdp_number?: string; gdp_expiry?: string; notes?: string }
interface AllocationPrefs { priority_level?: number; max_allocation_pct?: number; preferred_expiry_months?: number; notes?: string }

const emptyCustomer: CustomerInsert = {
  name: '', code: null, country: null, contact_email: null, is_top_client: false,
  allocation_preferences: {}, documents: null, excel_column_mapping: {}, metadata: {},
}

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

function ExpiryCountdown({ date }: { date: string; label: string }) {
  const days = daysUntil(date)
  const cls = days < 0 ? 'border-red-200 bg-red-50 text-red-600' : days <= 90 ? 'border-amber-200 bg-amber-50 text-amber-600' : 'border-emerald-200 bg-emerald-50 text-emerald-600'
  const Icon = days < 0 || (days >= 0 && days <= 90) ? AlertTriangle : CheckCircle2
  return (
    <div className="flex items-center gap-2">
      <Input type="date" value={date} readOnly className="flex-1 text-[13px] h-10 rounded-xl" />
      <Badge variant="outline" className={`shrink-0 text-[10px] h-5 px-1.5 font-medium rounded-full ${cls}`}>
        <Icon className="h-2.5 w-2.5 mr-0.5" />{days < 0 ? 'Expire' : `${days}j`}
      </Badge>
    </div>
  )
}

function CardSkeleton() {
  return (
    <div className="ivory-glass p-5">
      <div className="flex items-start gap-3.5">
        <Skeleton className="h-12 w-12 rounded-2xl shrink-0" />
        <div className="flex-1 space-y-2.5">
          <Skeleton className="h-4 w-28 rounded-md" />
          <Skeleton className="h-3.5 w-20 rounded-md" />
          <Skeleton className="h-3.5 w-36 rounded-md" />
        </div>
      </div>
    </div>
  )
}

export default function CustomersPage() {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [form, setForm] = useState<CustomerInsert>(emptyCustomer)
  const [docs, setDocs] = useState<CustomerDocuments>({})
  const [prefs, setPrefs] = useState<AllocationPrefs>({})
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const { user } = useAuth()

  const { data: customers, isLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('customers').select('*').order('is_top_client', { ascending: false }).order('name')
      if (error) throw error
      return data as Customer[]
    },
  })

  // Fetch portal users for all customers
  const { data: portalUsers } = useQuery({
    queryKey: ['customer-portal-users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_users')
        .select('id, customer_id, role, created_at, auth_user_id')
      if (error) throw error
      // Fetch emails from auth user ids
      const userIds = (data ?? []).map((u: any) => u.auth_user_id)
      if (userIds.length === 0) return []
      // We can't query auth.users directly, so we'll use the invitation email or show the ID
      return data ?? []
    },
  })

  // Fetch invitations
  const { data: invitations, refetch: refetchInvitations } = useQuery({
    queryKey: ['customer-invitations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_invitations')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })

  const getCustomerInvitations = (customerId: string) =>
    (invitations ?? []).filter((i: any) => i.customer_id === customerId)

  const getCustomerPortalUsers = (customerId: string) =>
    (portalUsers ?? []).filter((u: any) => u.customer_id === customerId)

  const getPortalAccessCount = (customerId: string) => {
    const users = getCustomerPortalUsers(customerId).length
    const pending = getCustomerInvitations(customerId).filter((i: any) => i.status === 'pending').length
    return { users, pending }
  }

  const handleInvite = async (customerId: string) => {
    if (!inviteEmail.trim()) return
    setInviting(true)
    try {
      const token = crypto.randomUUID().replace(/-/g, '').slice(0, 32)
      const { error } = await supabase.from('customer_invitations').insert({
        customer_id: customerId,
        email: inviteEmail.trim(),
        token,
        invited_by: user?.id,
      })
      if (error) throw error
      const link = `${window.location.origin}/invite/${token}`
      await navigator.clipboard.writeText(link)
      toast.success('Invitation creee ! Lien copie dans le presse-papier.')
      setInviteEmail('')
      refetchInvitations()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setInviting(false)
    }
  }

  const copyInviteLink = (token: string) => {
    const link = `${window.location.origin}/invite/${token}`
    navigator.clipboard.writeText(link)
    toast.success('Lien copie !')
  }

  const upsert = useMutation({
    mutationFn: async (c: CustomerInsert & { id?: string }) => {
      const payload = { ...c, documents: docs, allocation_preferences: prefs }
      if (c.id) { const { id, ...rest } = payload; const { error } = await supabase.from('customers').update(rest).eq('id', id); if (error) throw error }
      else { const { error } = await supabase.from('customers').insert(payload); if (error) throw error }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['customers'] }); setDialogOpen(false); toast.success(editing ? 'Client modifie' : 'Client cree') },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteMut = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('customers').delete().eq('id', id); if (error) throw error },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['customers'] }); toast.success('Client supprime') },
    onError: (err: Error) => toast.error(err.message),
  })

  const openCreate = () => { setEditing(null); setForm(emptyCustomer); setDocs({}); setPrefs({}); setDialogOpen(true) }

  const openEdit = (c: Customer) => {
    setEditing(c)
    setForm({ name: c.name, code: c.code, country: c.country, contact_email: c.contact_email, is_top_client: c.is_top_client, allocation_preferences: c.allocation_preferences, documents: c.documents, excel_column_mapping: c.excel_column_mapping, metadata: c.metadata })
    setDocs((c.documents as CustomerDocuments) ?? (c.metadata as Record<string, unknown>)?.documents as CustomerDocuments ?? {})
    setPrefs((c.allocation_preferences as AllocationPrefs) ?? {})
    setDialogOpen(true)
  }

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); upsert.mutate(editing ? { ...form, id: editing.id } : form) }
  const countryName = (code: string | null) => COUNTRIES.find(c => c.code === code)?.name ?? code ?? '-'
  const hasDocuments = (c: Customer) => { const d = (c.documents as CustomerDocuments | null) ?? (c.metadata as Record<string, unknown>)?.documents as CustomerDocuments | undefined; return !!(d && (d.wda_number || d.gdp_number)) }
  const getPrefs = (c: Customer): AllocationPrefs => (c.allocation_preferences as AllocationPrefs) ?? {}

  // Group by country
  const topClients = customers?.filter(c => c.is_top_client) ?? []
  const regularClients = customers?.filter(c => !c.is_top_client) ?? []

  return (
    <div className="p-5 md:p-7 lg:p-8 space-y-6 max-w-[1200px] mx-auto ivory-page-glow">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative z-10"
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="h-11 w-11 rounded-2xl flex items-center justify-center shadow-sm"
              style={{ background: 'linear-gradient(135deg, rgba(13,148,136,0.12), rgba(13,148,136,0.04))' }}>
              <Users className="h-5 w-5" style={{ color: 'var(--ivory-accent)' }} />
            </div>
            <div>
              <h2 className="ivory-heading text-xl md:text-2xl">Clients importateurs</h2>
              <p className="text-[12px] mt-0.5" style={{ color: 'var(--ivory-text-muted)' }}>
                {customers?.length ?? 0} clients europeens
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={openCreate}
            className="gap-1.5 text-[13px] h-9 rounded-xl shadow-sm"
            style={{ background: 'linear-gradient(180deg, var(--ivory-accent), var(--ivory-accent-hover))', color: 'white' }}
          >
            <Plus className="h-3.5 w-3.5" />
            Ajouter
          </Button>
        </div>
      </motion.div>

      {/* Summary stats */}
      {customers && customers.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="flex gap-3 flex-wrap relative z-10"
        >
          <div className="ivory-stat-pill">
            <Users className="h-3.5 w-3.5" style={{ color: 'var(--ivory-accent)' }} />
            <span className="text-[12px]" style={{ color: 'var(--ivory-text-body)' }}>
              <span className="font-bold tabular-nums">{customers.length}</span> clients
            </span>
          </div>
          {topClients.length > 0 && (
            <div className="ivory-stat-pill">
              <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
              <span className="text-[12px]" style={{ color: 'var(--ivory-text-body)' }}>
                <span className="font-bold tabular-nums">{topClients.length}</span> prioritaires
              </span>
            </div>
          )}
          {(() => {
            const countries = new Set(customers.map(c => c.country).filter(Boolean))
            return (
              <div className="ivory-stat-pill">
                <Globe className="h-3.5 w-3.5" style={{ color: 'var(--ivory-teal)' }} />
                <span className="text-[12px]" style={{ color: 'var(--ivory-text-body)' }}>
                  <span className="font-bold tabular-nums">{countries.size}</span> pays
                </span>
              </div>
            )
          })()}
        </motion.div>
      )}

      {/* Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : !customers?.length ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="ivory-glass p-0 overflow-hidden"
        >
          <div className="flex flex-col items-center py-20 gap-3">
            <div className="h-16 w-16 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(13,148,136,0.06)' }}>
              <UserPlus className="h-7 w-7" style={{ color: 'var(--ivory-text-muted)' }} />
            </div>
            <p className="ivory-heading text-[14px]">Aucun client</p>
            <p className="text-[12px]" style={{ color: 'var(--ivory-text-muted)' }}>Ajoutez vos clients importateurs europeens</p>
            <Button
              size="sm"
              onClick={openCreate}
              className="mt-2 gap-1.5 text-[12px] h-8 rounded-xl"
              style={{ background: 'var(--ivory-accent)', color: 'white' }}
            >
              <Plus className="h-3 w-3" />
              Ajouter
            </Button>
          </div>
        </motion.div>
      ) : (
        <div className="space-y-5 relative z-10">
          {/* Priority clients section */}
          {topClients.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--ivory-text-muted)' }}>
                  Clients prioritaires
                </span>
                <div className="flex-1 h-px" style={{ background: 'rgba(0,0,0,0.04)' }} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <AnimatePresence mode="popLayout">
                  {topClients.map((c, i) => (
                    <CustomerCard key={c.id} customer={c} index={i} onEdit={openEdit} onDelete={setDeleteId}
                      countryName={countryName} hasDocuments={hasDocuments} getPrefs={getPrefs} portalAccess={getPortalAccessCount(c.id)} isPriority />
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}

          {/* Regular clients */}
          {regularClients.length > 0 && (
            <div>
              {topClients.length > 0 && (
                <div className="flex items-center gap-2 mb-3">
                  <Users className="h-3.5 w-3.5" style={{ color: 'var(--ivory-text-muted)' }} />
                  <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--ivory-text-muted)' }}>
                    Autres clients
                  </span>
                  <div className="flex-1 h-px" style={{ background: 'rgba(0,0,0,0.04)' }} />
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <AnimatePresence mode="popLayout">
                  {regularClients.map((c, i) => (
                    <CustomerCard key={c.id} customer={c} index={i + topClients.length} onEdit={openEdit} onDelete={setDeleteId}
                      countryName={countryName} hasDocuments={hasDocuments} getPrefs={getPrefs} portalAccess={getPortalAccessCount(c.id)} />
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl" style={{ border: '1px solid rgba(0,0,0,0.06)' }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 ivory-heading text-base">
              <div className="h-8 w-8 rounded-xl flex items-center justify-center"
                style={{ background: 'rgba(13,148,136,0.08)' }}>
                <Users className="h-4 w-4" style={{ color: 'var(--ivory-accent)' }} />
              </div>
              {editing ? 'Modifier le client' : 'Nouveau client'}
            </DialogTitle>
            <DialogDescription className="text-[13px]">{editing ? 'Modifiez les informations' : 'Ajoutez un nouveau client'}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <Tabs defaultValue="general" className="space-y-4">
              <TabsList className="w-full grid grid-cols-4 h-9 rounded-xl">
                <TabsTrigger value="general" className="text-[12px] rounded-lg">General</TabsTrigger>
                <TabsTrigger value="documents" className="text-[12px] rounded-lg">Documents</TabsTrigger>
                <TabsTrigger value="preferences" className="text-[12px] rounded-lg">Preferences</TabsTrigger>
                {editing && <TabsTrigger value="access" className="text-[12px] rounded-lg">Acces</TabsTrigger>}
              </TabsList>
              <TabsContent value="general" className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label className="text-[13px] font-medium">Nom *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Orifarm" required className="text-[13px] h-10 rounded-xl" /></div>
                  <div className="space-y-1.5"><Label className="text-[13px] font-medium">Code</Label><Input value={form.code ?? ''} onChange={(e) => setForm({ ...form, code: e.target.value || null })} placeholder="ORI" className="ivory-mono uppercase text-[13px] h-10 rounded-xl" /></div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] font-medium">Pays</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {COUNTRIES.map((country) => (
                      <button key={country.code} type="button" onClick={() => setForm({ ...form, country: form.country === country.code ? null : country.code })}
                        className="relative flex items-center gap-2 px-3 py-2.5 rounded-xl text-[12px] transition-all"
                        style={{
                          border: form.country === country.code ? '1.5px solid var(--ivory-accent)' : '1px solid rgba(0,0,0,0.06)',
                          background: form.country === country.code ? 'rgba(13,148,136,0.06)' : 'white',
                          boxShadow: form.country === country.code ? '0 0 0 4px rgba(13,148,136,0.06)' : 'none',
                        }}>
                        <span className="text-base">{FLAG_EMOJI[country.code]}</span>
                        <div className="text-left">
                          <div className="font-medium text-[11px]" style={{ color: 'var(--ivory-text-heading)' }}>{country.name}</div>
                          <div className="text-[9px]" style={{ color: 'var(--ivory-text-muted)' }}>{country.code}</div>
                        </div>
                        {form.country === country.code && <CheckCircle2 className="absolute top-1 right-1 h-3.5 w-3.5" style={{ color: 'var(--ivory-accent)' }} />}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5"><Label className="text-[13px] font-medium">Email</Label><Input type="email" value={form.contact_email ?? ''} onChange={(e) => setForm({ ...form, contact_email: e.target.value || null })} className="text-[13px] h-10 rounded-xl" /></div>
                <div className="flex items-center justify-between rounded-xl p-3.5"
                  style={{ border: '1px solid rgba(0,0,0,0.06)', background: 'rgba(248,247,244,0.5)' }}>
                  <div className="space-y-0.5">
                    <Label htmlFor="top-client-switch" className="cursor-pointer flex items-center gap-1.5 text-[13px] font-medium">
                      <Star className="h-3.5 w-3.5 text-amber-500" />Client prioritaire
                    </Label>
                    <p className="text-[11px]" style={{ color: 'var(--ivory-text-muted)' }}>Favorise lors des allocations</p>
                  </div>
                  <Switch id="top-client-switch" checked={form.is_top_client} onCheckedChange={(checked) => setForm({ ...form, is_top_client: checked })} />
                </div>
              </TabsContent>
              <TabsContent value="documents" className="space-y-4">
                <div className="rounded-xl p-3.5" style={{ border: '1px dashed rgba(0,0,0,0.08)', background: 'rgba(248,247,244,0.5)' }}>
                  <p className="text-[12px] flex items-center gap-1.5" style={{ color: 'var(--ivory-text-muted)' }}>
                    <FileText className="h-3.5 w-3.5" />Documents reglementaires
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label className="text-[13px] font-medium">Numero WDA</Label><Input value={docs.wda_number ?? ''} onChange={(e) => setDocs({ ...docs, wda_number: e.target.value || undefined })} placeholder="WDA-XXXX" className="ivory-mono text-[13px] h-10 rounded-xl" /></div>
                  <div className="space-y-1.5"><Label className="text-[13px] font-medium">Expiration WDA</Label>
                    {docs.wda_expiry ? <div className="space-y-1"><ExpiryCountdown date={docs.wda_expiry} label="WDA" /><button type="button" onClick={() => setDocs({ ...docs, wda_expiry: undefined })} className="text-[10px] hover:text-red-500 transition-colors" style={{ color: 'var(--ivory-text-muted)' }}>Effacer</button></div> : <Input type="date" value="" onChange={(e) => setDocs({ ...docs, wda_expiry: e.target.value || undefined })} className="text-[13px] h-10 rounded-xl" />}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label className="text-[13px] font-medium">Numero GDP</Label><Input value={docs.gdp_number ?? ''} onChange={(e) => setDocs({ ...docs, gdp_number: e.target.value || undefined })} placeholder="GDP-XXXX" className="ivory-mono text-[13px] h-10 rounded-xl" /></div>
                  <div className="space-y-1.5"><Label className="text-[13px] font-medium">Expiration GDP</Label>
                    {docs.gdp_expiry ? <div className="space-y-1"><ExpiryCountdown date={docs.gdp_expiry} label="GDP" /><button type="button" onClick={() => setDocs({ ...docs, gdp_expiry: undefined })} className="text-[10px] hover:text-red-500 transition-colors" style={{ color: 'var(--ivory-text-muted)' }}>Effacer</button></div> : <Input type="date" value="" onChange={(e) => setDocs({ ...docs, gdp_expiry: e.target.value || undefined })} className="text-[13px] h-10 rounded-xl" />}
                  </div>
                </div>
                <div className="space-y-1.5"><Label className="text-[13px] font-medium">Notes</Label><Textarea value={docs.notes ?? ''} onChange={(e) => setDocs({ ...docs, notes: e.target.value || undefined })} placeholder="Notes..." rows={2} className="text-[13px] rounded-xl" /></div>
              </TabsContent>
              <TabsContent value="preferences" className="space-y-4">
                <div className="rounded-xl p-3.5" style={{ border: '1px dashed rgba(0,0,0,0.08)', background: 'rgba(248,247,244,0.5)' }}>
                  <p className="text-[12px] flex items-center gap-1.5" style={{ color: 'var(--ivory-text-muted)' }}>
                    <Star className="h-3.5 w-3.5" />Preferences d'allocation
                  </p>
                </div>
                <div className="space-y-1.5"><Label className="text-[13px] font-medium">Priorite</Label><StarRating value={prefs.priority_level ?? 3} onChange={(v) => setPrefs({ ...prefs, priority_level: v })} labels={['Haute', 'Elevee', 'Normal', 'Basse', 'Tres basse']} /></div>
                <div className="space-y-1.5"><Label className="text-[13px] font-medium">% max stock</Label><GradientSlider value={prefs.max_allocation_pct ?? 30} onChange={(v) => setPrefs({ ...prefs, max_allocation_pct: v })} min={0} max={100} step={5} suffix="%" zones={[{ label: 'Conservateur', max: 20 }, { label: 'Modere', max: 50 }, { label: 'Agressif', max: 100 }]} /></div>
                <div className="space-y-1.5"><Label className="text-[13px] font-medium">Expiry min</Label><StepperInput value={prefs.preferred_expiry_months} onChange={(v) => setPrefs({ ...prefs, preferred_expiry_months: v })} min={0} max={36} suffix=" mois" placeholder="Non defini" presets={[{ label: '3', value: 3 }, { label: '6', value: 6 }, { label: '9', value: 9 }, { label: '12', value: 12 }]} /></div>
                <div className="space-y-1.5"><Label className="text-[13px] font-medium">Notes</Label><Textarea value={prefs.notes ?? ''} onChange={(e) => setPrefs({ ...prefs, notes: e.target.value || undefined })} placeholder="Notes..." rows={2} className="text-[13px] rounded-xl" /></div>
              </TabsContent>

              {/* Onglet Acces portail */}
              {editing && (
                <TabsContent value="access" className="space-y-4">
                  <div className="rounded-xl p-3.5" style={{ border: '1px dashed rgba(0,0,0,0.08)', background: 'rgba(248,247,244,0.5)' }}>
                    <p className="text-[12px] flex items-center gap-1.5" style={{ color: 'var(--ivory-text-muted)' }}>
                      <UserPlus className="h-3.5 w-3.5" />
                      Invitez des contacts pour acceder au portail client
                    </p>
                  </div>

                  {/* Invite form */}
                  <div className="flex items-end gap-2">
                    <div className="flex-1 space-y-1.5">
                      <Label className="text-[13px] font-medium">Email du contact</Label>
                      <Input
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="contact@client.com"
                        className="text-[13px] h-10 rounded-xl"
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      className="h-10 gap-1.5 text-[12px] rounded-xl shrink-0"
                      style={{ background: 'var(--ivory-accent)', color: 'white' }}
                      disabled={!inviteEmail.trim() || inviting}
                      onClick={() => handleInvite(editing.id)}
                    >
                      {inviting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                      Inviter
                    </Button>
                  </div>

                  {/* Active portal users */}
                  {getCustomerPortalUsers(editing.id).length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-widest flex items-center gap-1.5" style={{ color: 'var(--ivory-text-muted)' }}>
                        <CheckCircle2 className="h-3 w-3" style={{ color: 'var(--ivory-accent)' }} />
                        Comptes actifs
                      </p>
                      {getCustomerPortalUsers(editing.id).map((u: any) => {
                        const matchingInvite = (invitations ?? []).find((i: any) => i.customer_id === editing.id && i.status === 'accepted')
                        return (
                          <div key={u.id} className="flex items-center gap-2 px-3 py-2 rounded-xl text-[12px]" style={{ background: 'rgba(34,197,94,0.04)', border: '1px solid rgba(34,197,94,0.1)' }}>
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                            <span className="flex-1 truncate" style={{ color: 'var(--ivory-text-heading)' }}>
                              {matchingInvite?.email ?? `User ${u.auth_user_id.slice(0, 8)}...`}
                            </span>
                            <Badge variant="outline" className="text-[10px]">{u.role}</Badge>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Invitations */}
                  {getCustomerInvitations(editing.id).length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-widest flex items-center gap-1.5" style={{ color: 'var(--ivory-text-muted)' }}>
                        <Clock className="h-3 w-3" />
                        Invitations
                      </p>
                      {getCustomerInvitations(editing.id).map((inv: any) => (
                        <div key={inv.id} className="flex items-center gap-2 px-3 py-2 rounded-xl text-[12px]"
                          style={{
                            background: inv.status === 'accepted' ? 'rgba(34,197,94,0.04)' : 'rgba(234,179,8,0.04)',
                            border: `1px solid ${inv.status === 'accepted' ? 'rgba(34,197,94,0.1)' : 'rgba(234,179,8,0.1)'}`,
                          }}>
                          {inv.status === 'accepted'
                            ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                            : <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                          <span className="flex-1 truncate" style={{ color: 'var(--ivory-text-heading)' }}>{inv.email}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {inv.status === 'pending' ? 'En attente' : inv.status === 'accepted' ? 'Acceptee' : 'Expiree'}
                          </Badge>
                          {inv.status === 'pending' && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => copyInviteLink(inv.token)}>
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Copier le lien</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {getCustomerPortalUsers(editing.id).length === 0 && getCustomerInvitations(editing.id).length === 0 && (
                    <div className="flex flex-col items-center py-8 text-center">
                      <Link2 className="h-8 w-8 mb-2" style={{ color: 'var(--ivory-text-muted)', opacity: 0.3 }} />
                      <p className="text-[12px]" style={{ color: 'var(--ivory-text-muted)' }}>
                        Aucun acces portail configure pour ce client.
                      </p>
                    </div>
                  )}
                </TabsContent>
              )}
            </Tabs>
            <DialogFooter className="mt-5">
              <Button type="button" variant="outline" size="sm" onClick={() => setDialogOpen(false)} className="text-[13px] rounded-xl">Annuler</Button>
              <Button type="submit" size="sm" disabled={upsert.isPending} className="text-[13px] rounded-xl" style={{ background: 'var(--ivory-accent)', color: 'white' }}>
                {upsert.isPending ? 'Enregistrement...' : editing ? 'Modifier' : 'Creer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)} title="Supprimer le client" description="Action irreversible." onConfirm={() => deleteId && deleteMut.mutate(deleteId)} loading={deleteMut.isPending} />
    </div>
  )
}

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { delay: i * 0.06, duration: 0.4, ease: [0.2, 0.9, 0.2, 1] },
  }),
}

/* Customer Card Component */
function CustomerCard({
  customer: c, index: i, onEdit, onDelete, countryName, hasDocuments, getPrefs, portalAccess, isPriority
}: {
  customer: Customer; index: number;
  onEdit: (c: Customer) => void; onDelete: (id: string) => void;
  countryName: (code: string | null) => string;
  hasDocuments: (c: Customer) => boolean | undefined;
  getPrefs: (c: Customer) => AllocationPrefs;
  portalAccess: { users: number; pending: number };
  isPriority?: boolean;
}) {
  return (
    <motion.div
      custom={i}
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      exit={{ opacity: 0, scale: 0.97 }}
      layout
    >
      <div className="ivory-glass group cursor-default overflow-hidden"
        style={isPriority ? { boxShadow: 'var(--ivory-shadow-md), 0 0 0 1px rgba(245,158,11,0.12)' } : {}}>
        <div className="p-5">
          <div className="flex items-start gap-3.5">
            {/* Avatar */}
            <div className="h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 text-lg shadow-sm"
              style={{ background: 'linear-gradient(135deg, rgba(13,148,136,0.08), rgba(13,148,136,0.04))' }}>
              {c.country && FLAG_EMOJI[c.country]
                ? <span className="text-xl">{FLAG_EMOJI[c.country]}</span>
                : <Globe className="h-5 w-5" style={{ color: 'var(--ivory-accent)' }} />}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-[14px] truncate" style={{ color: 'var(--ivory-text-heading)' }}>{c.name}</h3>
                {c.is_top_client && (
                  <Tooltip>
                    <TooltipTrigger>
                      <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500 shrink-0" />
                    </TooltipTrigger>
                    <TooltipContent>Prioritaire</TooltipContent>
                  </Tooltip>
                )}
              </div>

              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                {c.code && (
                  <span className="ivory-mono text-[10px] font-semibold px-2 py-0.5 rounded-md"
                    style={{ background: 'rgba(13,148,136,0.06)', color: 'var(--ivory-accent)' }}>
                    {c.code}
                  </span>
                )}
                {c.country && (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-md"
                    style={{ background: 'rgba(0,0,0,0.03)', color: 'var(--ivory-text-muted)' }}>
                    {countryName(c.country)}
                  </span>
                )}
                {getPrefs(c).priority_level && (
                  <div className="flex items-center gap-px">
                    {Array.from({ length: getPrefs(c).priority_level! }, (_, j) => (
                      <Star key={j} className="h-2.5 w-2.5 text-amber-400 fill-amber-400" />
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-3 space-y-1.5">
                {c.contact_email && (
                  <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--ivory-text-muted)' }}>
                    <Mail className="h-3 w-3 shrink-0" />
                    <span className="truncate">{c.contact_email}</span>
                  </div>
                )}
                {hasDocuments(c) && (
                  <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--ivory-teal)' }}>
                    <FileText className="h-3 w-3 shrink-0" />
                    <span>Documents conformite</span>
                  </div>
                )}
                {(portalAccess.users > 0 || portalAccess.pending > 0) && (
                  <div className="flex items-center gap-2 text-[12px]">
                    <Link2 className="h-3 w-3 shrink-0" style={{ color: 'var(--ivory-accent)' }} />
                    <span style={{ color: 'var(--ivory-text-muted)' }}>
                      {portalAccess.users > 0 && <span className="font-medium" style={{ color: 'var(--ivory-accent)' }}>{portalAccess.users} acces</span>}
                      {portalAccess.users > 0 && portalAccess.pending > 0 && ' + '}
                      {portalAccess.pending > 0 && <span className="text-amber-500">{portalAccess.pending} en attente</span>}
                    </span>
                  </div>
                )}
                {getPrefs(c).max_allocation_pct && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.04)' }}>
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${getPrefs(c).max_allocation_pct}%`,
                          background: 'linear-gradient(90deg, var(--ivory-accent), var(--ivory-teal))',
                        }}
                      />
                    </div>
                    <span className="text-[10px] font-semibold tabular-nums" style={{ color: 'var(--ivory-text-muted)' }}>
                      {getPrefs(c).max_allocation_pct}%
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-0.5 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-[rgba(13,148,136,0.06)]" onClick={() => onEdit(c)}>
                    <Pencil className="h-3.5 w-3.5" style={{ color: 'var(--ivory-text-muted)' }} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Modifier</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-red-50" onClick={() => onDelete(c.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-red-400" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Supprimer</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

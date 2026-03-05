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
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import StarRating from '@/components/ui/star-rating'
import GradientSlider from '@/components/ui/gradient-slider'
import StepperInput from '@/components/ui/stepper-input'
import { Plus, Pencil, Trash2, Star, FileText, Users, Globe, Mail, UserPlus, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import ConfirmDialog from '@/components/ConfirmDialog'

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
      <Input type="date" value={date} readOnly className="flex-1 text-[13px] h-9" />
      <Badge variant="outline" className={`shrink-0 text-[10px] h-5 px-1.5 font-medium ${cls}`}>
        <Icon className="h-2.5 w-2.5 mr-0.5" />{days < 0 ? 'Expire' : `${days}j`}
      </Badge>
    </div>
  )
}

function CardSkeleton() {
  return (
    <Card className="border-border/60">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Skeleton className="h-9 w-9 rounded-lg shrink-0" />
          <div className="flex-1 space-y-2"><Skeleton className="h-4 w-28" /><Skeleton className="h-3.5 w-20" /><Skeleton className="h-3.5 w-32" /></div>
        </div>
      </CardContent>
    </Card>
  )
}

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.04, duration: 0.25 } }),
}

export default function CustomersPage() {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [form, setForm] = useState<CustomerInsert>(emptyCustomer)
  const [docs, setDocs] = useState<CustomerDocuments>({})
  const [prefs, setPrefs] = useState<AllocationPrefs>({})
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data: customers, isLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('customers').select('*').order('is_top_client', { ascending: false }).order('name')
      if (error) throw error
      return data as Customer[]
    },
  })

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
  const hasDocuments = (c: Customer) => { const d = (c.documents as CustomerDocuments | null) ?? (c.metadata as Record<string, unknown>)?.documents as CustomerDocuments | undefined; return d && (d.wda_number || d.gdp_number) }
  const getPrefs = (c: Customer): AllocationPrefs => (c.allocation_preferences as AllocationPrefs) ?? {}

  return (
    <div className="p-5 md:p-7 lg:p-8 space-y-5 max-w-6xl mx-auto animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-violet-50 flex items-center justify-center"><Users className="h-4 w-4 text-violet-600" /></div>
          <div>
            <h2 className="text-lg md:text-xl font-semibold tracking-tight">Clients importateurs</h2>
            <p className="text-[12px] text-muted-foreground">{customers?.length ?? 0} clients europeens</p>
          </div>
        </div>
        <Button size="sm" onClick={openCreate} className="gap-1.5 text-[13px] h-8"><Plus className="h-3.5 w-3.5" />Ajouter</Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}</div>
      ) : !customers?.length ? (
        <Card className="border-border/60"><CardContent className="flex flex-col items-center py-14 gap-2.5">
          <div className="h-12 w-12 rounded-xl bg-muted/50 flex items-center justify-center"><UserPlus className="h-6 w-6 text-muted-foreground/50" /></div>
          <p className="font-medium text-[13px]">Aucun client</p>
          <p className="text-[12px] text-muted-foreground">Ajoutez vos clients importateurs</p>
          <Button size="sm" onClick={openCreate} className="mt-1 gap-1.5 text-[12px] h-7"><Plus className="h-3 w-3" />Ajouter</Button>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <AnimatePresence mode="popLayout">
            {customers.map((c, i) => (
              <motion.div key={c.id} custom={i} variants={cardVariants} initial="hidden" animate="visible" exit={{ opacity: 0, scale: 0.97 }} layout>
                <Card className={`group hover:shadow-md hover:shadow-black/[0.03] transition-all duration-200 border-border/60 hover:border-border ${c.is_top_client ? 'ring-1 ring-amber-200/60' : ''}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="h-9 w-9 rounded-lg bg-violet-50 flex items-center justify-center shrink-0 text-base">
                        {c.country && FLAG_EMOJI[c.country] ? <span>{FLAG_EMOJI[c.country]}</span> : <Globe className="h-4 w-4 text-violet-600" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <h3 className="font-medium text-[13px] truncate">{c.name}</h3>
                          {c.is_top_client && <Tooltip><TooltipTrigger><Star className="h-3 w-3 text-amber-500 fill-amber-500 shrink-0" /></TooltipTrigger><TooltipContent>Prioritaire</TooltipContent></Tooltip>}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {c.code && <Badge variant="secondary" className="font-mono text-[10px] h-5 px-1.5">{c.code}</Badge>}
                          {c.country && <Badge variant="outline" className="text-[10px] h-5 px-1.5">{countryName(c.country)}</Badge>}
                          {getPrefs(c).priority_level && <div className="flex items-center gap-px">{Array.from({ length: getPrefs(c).priority_level! }, (_, j) => <Star key={j} className="h-2.5 w-2.5 text-amber-400 fill-amber-400" />)}</div>}
                        </div>
                        <div className="mt-2 space-y-1">
                          {c.contact_email && <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground"><Mail className="h-3 w-3 shrink-0" /><span className="truncate">{c.contact_email}</span></div>}
                          {hasDocuments(c) && <div className="flex items-center gap-1.5 text-[12px] text-emerald-600"><FileText className="h-3 w-3 shrink-0" /><span>Documents conformite</span></div>}
                          {getPrefs(c).max_allocation_pct && <div className="text-[11px] text-muted-foreground">Max: <span className="font-medium">{getPrefs(c).max_allocation_pct}%</span></div>}
                        </div>
                      </div>
                      <div className="flex gap-0 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}><Pencil className="h-3 w-3" /></Button></TooltipTrigger><TooltipContent>Modifier</TooltipContent></Tooltip>
                        <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteId(c.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button></TooltipTrigger><TooltipContent>Supprimer</TooltipContent></Tooltip>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base"><div className="h-7 w-7 rounded-md bg-violet-50 flex items-center justify-center"><Users className="h-3.5 w-3.5 text-violet-600" /></div>{editing ? 'Modifier le client' : 'Nouveau client'}</DialogTitle>
            <DialogDescription className="text-[13px]">{editing ? 'Modifiez les informations' : 'Ajoutez un nouveau client'}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <Tabs defaultValue="general" className="space-y-3.5">
              <TabsList className="w-full grid grid-cols-3 h-8">
                <TabsTrigger value="general" className="text-[12px]">General</TabsTrigger>
                <TabsTrigger value="documents" className="text-[12px]">Documents</TabsTrigger>
                <TabsTrigger value="preferences" className="text-[12px]">Preferences</TabsTrigger>
              </TabsList>
              <TabsContent value="general" className="space-y-3.5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label className="text-[13px]">Nom *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Orifarm" required className="text-[13px] h-9" /></div>
                  <div className="space-y-1.5"><Label className="text-[13px]">Code</Label><Input value={form.code ?? ''} onChange={(e) => setForm({ ...form, code: e.target.value || null })} placeholder="ORI" className="font-mono uppercase text-[13px] h-9" /></div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px]">Pays</Label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {COUNTRIES.map((country) => (
                      <button key={country.code} type="button" onClick={() => setForm({ ...form, country: form.country === country.code ? null : country.code })}
                        className={`relative flex items-center gap-1.5 px-2.5 py-2 rounded-lg border text-[12px] transition-colors ${form.country === country.code ? 'border-violet-300 bg-violet-50 text-violet-900' : 'border-border/60 hover:bg-muted/30'}`}>
                        <span className="text-sm">{FLAG_EMOJI[country.code]}</span>
                        <div className="text-left"><div className="font-medium text-[11px]">{country.name}</div><div className="text-[9px] text-muted-foreground">{country.code}</div></div>
                        {form.country === country.code && <CheckCircle2 className="absolute top-1 right-1 h-3 w-3 text-violet-500" />}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5"><Label className="text-[13px]">Email</Label><Input type="email" value={form.contact_email ?? ''} onChange={(e) => setForm({ ...form, contact_email: e.target.value || null })} className="text-[13px] h-9" /></div>
                <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                  <div className="space-y-0.5"><Label htmlFor="top-client-switch" className="cursor-pointer flex items-center gap-1.5 text-[13px]"><Star className="h-3.5 w-3.5 text-amber-500" />Client prioritaire</Label><p className="text-[11px] text-muted-foreground">Favorise lors des allocations</p></div>
                  <Switch id="top-client-switch" checked={form.is_top_client} onCheckedChange={(checked) => setForm({ ...form, is_top_client: checked })} />
                </div>
              </TabsContent>
              <TabsContent value="documents" className="space-y-3.5">
                <div className="rounded-lg border border-dashed border-border/60 p-3 bg-muted/20"><p className="text-[12px] text-muted-foreground flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" />Documents reglementaires</p></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label className="text-[13px]">Numero WDA</Label><Input value={docs.wda_number ?? ''} onChange={(e) => setDocs({ ...docs, wda_number: e.target.value || undefined })} placeholder="WDA-XXXX" className="font-mono text-[13px] h-9" /></div>
                  <div className="space-y-1.5"><Label className="text-[13px]">Expiration WDA</Label>
                    {docs.wda_expiry ? <div className="space-y-1"><ExpiryCountdown date={docs.wda_expiry} label="WDA" /><button type="button" onClick={() => setDocs({ ...docs, wda_expiry: undefined })} className="text-[10px] text-muted-foreground hover:text-destructive">Effacer</button></div> : <Input type="date" value="" onChange={(e) => setDocs({ ...docs, wda_expiry: e.target.value || undefined })} className="text-[13px] h-9" />}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label className="text-[13px]">Numero GDP</Label><Input value={docs.gdp_number ?? ''} onChange={(e) => setDocs({ ...docs, gdp_number: e.target.value || undefined })} placeholder="GDP-XXXX" className="font-mono text-[13px] h-9" /></div>
                  <div className="space-y-1.5"><Label className="text-[13px]">Expiration GDP</Label>
                    {docs.gdp_expiry ? <div className="space-y-1"><ExpiryCountdown date={docs.gdp_expiry} label="GDP" /><button type="button" onClick={() => setDocs({ ...docs, gdp_expiry: undefined })} className="text-[10px] text-muted-foreground hover:text-destructive">Effacer</button></div> : <Input type="date" value="" onChange={(e) => setDocs({ ...docs, gdp_expiry: e.target.value || undefined })} className="text-[13px] h-9" />}
                  </div>
                </div>
                <div className="space-y-1.5"><Label className="text-[13px]">Notes</Label><Textarea value={docs.notes ?? ''} onChange={(e) => setDocs({ ...docs, notes: e.target.value || undefined })} placeholder="Notes..." rows={2} className="text-[13px]" /></div>
              </TabsContent>
              <TabsContent value="preferences" className="space-y-4">
                <div className="rounded-lg border border-dashed border-border/60 p-3 bg-muted/20"><p className="text-[12px] text-muted-foreground flex items-center gap-1.5"><Star className="h-3.5 w-3.5" />Preferences d'allocation</p></div>
                <div className="space-y-1.5"><Label className="text-[13px]">Priorite</Label><StarRating value={prefs.priority_level ?? 3} onChange={(v) => setPrefs({ ...prefs, priority_level: v })} labels={['Haute', 'Elevee', 'Normal', 'Basse', 'Tres basse']} /></div>
                <div className="space-y-1.5"><Label className="text-[13px]">% max stock</Label><GradientSlider value={prefs.max_allocation_pct ?? 30} onChange={(v) => setPrefs({ ...prefs, max_allocation_pct: v })} min={0} max={100} step={5} suffix="%" zones={[{ label: 'Conservateur', max: 20 }, { label: 'Modere', max: 50 }, { label: 'Agressif', max: 100 }]} /></div>
                <div className="space-y-1.5"><Label className="text-[13px]">Expiry min</Label><StepperInput value={prefs.preferred_expiry_months} onChange={(v) => setPrefs({ ...prefs, preferred_expiry_months: v })} min={0} max={36} suffix=" mois" placeholder="Non defini" presets={[{ label: '3', value: 3 }, { label: '6', value: 6 }, { label: '9', value: 9 }, { label: '12', value: 12 }]} /></div>
                <div className="space-y-1.5"><Label className="text-[13px]">Notes</Label><Textarea value={prefs.notes ?? ''} onChange={(e) => setPrefs({ ...prefs, notes: e.target.value || undefined })} placeholder="Notes..." rows={2} className="text-[13px]" /></div>
              </TabsContent>
            </Tabs>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" size="sm" onClick={() => setDialogOpen(false)} className="text-[13px]">Annuler</Button>
              <Button type="submit" size="sm" disabled={upsert.isPending} className="text-[13px]">{upsert.isPending ? 'Enregistrement...' : editing ? 'Modifier' : 'Creer'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)} title="Supprimer le client" description="Action irreversible." onConfirm={() => deleteId && deleteMut.mutate(deleteId)} loading={deleteMut.isPending} />
    </div>
  )
}

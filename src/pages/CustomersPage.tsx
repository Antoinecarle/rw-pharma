import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Customer, CustomerInsert } from '@/types/database'
import { motion, AnimatePresence } from 'framer-motion'
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
  { code: 'DE', name: 'Allemagne', flag: 'DE' },
  { code: 'DK', name: 'Danemark', flag: 'DK' },
  { code: 'SE', name: 'Suede', flag: 'SE' },
  { code: 'NO', name: 'Norvege', flag: 'NO' },
  { code: 'NL', name: 'Pays-Bas', flag: 'NL' },
  { code: 'BE', name: 'Belgique', flag: 'BE' },
]

const FLAG_EMOJI: Record<string, string> = {
  DE: '\u{1F1E9}\u{1F1EA}',
  DK: '\u{1F1E9}\u{1F1F0}',
  SE: '\u{1F1F8}\u{1F1EA}',
  NO: '\u{1F1F3}\u{1F1F4}',
  NL: '\u{1F1F3}\u{1F1F1}',
  BE: '\u{1F1E7}\u{1F1EA}',
}

interface CustomerDocuments {
  wda_number?: string
  wda_expiry?: string
  gdp_number?: string
  gdp_expiry?: string
  notes?: string
}

interface AllocationPrefs {
  priority_level?: number
  max_allocation_pct?: number
  preferred_expiry_months?: number
  notes?: string
}

const emptyCustomer: CustomerInsert = {
  name: '',
  code: null,
  country: null,
  contact_email: null,
  is_top_client: false,
  allocation_preferences: {},
  documents: null,
  excel_column_mapping: {},
  metadata: {},
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr)
  const now = new Date()
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function ExpiryCountdown({ date, label }: { date: string; label: string }) {
  const days = daysUntil(date)
  const isExpired = days < 0
  const isWarning = days >= 0 && days <= 90
  const isOk = days > 90

  return (
    <div className="flex items-center gap-2">
      <Input
        type="date"
        value={date}
        readOnly
        className="flex-1 text-sm"
      />
      <Badge
        variant="outline"
        className={`shrink-0 text-xs font-medium ${
          isExpired
            ? 'border-red-300 bg-red-50 text-red-700'
            : isWarning
              ? 'border-amber-300 bg-amber-50 text-amber-700'
              : isOk
                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                : ''
        }`}
      >
        {isExpired ? (
          <><AlertTriangle className="h-3 w-3 mr-1" />Expire</>
        ) : isWarning ? (
          <><AlertTriangle className="h-3 w-3 mr-1" />{days}j</>
        ) : (
          <><CheckCircle2 className="h-3 w-3 mr-1" />{days}j</>
        )}
      </Badge>
    </div>
  )
}

function CardSkeleton() {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <Skeleton className="h-11 w-11 rounded-xl shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-36" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, type: 'spring', stiffness: 300, damping: 25 },
  }),
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
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('is_top_client', { ascending: false })
        .order('name')
      if (error) throw error
      return data as Customer[]
    },
  })

  const upsert = useMutation({
    mutationFn: async (c: CustomerInsert & { id?: string }) => {
      const payload = {
        ...c,
        documents: docs,
        allocation_preferences: prefs,
      }
      if (c.id) {
        const { id, ...rest } = payload
        const { error } = await supabase.from('customers').update(rest).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('customers').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      setDialogOpen(false)
      toast.success(editing ? 'Client modifie' : 'Client cree')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('customers').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      toast.success('Client supprime')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const openCreate = () => {
    setEditing(null)
    setForm(emptyCustomer)
    setDocs({})
    setPrefs({})
    setDialogOpen(true)
  }

  const openEdit = (c: Customer) => {
    setEditing(c)
    setForm({
      name: c.name,
      code: c.code,
      country: c.country,
      contact_email: c.contact_email,
      is_top_client: c.is_top_client,
      allocation_preferences: c.allocation_preferences,
      documents: c.documents,
      excel_column_mapping: c.excel_column_mapping,
      metadata: c.metadata,
    })
    setDocs((c.documents as CustomerDocuments) ?? (c.metadata as Record<string, unknown>)?.documents as CustomerDocuments ?? {})
    setPrefs((c.allocation_preferences as AllocationPrefs) ?? {})
    setDialogOpen(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    upsert.mutate(editing ? { ...form, id: editing.id } : form)
  }

  const countryName = (code: string | null) => COUNTRIES.find(c => c.code === code)?.name ?? code ?? '-'

  const hasDocuments = (c: Customer) => {
    const d = (c.documents as CustomerDocuments | null) ?? (c.metadata as Record<string, unknown>)?.documents as CustomerDocuments | undefined
    return d && (d.wda_number || d.gdp_number)
  }

  const getPrefs = (c: Customer): AllocationPrefs => {
    return (c.allocation_preferences as AllocationPrefs) ?? {}
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-5 max-w-7xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <motion.div
            className="h-10 w-10 rounded-xl bg-violet-50 flex items-center justify-center"
            whileHover={{ scale: 1.1, rotate: 5 }}
            transition={{ type: 'spring', stiffness: 400 }}
          >
            <Users className="h-5 w-5 text-violet-600" />
          </motion.div>
          <div>
            <h2 className="text-xl md:text-2xl font-bold">Clients importateurs</h2>
            <p className="text-sm text-muted-foreground">{customers?.length ?? 0} clients europeens</p>
          </div>
        </div>
        <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Ajouter
          </Button>
        </motion.div>
      </div>

      {/* Cards grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : !customers?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16 gap-3">
            <motion.div
              className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, delay: 0.1 }}
            >
              <UserPlus className="h-8 w-8 text-muted-foreground" />
            </motion.div>
            <div className="text-center">
              <p className="font-semibold">Aucun client</p>
              <p className="text-sm text-muted-foreground mt-1">
                Ajoutez vos clients importateurs europeens
              </p>
            </div>
            <Button size="sm" onClick={openCreate} className="mt-2 gap-1.5">
              <Plus className="h-4 w-4" />
              Ajouter un client
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {customers.map((c, i) => (
              <motion.div
                key={c.id}
                custom={i}
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                exit={{ opacity: 0, scale: 0.95 }}
                layout
                whileHover={{ y: -4 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              >
                <Card className={`group hover:shadow-lg hover:shadow-black/5 transition-shadow duration-300 ${c.is_top_client ? 'ring-1 ring-amber-200 bg-amber-50/30' : ''}`}>
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      <motion.div
                        className="h-11 w-11 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0 shadow-sm text-lg"
                        whileHover={{ rotate: 10 }}
                      >
                        {c.country && FLAG_EMOJI[c.country] ? (
                          <span>{FLAG_EMOJI[c.country]}</span>
                        ) : (
                          <Globe className="h-5 w-5 text-white" />
                        )}
                      </motion.div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold truncate">{c.name}</h3>
                          {c.is_top_client && (
                            <Tooltip>
                              <TooltipTrigger>
                                <motion.div
                                  animate={{ rotate: [0, 15, -15, 0] }}
                                  transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 3 }}
                                >
                                  <Star className="h-4 w-4 text-amber-500 fill-amber-500 shrink-0" />
                                </motion.div>
                              </TooltipTrigger>
                              <TooltipContent>Client prioritaire</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {c.code && (
                            <Badge variant="secondary" className="font-mono text-xs">{c.code}</Badge>
                          )}
                          {c.country && (
                            <Badge variant="outline" className="text-xs">
                              {countryName(c.country)}
                            </Badge>
                          )}
                          {getPrefs(c).priority_level && (
                            <div className="flex items-center gap-0.5">
                              {Array.from({ length: getPrefs(c).priority_level! }, (_, j) => (
                                <Star key={j} className="h-3 w-3 text-amber-400 fill-amber-400" />
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="mt-2.5 space-y-1.5">
                          {c.contact_email && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Mail className="h-3.5 w-3.5 shrink-0" />
                              <span className="truncate">{c.contact_email}</span>
                            </div>
                          )}
                          {hasDocuments(c) && (
                            <div className="flex items-center gap-2 text-sm text-emerald-600">
                              <FileText className="h-3.5 w-3.5 shrink-0" />
                              <span>Documents conformite</span>
                            </div>
                          )}
                          {getPrefs(c).max_allocation_pct && (
                            <div className="text-xs text-muted-foreground">
                              Max allocation: <span className="font-medium">{getPrefs(c).max_allocation_pct}%</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-0.5 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Modifier</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteId(c.id)}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Supprimer</TooltipContent>
                        </Tooltip>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-violet-50 flex items-center justify-center">
                <Users className="h-4 w-4 text-violet-600" />
              </div>
              {editing ? 'Modifier le client' : 'Nouveau client'}
            </DialogTitle>
            <DialogDescription>
              {editing ? 'Modifiez les informations du client importateur' : 'Ajoutez un nouveau client importateur europeen'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <Tabs defaultValue="general" className="space-y-4">
              <TabsList className="w-full grid grid-cols-3">
                <TabsTrigger value="general">General</TabsTrigger>
                <TabsTrigger value="documents">Documents</TabsTrigger>
                <TabsTrigger value="preferences">Preferences</TabsTrigger>
              </TabsList>

              <TabsContent value="general" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Nom *</Label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Orifarm"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Code</Label>
                    <Input
                      value={form.code ?? ''}
                      onChange={(e) => setForm({ ...form, code: e.target.value || null })}
                      placeholder="ORI"
                      className="font-mono uppercase"
                    />
                  </div>
                </div>

                {/* Country card selector */}
                <div className="space-y-2">
                  <Label>Pays</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {COUNTRIES.map((country) => (
                      <motion.button
                        key={country.code}
                        type="button"
                        onClick={() => setForm({ ...form, country: form.country === country.code ? null : country.code })}
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.96 }}
                        className={`relative flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                          form.country === country.code
                            ? 'border-violet-400 bg-violet-50 text-violet-900 ring-1 ring-violet-400'
                            : 'border-border hover:bg-muted/50'
                        }`}
                      >
                        <span className="text-lg">{FLAG_EMOJI[country.code]}</span>
                        <div className="text-left">
                          <div className="font-medium text-xs">{country.name}</div>
                          <div className="text-[10px] text-muted-foreground">{country.code}</div>
                        </div>
                        {form.country === country.code && (
                          <motion.div
                            layoutId="country-check"
                            className="absolute top-1 right-1 h-4 w-4 rounded-full bg-violet-500 flex items-center justify-center"
                          >
                            <CheckCircle2 className="h-3 w-3 text-white" />
                          </motion.div>
                        )}
                      </motion.button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={form.contact_email ?? ''}
                    onChange={(e) => setForm({ ...form, contact_email: e.target.value || null })}
                  />
                </div>

                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <Label htmlFor="top-client-switch" className="cursor-pointer flex items-center gap-2">
                      <Star className="h-4 w-4 text-amber-500" />
                      Client prioritaire
                    </Label>
                    <p className="text-xs text-muted-foreground">Sera favorise lors des allocations</p>
                  </div>
                  <Switch
                    id="top-client-switch"
                    checked={form.is_top_client}
                    onCheckedChange={(checked) => setForm({ ...form, is_top_client: checked })}
                  />
                </div>
              </TabsContent>

              <TabsContent value="documents" className="space-y-4">
                <div className="rounded-lg border border-dashed p-4 bg-muted/30">
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Documents reglementaires (WDA, GDP Certificate)
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Numero WDA</Label>
                    <Input
                      value={docs.wda_number ?? ''}
                      onChange={(e) => setDocs({ ...docs, wda_number: e.target.value || undefined })}
                      placeholder="WDA-XXXX-XXXX"
                      className="font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Expiration WDA</Label>
                    {docs.wda_expiry ? (
                      <div className="space-y-1">
                        <ExpiryCountdown date={docs.wda_expiry} label="WDA" />
                        <button
                          type="button"
                          onClick={() => setDocs({ ...docs, wda_expiry: undefined })}
                          className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                        >
                          Effacer la date
                        </button>
                      </div>
                    ) : (
                      <Input
                        type="date"
                        value={docs.wda_expiry ?? ''}
                        onChange={(e) => setDocs({ ...docs, wda_expiry: e.target.value || undefined })}
                      />
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Numero GDP</Label>
                    <Input
                      value={docs.gdp_number ?? ''}
                      onChange={(e) => setDocs({ ...docs, gdp_number: e.target.value || undefined })}
                      placeholder="GDP-XXXX-XXXX"
                      className="font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Expiration GDP</Label>
                    {docs.gdp_expiry ? (
                      <div className="space-y-1">
                        <ExpiryCountdown date={docs.gdp_expiry} label="GDP" />
                        <button
                          type="button"
                          onClick={() => setDocs({ ...docs, gdp_expiry: undefined })}
                          className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                        >
                          Effacer la date
                        </button>
                      </div>
                    ) : (
                      <Input
                        type="date"
                        value={docs.gdp_expiry ?? ''}
                        onChange={(e) => setDocs({ ...docs, gdp_expiry: e.target.value || undefined })}
                      />
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={docs.notes ?? ''}
                    onChange={(e) => setDocs({ ...docs, notes: e.target.value || undefined })}
                    placeholder="Notes sur le client..."
                    rows={3}
                  />
                </div>
              </TabsContent>

              <TabsContent value="preferences" className="space-y-5">
                <div className="rounded-lg border border-dashed p-4 bg-muted/30">
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Star className="h-4 w-4" />
                    Preferences d'allocation (priorite, limites, expiry minimum)
                  </p>
                </div>

                {/* Star Rating for priority */}
                <div className="space-y-2">
                  <Label>Niveau de priorite</Label>
                  <StarRating
                    value={prefs.priority_level ?? 3}
                    onChange={(v) => setPrefs({ ...prefs, priority_level: v })}
                    labels={['Haute priorite', 'Priorite elevee', 'Normal', 'Basse priorite', 'Tres basse']}
                  />
                </div>

                {/* Gradient Slider for max allocation % */}
                <div className="space-y-2">
                  <Label>% max du stock alloue</Label>
                  <GradientSlider
                    value={prefs.max_allocation_pct ?? 30}
                    onChange={(v) => setPrefs({ ...prefs, max_allocation_pct: v })}
                    min={0}
                    max={100}
                    step={5}
                    suffix="%"
                    zones={[
                      { label: 'Conservateur', max: 20 },
                      { label: 'Modere', max: 50 },
                      { label: 'Agressif', max: 100 },
                    ]}
                  />
                </div>

                {/* Stepper Input for expiry months */}
                <div className="space-y-2">
                  <Label>Expiry minimum (mois)</Label>
                  <StepperInput
                    value={prefs.preferred_expiry_months}
                    onChange={(v) => setPrefs({ ...prefs, preferred_expiry_months: v })}
                    min={0}
                    max={36}
                    suffix=" mois"
                    placeholder="Non defini"
                    presets={[
                      { label: '3 mois', value: 3 },
                      { label: '6 mois', value: 6 },
                      { label: '9 mois', value: 9 },
                      { label: '12 mois', value: 12 },
                    ]}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Notes d'allocation</Label>
                  <Textarea
                    value={prefs.notes ?? ''}
                    onChange={(e) => setPrefs({ ...prefs, notes: e.target.value || undefined })}
                    placeholder="Notes specifiques pour l'allocation..."
                    rows={2}
                  />
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={upsert.isPending}>
                {upsert.isPending ? 'Enregistrement...' : editing ? 'Modifier' : 'Creer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title="Supprimer le client"
        description="Cette action est irreversible. Le client sera definitivement supprime."
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        loading={deleteMut.isPending}
      />
    </div>
  )
}

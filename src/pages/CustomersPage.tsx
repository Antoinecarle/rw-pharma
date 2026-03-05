import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Customer, CustomerInsert } from '@/types/database'
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Plus, Pencil, Trash2, Star, FileText, Users, Globe, Mail, UserPlus } from 'lucide-react'
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

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-5 max-w-7xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-violet-50 flex items-center justify-center">
            <Users className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <h2 className="text-xl md:text-2xl font-bold">Clients importateurs</h2>
            <p className="text-sm text-muted-foreground">{customers?.length ?? 0} clients europeens</p>
          </div>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Ajouter
        </Button>
      </div>

      {/* Cards grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : !customers?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16 gap-3">
            <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center">
              <UserPlus className="h-8 w-8 text-muted-foreground" />
            </div>
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
          {customers.map((c, i) => (
            <Card key={c.id} className={`group hover:shadow-lg hover:shadow-black/5 transition-all duration-300 hover:-translate-y-0.5 animate-fade-in stagger-${Math.min(i + 1, 5)} ${c.is_top_client ? 'ring-1 ring-amber-200 bg-amber-50/30' : ''}`}>
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0 shadow-sm text-lg">
                    {c.country && FLAG_EMOJI[c.country] ? (
                      <span>{FLAG_EMOJI[c.country]}</span>
                    ) : (
                      <Globe className="h-5 w-5 text-white" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold truncate">{c.name}</h3>
                      {c.is_top_client && (
                        <Tooltip>
                          <TooltipTrigger>
                            <Star className="h-4 w-4 text-amber-500 fill-amber-500 shrink-0" />
                          </TooltipTrigger>
                          <TooltipContent>Client prioritaire</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {c.code && (
                        <Badge variant="secondary" className="font-mono text-xs">{c.code}</Badge>
                      )}
                      {c.country && (
                        <Badge variant="outline" className="text-xs">
                          {countryName(c.country)}
                        </Badge>
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
                    </div>
                  </div>

                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
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
          ))}
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
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Pays</Label>
                    <Select
                      value={form.country ?? 'none'}
                      onValueChange={(v) => setForm({ ...form, country: v === 'none' ? null : v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selectionner..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Non defini</SelectItem>
                        {COUNTRIES.map((c) => (
                          <SelectItem key={c.code} value={c.code}>
                            {FLAG_EMOJI[c.code]} {c.name} ({c.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={form.contact_email ?? ''}
                      onChange={(e) => setForm({ ...form, contact_email: e.target.value || null })}
                    />
                  </div>
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
                    <Input
                      type="date"
                      value={docs.wda_expiry ?? ''}
                      onChange={(e) => setDocs({ ...docs, wda_expiry: e.target.value || undefined })}
                    />
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
                    <Input
                      type="date"
                      value={docs.gdp_expiry ?? ''}
                      onChange={(e) => setDocs({ ...docs, gdp_expiry: e.target.value || undefined })}
                    />
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

              <TabsContent value="preferences" className="space-y-4">
                <div className="rounded-lg border border-dashed p-4 bg-muted/30">
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Star className="h-4 w-4" />
                    Preferences d'allocation (priorite, limites, expiry minimum)
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Niveau de priorite (1-5)</Label>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map(level => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => setPrefs({ ...prefs, priority_level: level })}
                        className={`w-9 h-9 rounded-md text-sm font-medium border transition-colors ${
                          (prefs.priority_level ?? 3) === level
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'border-border hover:bg-muted'
                        }`}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">1 = haute priorite, 5 = basse priorite</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>% max du stock alloue</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={prefs.max_allocation_pct ?? ''}
                        onChange={(e) => setPrefs({ ...prefs, max_allocation_pct: e.target.value ? Number(e.target.value) : undefined })}
                        placeholder="Ex: 30"
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Expiry minimum (mois)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={prefs.preferred_expiry_months ?? ''}
                      onChange={(e) => setPrefs({ ...prefs, preferred_expiry_months: e.target.value ? Number(e.target.value) : undefined })}
                      placeholder="Ex: 6"
                    />
                  </div>
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

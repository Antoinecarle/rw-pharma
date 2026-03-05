import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Wholesaler, WholesalerInsert } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Plus, Pencil, Trash2, ExternalLink, Truck, Mail, Building2, FolderOpen } from 'lucide-react'
import { toast } from 'sonner'
import ConfirmDialog from '@/components/ConfirmDialog'

const emptyWholesaler: WholesalerInsert = {
  name: '',
  code: null,
  contact_email: null,
  drive_folder_url: null,
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
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function WholesalersPage() {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Wholesaler | null>(null)
  const [form, setForm] = useState<WholesalerInsert>(emptyWholesaler)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data: wholesalers, isLoading } = useQuery({
    queryKey: ['wholesalers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('wholesalers').select('*').order('name')
      if (error) throw error
      return data as Wholesaler[]
    },
  })

  const upsert = useMutation({
    mutationFn: async (w: WholesalerInsert & { id?: string }) => {
      if (w.id) {
        const { id, ...rest } = w
        const { error } = await supabase.from('wholesalers').update(rest).eq('id', id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('wholesalers').insert(w)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wholesalers'] })
      setDialogOpen(false)
      toast.success(editing ? 'Grossiste modifie' : 'Grossiste cree')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('wholesalers').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wholesalers'] })
      toast.success('Grossiste supprime')
    },
    onError: (err: Error) => toast.error(err.message),
  })

  const openCreate = () => {
    setEditing(null)
    setForm(emptyWholesaler)
    setDialogOpen(true)
  }

  const openEdit = (w: Wholesaler) => {
    setEditing(w)
    setForm({
      name: w.name,
      code: w.code,
      contact_email: w.contact_email,
      drive_folder_url: w.drive_folder_url,
      metadata: w.metadata,
    })
    setDialogOpen(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    upsert.mutate(editing ? { ...form, id: editing.id } : form)
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-5 max-w-7xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <Truck className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h2 className="text-xl md:text-2xl font-bold">Grossistes</h2>
            <p className="text-sm text-muted-foreground">{wholesalers?.length ?? 0} grossistes francais partenaires</p>
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
      ) : !wholesalers?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16 gap-3">
            <div className="h-16 w-16 rounded-2xl bg-muted flex items-center justify-center">
              <Building2 className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="text-center">
              <p className="font-semibold">Aucun grossiste</p>
              <p className="text-sm text-muted-foreground mt-1">
                Ajoutez vos grossistes francais partenaires (Alliance, CERP, OCP...)
              </p>
            </div>
            <Button size="sm" onClick={openCreate} className="mt-2 gap-1.5">
              <Plus className="h-4 w-4" />
              Ajouter un grossiste
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {wholesalers.map((w, i) => (
            <Card key={w.id} className={`group hover:shadow-lg hover:shadow-black/5 transition-all duration-300 hover:-translate-y-0.5 animate-fade-in stagger-${Math.min(i + 1, 5)}`}>
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-sm">
                    <Truck className="h-5 w-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold truncate">{w.name}</h3>
                      {w.code && (
                        <Badge variant="secondary" className="font-mono text-xs shrink-0">{w.code}</Badge>
                      )}
                    </div>

                    <div className="mt-2 space-y-1.5">
                      {w.contact_email && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Mail className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{w.contact_email}</span>
                        </div>
                      )}
                      {w.drive_folder_url && (
                        <a
                          href={w.drive_folder_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-primary hover:underline"
                        >
                          <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                          Google Drive
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {!w.contact_email && !w.drive_folder_url && (
                        <p className="text-sm text-muted-foreground italic">Aucun contact configure</p>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-0.5 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(w)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Modifier</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteId(w.id)}>
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center">
                <Truck className="h-4 w-4 text-blue-600" />
              </div>
              {editing ? 'Modifier le grossiste' : 'Nouveau grossiste'}
            </DialogTitle>
            <DialogDescription>
              {editing ? 'Modifiez les informations du grossiste' : 'Ajoutez un nouveau grossiste francais partenaire'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nom *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Alliance Healthcare"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Code</Label>
                <Input
                  value={form.code ?? ''}
                  onChange={(e) => setForm({ ...form, code: e.target.value || null })}
                  placeholder="AHC"
                  className="font-mono uppercase"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email de contact</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="email"
                  value={form.contact_email ?? ''}
                  onChange={(e) => setForm({ ...form, contact_email: e.target.value || null })}
                  placeholder="contact@grossiste.fr"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>URL Google Drive</Label>
              <div className="relative">
                <FolderOpen className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={form.drive_folder_url ?? ''}
                  onChange={(e) => setForm({ ...form, drive_folder_url: e.target.value || null })}
                  placeholder="https://drive.google.com/..."
                  className="pl-9"
                />
              </div>
            </div>
            <DialogFooter>
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
        title="Supprimer le grossiste"
        description="Cette action est irreversible. Le grossiste et ses quotas associes seront supprimes."
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        loading={deleteMut.isPending}
      />
    </div>
  )
}

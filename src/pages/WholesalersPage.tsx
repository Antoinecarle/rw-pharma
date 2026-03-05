import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Wholesaler, WholesalerInsert } from '@/types/database'
import { motion, AnimatePresence } from 'framer-motion'
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
import { Plus, Pencil, Trash2, ExternalLink, Truck, Mail, Building2, FolderOpen, CheckCircle2, LinkIcon } from 'lucide-react'
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
    <Card className="border-border/60">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Skeleton className="h-9 w-9 rounded-lg shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-3.5 w-36" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

const cardVariants: import('framer-motion').Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.04, duration: 0.25 },
  }),
}

function isValidUrl(str: string): boolean {
  try {
    new URL(str)
    return true
  } catch {
    return false
  }
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

  const driveUrlValid = !form.drive_folder_url || isValidUrl(form.drive_folder_url)

  return (
    <div className="p-5 md:p-7 lg:p-8 space-y-5 max-w-6xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center">
            <Truck className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg md:text-xl font-semibold tracking-tight">Grossistes</h2>
            <p className="text-[12px] text-muted-foreground">{wholesalers?.length ?? 0} partenaires francais</p>
          </div>
        </div>
        <Button size="sm" onClick={openCreate} className="gap-1.5 text-[13px] h-8">
          <Plus className="h-3.5 w-3.5" />
          Ajouter
        </Button>
      </div>

      {/* Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : !wholesalers?.length ? (
        <Card className="border-border/60">
          <CardContent className="flex flex-col items-center py-14 gap-2.5">
            <div className="h-12 w-12 rounded-xl bg-muted/50 flex items-center justify-center">
              <Building2 className="h-6 w-6 text-muted-foreground/50" />
            </div>
            <div className="text-center">
              <p className="font-medium text-[13px]">Aucun grossiste</p>
              <p className="text-[12px] text-muted-foreground mt-0.5">
                Ajoutez vos grossistes francais (Alliance, CERP, OCP...)
              </p>
            </div>
            <Button size="sm" onClick={openCreate} className="mt-1 gap-1.5 text-[12px] h-7">
              <Plus className="h-3 w-3" />
              Ajouter un grossiste
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <AnimatePresence mode="popLayout">
            {wholesalers.map((w, i) => (
              <motion.div
                key={w.id}
                custom={i}
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                exit={{ opacity: 0, scale: 0.97 }}
                layout
              >
                <Card className="group hover:shadow-md hover:shadow-black/[0.03] transition-all duration-200 border-border/60 hover:border-border">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                        <Truck className="h-4 w-4 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-[13px] truncate">{w.name}</h3>
                          {w.code && (
                            <Badge variant="secondary" className="font-mono text-[10px] h-5 px-1.5 shrink-0">{w.code}</Badge>
                          )}
                        </div>

                        <div className="mt-2 space-y-1">
                          {w.contact_email && (
                            <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                              <Mail className="h-3 w-3 shrink-0" />
                              <span className="truncate">{w.contact_email}</span>
                            </div>
                          )}
                          {w.drive_folder_url && (
                            <a
                              href={w.drive_folder_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1.5 text-[12px] text-primary hover:underline group/link"
                            >
                              <FolderOpen className="h-3 w-3 shrink-0" />
                              Google Drive
                              <ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover/link:opacity-100 transition-opacity" />
                            </a>
                          )}
                          {!w.contact_email && !w.drive_folder_url && (
                            <p className="text-[12px] text-muted-foreground/50 italic">Aucun contact</p>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-0 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(w)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Modifier</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteId(w.id)}>
                              <Trash2 className="h-3 w-3 text-destructive" />
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

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <div className="h-7 w-7 rounded-md bg-blue-50 flex items-center justify-center">
                <Truck className="h-3.5 w-3.5 text-blue-600" />
              </div>
              {editing ? 'Modifier le grossiste' : 'Nouveau grossiste'}
            </DialogTitle>
            <DialogDescription className="text-[13px]">
              {editing ? 'Modifiez les informations du grossiste' : 'Ajoutez un nouveau grossiste francais'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[13px]">Nom *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Alliance Healthcare"
                  required
                  className="text-[13px] h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px]">Code</Label>
                <Input
                  value={form.code ?? ''}
                  onChange={(e) => setForm({ ...form, code: e.target.value || null })}
                  placeholder="AHC"
                  className="font-mono uppercase text-[13px] h-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px]">Email de contact</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
                <Input
                  type="email"
                  value={form.contact_email ?? ''}
                  onChange={(e) => setForm({ ...form, contact_email: e.target.value || null })}
                  placeholder="contact@grossiste.fr"
                  className="pl-9 text-[13px] h-9"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px]">URL Google Drive</Label>
              <div className="relative">
                <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
                <Input
                  value={form.drive_folder_url ?? ''}
                  onChange={(e) => setForm({ ...form, drive_folder_url: e.target.value || null })}
                  placeholder="https://drive.google.com/..."
                  className={`pl-9 pr-10 text-[13px] h-9 ${form.drive_folder_url && !driveUrlValid ? 'border-red-300 focus-visible:ring-red-400' : ''}`}
                />
                {form.drive_folder_url && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {driveUrlValid ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <span className="text-[10px] text-red-500 font-medium">Invalide</span>
                    )}
                  </div>
                )}
              </div>
              {form.drive_folder_url && driveUrlValid && (
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-muted/30 rounded-md px-2.5 py-1.5">
                  <FolderOpen className="h-3 w-3 text-primary shrink-0" />
                  <span className="truncate">{form.drive_folder_url}</span>
                  <a
                    href={form.drive_folder_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline shrink-0 ml-auto"
                  >
                    Ouvrir
                  </a>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => setDialogOpen(false)} className="text-[13px]">
                Annuler
              </Button>
              <Button type="submit" size="sm" disabled={upsert.isPending} className="text-[13px]">
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
        description="Cette action est irreversible. Le grossiste et ses quotas seront supprimes."
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        loading={deleteMut.isPending}
      />
    </div>
  )
}

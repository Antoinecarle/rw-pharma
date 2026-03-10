import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Wholesaler, WholesalerInsert } from '@/types/database'
import { motion, AnimatePresence } from 'framer-motion'
import type { Variants } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Plus, Pencil, Trash2, ExternalLink, Truck, Mail, Building2, FolderOpen, CheckCircle2, LinkIcon } from 'lucide-react'
import { toast } from 'sonner'
import ConfirmDialog from '@/components/ConfirmDialog'

const emptyWholesaler: WholesalerInsert = { name: '', code: null, type: null, contact_email: null, drive_folder_url: null, metadata: {} }

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  visible: (i: number) => ({ opacity: 1, y: 0, scale: 1, transition: { delay: i * 0.06, duration: 0.4, ease: [0.2, 0.9, 0.2, 1] } }),
}

function CardSkeleton() {
  return (
    <div className="ivory-glass p-5">
      <div className="flex items-start gap-3.5">
        <Skeleton className="h-12 w-12 rounded-2xl shrink-0" />
        <div className="flex-1 space-y-2.5"><Skeleton className="h-4 w-28 rounded-md" /><Skeleton className="h-3.5 w-20 rounded-md" /><Skeleton className="h-3.5 w-40 rounded-md" /></div>
      </div>
    </div>
  )
}

function isValidUrl(str: string): boolean { try { new URL(str); return true } catch { return false } }

const GRADIENTS = [
  'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(59,130,246,0.04))',
  'linear-gradient(135deg, rgba(13,148,136,0.12), rgba(13,148,136,0.04))',
  'linear-gradient(135deg, rgba(5,150,105,0.12), rgba(5,150,105,0.04))',
  'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(245,158,11,0.04))',
  'linear-gradient(135deg, rgba(236,72,153,0.12), rgba(236,72,153,0.04))',
  'linear-gradient(135deg, rgba(6,182,212,0.12), rgba(6,182,212,0.04))',
]
const ICON_COLORS = ['#3B82F6', '#0D9488', '#059669', '#F59E0B', '#EC4899', '#06B6D4']

export default function WholesalersPage() {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Wholesaler | null>(null)
  const [form, setForm] = useState<WholesalerInsert>(emptyWholesaler)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const { data: wholesalers, isLoading } = useQuery({
    queryKey: ['wholesalers'],
    queryFn: async () => { const { data, error } = await supabase.from('wholesalers').select('*').order('name'); if (error) throw error; return data as Wholesaler[] },
  })

  const upsert = useMutation({
    mutationFn: async (w: WholesalerInsert & { id?: string }) => {
      if (w.id) { const { id, ...rest } = w; const { error } = await supabase.from('wholesalers').update(rest).eq('id', id); if (error) throw error }
      else { const { error } = await supabase.from('wholesalers').insert(w); if (error) throw error }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['wholesalers'] }); setDialogOpen(false); toast.success(editing ? 'Grossiste modifie' : 'Grossiste cree') },
    onError: (err: Error) => toast.error(err.message),
  })

  const deleteMut = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('wholesalers').delete().eq('id', id); if (error) throw error },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['wholesalers'] }); toast.success('Grossiste supprime') },
    onError: (err: Error) => toast.error(err.message),
  })

  const openCreate = () => { setEditing(null); setForm(emptyWholesaler); setDialogOpen(true) }
  const openEdit = (w: Wholesaler) => { setEditing(w); setForm({ name: w.name, code: w.code, type: w.type, contact_email: w.contact_email, drive_folder_url: w.drive_folder_url, metadata: w.metadata }); setDialogOpen(true) }
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); upsert.mutate(editing ? { ...form, id: editing.id } : form) }
  const driveUrlValid = !form.drive_folder_url || isValidUrl(form.drive_folder_url)

  return (
    <div className="p-5 md:p-7 lg:p-8 space-y-6 max-w-[1200px] mx-auto ivory-page-glow">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="relative z-10">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="h-11 w-11 rounded-2xl flex items-center justify-center shadow-sm" style={{ background: GRADIENTS[0] }}>
              <Truck className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <h2 className="ivory-heading text-xl md:text-2xl">Grossistes</h2>
              <p className="text-[12px] mt-0.5" style={{ color: 'var(--ivory-text-muted)' }}>{wholesalers?.length ?? 0} partenaires francais</p>
            </div>
          </div>
          <Button size="sm" onClick={openCreate} className="gap-1.5 text-[13px] h-9 rounded-xl shadow-sm" style={{ background: 'linear-gradient(180deg, var(--ivory-accent), var(--ivory-accent-hover))', color: 'white' }}>
            <Plus className="h-3.5 w-3.5" /> Ajouter
          </Button>
        </div>
      </motion.div>

      {wholesalers && wholesalers.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }} className="flex gap-3 flex-wrap relative z-10">
          <div className="ivory-stat-pill"><Truck className="h-3.5 w-3.5 text-blue-500" /><span className="text-[12px]" style={{ color: 'var(--ivory-text-body)' }}><span className="font-bold tabular-nums">{wholesalers.length}</span> grossistes</span></div>
          <div className="ivory-stat-pill"><Mail className="h-3.5 w-3.5" style={{ color: 'var(--ivory-teal)' }} /><span className="text-[12px]" style={{ color: 'var(--ivory-text-body)' }}><span className="font-bold tabular-nums">{wholesalers.filter(w => w.contact_email).length}</span> avec email</span></div>
          <div className="ivory-stat-pill"><FolderOpen className="h-3.5 w-3.5" style={{ color: 'var(--ivory-accent)' }} /><span className="text-[12px]" style={{ color: 'var(--ivory-text-body)' }}><span className="font-bold tabular-nums">{wholesalers.filter(w => w.drive_folder_url).length}</span> Drive</span></div>
        </motion.div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}</div>
      ) : !wholesalers?.length ? (
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="ivory-glass p-0 overflow-hidden">
          <div className="flex flex-col items-center py-20 gap-3">
            <div className="h-16 w-16 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.06)' }}><Building2 className="h-7 w-7" style={{ color: 'var(--ivory-text-muted)' }} /></div>
            <p className="ivory-heading text-[14px]">Aucun grossiste</p>
            <p className="text-[12px]" style={{ color: 'var(--ivory-text-muted)' }}>Ajoutez vos grossistes francais</p>
            <Button size="sm" onClick={openCreate} className="mt-2 gap-1.5 text-[12px] h-8 rounded-xl" style={{ background: 'var(--ivory-accent)', color: 'white' }}><Plus className="h-3 w-3" /> Ajouter</Button>
          </div>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 relative z-10">
          <AnimatePresence mode="popLayout">
            {wholesalers.map((w, i) => (
              <motion.div key={w.id} custom={i} variants={cardVariants} initial="hidden" animate="visible" exit={{ opacity: 0, scale: 0.97 }} layout>
                <div className="ivory-glass group cursor-default overflow-hidden">
                  <div className="p-5">
                    <div className="flex items-start gap-3.5">
                      <div className="h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm" style={{ background: GRADIENTS[i % GRADIENTS.length] }}>
                        <Truck className="h-5 w-5" style={{ color: ICON_COLORS[i % ICON_COLORS.length] }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-[14px] truncate" style={{ color: 'var(--ivory-text-heading)' }}>{w.name}</h3>
                          {w.code && <span className="ivory-mono text-[10px] font-semibold px-2 py-0.5 rounded-md shrink-0" style={{ background: 'rgba(13,148,136,0.06)', color: 'var(--ivory-accent)' }}>{w.code}</span>}
                        </div>
                        <div className="mt-3 space-y-2">
                          {w.contact_email && <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--ivory-text-muted)' }}><Mail className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{w.contact_email}</span></div>}
                          {w.drive_folder_url && (
                            <a href={w.drive_folder_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[12px] group/link" style={{ color: 'var(--ivory-accent)' }}>
                              <FolderOpen className="h-3.5 w-3.5 shrink-0" /><span>Google Drive</span><ExternalLink className="h-2.5 w-2.5 opacity-0 group-hover/link:opacity-100 transition-opacity" />
                            </a>
                          )}
                          {!w.contact_email && !w.drive_folder_url && <p className="text-[12px] italic" style={{ color: 'rgba(0,0,0,0.2)' }}>Aucun contact</p>}
                        </div>
                      </div>
                      <div className="flex gap-0.5 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-200">
                        <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-[rgba(13,148,136,0.06)]" onClick={() => openEdit(w)}><Pencil className="h-3.5 w-3.5" style={{ color: 'var(--ivory-text-muted)' }} /></Button></TooltipTrigger><TooltipContent>Modifier</TooltipContent></Tooltip>
                        <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-red-50" onClick={() => setDeleteId(w.id)}><Trash2 className="h-3.5 w-3.5 text-red-400" /></Button></TooltipTrigger><TooltipContent>Supprimer</TooltipContent></Tooltip>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl" style={{ border: '1px solid rgba(0,0,0,0.06)' }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 ivory-heading text-base">
              <div className="h-8 w-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.08)' }}><Truck className="h-4 w-4 text-blue-500" /></div>
              {editing ? 'Modifier le grossiste' : 'Nouveau grossiste'}
            </DialogTitle>
            <DialogDescription className="text-[13px]">{editing ? 'Modifiez les informations' : 'Ajoutez un nouveau grossiste'}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-[13px] font-medium">Nom *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Alliance Healthcare" required className="text-[13px] h-10 rounded-xl" /></div>
              <div className="space-y-1.5"><Label className="text-[13px] font-medium">Code</Label><Input value={form.code ?? ''} onChange={(e) => setForm({ ...form, code: e.target.value || null })} placeholder="AHC" className="ivory-mono uppercase text-[13px] h-10 rounded-xl" /></div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px] font-medium">Email</Label>
              <div className="relative"><Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: 'var(--ivory-text-muted)' }} /><Input type="email" value={form.contact_email ?? ''} onChange={(e) => setForm({ ...form, contact_email: e.target.value || null })} placeholder="contact@grossiste.fr" className="pl-10 text-[13px] h-10 rounded-xl" /></div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[13px] font-medium">URL Google Drive</Label>
              <div className="relative">
                <LinkIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: 'var(--ivory-text-muted)' }} />
                <Input value={form.drive_folder_url ?? ''} onChange={(e) => setForm({ ...form, drive_folder_url: e.target.value || null })} placeholder="https://drive.google.com/..." className="pl-10 pr-10 text-[13px] h-10 rounded-xl" style={form.drive_folder_url && !driveUrlValid ? { borderColor: '#DC4A4A' } : {}} />
                {form.drive_folder_url && <div className="absolute right-3.5 top-1/2 -translate-y-1/2">{driveUrlValid ? <CheckCircle2 className="h-4 w-4" style={{ color: 'var(--ivory-teal)' }} /> : <span className="text-[10px] font-semibold text-red-500">Invalide</span>}</div>}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => setDialogOpen(false)} className="text-[13px] rounded-xl">Annuler</Button>
              <Button type="submit" size="sm" disabled={upsert.isPending} className="text-[13px] rounded-xl" style={{ background: 'var(--ivory-accent)', color: 'white' }}>{upsert.isPending ? 'Enregistrement...' : editing ? 'Modifier' : 'Creer'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)} title="Supprimer le grossiste" description="Cette action est irreversible." onConfirm={() => deleteId && deleteMut.mutate(deleteId)} loading={deleteMut.isPending} />
    </div>
  )
}

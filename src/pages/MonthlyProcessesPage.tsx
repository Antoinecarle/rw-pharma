import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Plus, Calendar, CalendarRange } from 'lucide-react'
import { toast } from 'sonner'
import MonthlyProcessCard from '@/components/monthly-process/MonthlyProcessCard'
import type { MonthlyProcess } from '@/types/database'

const MONTH_NAMES = [
  'Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre',
]

const currentYear = new Date().getFullYear()
const YEARS = [currentYear - 1, currentYear, currentYear + 1]

export default function MonthlyProcessesPage() {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newMonth, setNewMonth] = useState(String(new Date().getMonth() + 1))
  const [newYear, setNewYear] = useState(String(currentYear))

  const { data: processes, isLoading } = useQuery({
    queryKey: ['monthly-processes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('monthly_processes')
        .select('*')
        .order('year', { ascending: false })
        .order('month', { ascending: false })
      if (error) throw error
      return data as MonthlyProcess[]
    },
  })

  const createMut = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('monthly_processes')
        .insert({
          month: parseInt(newMonth, 10),
          year: parseInt(newYear, 10),
          status: 'draft',
          current_step: 1,
          metadata: {},
        })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monthly-processes'] })
      setDialogOpen(false)
      toast.success('Processus mensuel cree')
    },
    onError: (err: Error) => {
      if (err.message.includes('unique') || err.message.includes('duplicate')) {
        toast.error('Un processus existe deja pour ce mois')
      } else {
        toast.error(err.message)
      }
    },
  })

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="animate-fade-in flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight">Processus Mensuels</h2>
          <p className="text-muted-foreground mt-1">
            Gestion des allocations mensuelles de stocks
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Nouveau processus</span>
        </Button>
      </div>

      {/* Process list */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}><CardContent className="p-5"><Skeleton className="h-24 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : processes && processes.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-fade-in">
          {processes.map((p) => (
            <MonthlyProcessCard key={p.id} process={p} />
          ))}
        </div>
      ) : (
        <Card className="border-dashed animate-fade-in">
          <CardContent className="p-10 text-center">
            <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <CalendarRange className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">Aucun processus</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Creez votre premier processus d'allocation mensuelle
            </p>
            <Button onClick={() => setDialogOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Creer un processus
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Create dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Nouveau processus mensuel
            </DialogTitle>
            <DialogDescription>
              Selectionnez le mois et l'annee pour ce cycle d'allocation.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Mois</Label>
              <Select value={newMonth} onValueChange={setNewMonth}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTH_NAMES.map((name, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Annee</Label>
              <Select value={newYear} onValueChange={setNewYear}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {YEARS.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
            <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>
              {createMut.isPending ? 'Creation...' : 'Creer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

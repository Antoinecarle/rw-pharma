import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { motion } from 'framer-motion'
import AnimatedCounter from '@/components/ui/animated-counter'
import ProgressRing from '@/components/ui/progress-ring'
import {
  Pill, Truck, Users, AlertTriangle, ClipboardList,
  ArrowRight, FileSpreadsheet, CalendarRange, Play,
} from 'lucide-react'

function StatSkeleton() {
  return (
    <div className="ivory-glass p-5">
      <div className="flex items-center justify-between mb-3">
        <Skeleton className="h-3.5 w-16 rounded-md" />
        <Skeleton className="h-9 w-9 rounded-xl" />
      </div>
      <Skeleton className="h-8 w-16 rounded-md" />
    </div>
  )
}

export default function DashboardPage() {
  const { data: productCount, isLoading: loadingProducts } = useQuery({
    queryKey: ['products', 'count'],
    staleTime: 1000 * 60 * 30,
    queryFn: async () => { const { count } = await supabase.from('products').select('*', { count: 'exact', head: true }); return count ?? 0 },
  })

  const { data: wholesalerCount, isLoading: loadingWholesalers } = useQuery({
    queryKey: ['wholesalers', 'count'],
    staleTime: 1000 * 60 * 30,
    queryFn: async () => { const { count } = await supabase.from('wholesalers').select('*', { count: 'exact', head: true }); return count ?? 0 },
  })

  const { data: customerCount, isLoading: loadingCustomers } = useQuery({
    queryKey: ['customers', 'count'],
    staleTime: 1000 * 60 * 30,
    queryFn: async () => { const { count } = await supabase.from('customers').select('*', { count: 'exact', head: true }); return count ?? 0 },
  })

  const { data: blockedCount, isLoading: loadingBlocked } = useQuery({
    queryKey: ['products', 'blocked', 'count'],
    staleTime: 1000 * 60 * 30,
    queryFn: async () => { const { count } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('is_ansm_blocked', true); return count ?? 0 },
  })

  const { data: quotaCount, isLoading: loadingQuotas } = useQuery({
    queryKey: ['quotas', 'count'],
    staleTime: 1000 * 60 * 30,
    queryFn: async () => { const { data } = await supabase.from('wholesaler_quotas').select('id'); return data?.length ?? 0 },
  })

  const { data: activeProcess } = useQuery({
    queryKey: ['monthly-processes', 'active'],
    staleTime: 1000 * 60 * 10,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('monthly_processes').select('*')
        .neq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1).maybeSingle()
      if (error) throw error
      return data as { id: string; month: number; year: number; current_step: number; status: string; orders_count: number; allocations_count: number } | null
    },
  })

  const MONTH_NAMES = ['Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre']
  const STEP_LABELS = ['Import quotas', 'Import commandes', 'Revue commandes', 'Allocation macro', 'Export grossistes', 'Reception stocks', 'Allocation lots', 'Finalisation']

  const stats = [
    { name: 'Produits', value: productCount, loading: loadingProducts, icon: Pill, gradient: 'linear-gradient(135deg, rgba(13,148,136,0.12), rgba(13,148,136,0.04))', iconColor: '#0D9488', href: '/products', target: 1760 },
    { name: 'Grossistes', value: wholesalerCount, loading: loadingWholesalers, icon: Truck, gradient: 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(59,130,246,0.04))', iconColor: '#3B82F6', href: '/wholesalers' },
    { name: 'Clients', value: customerCount, loading: loadingCustomers, icon: Users, gradient: 'linear-gradient(135deg, rgba(5,150,105,0.12), rgba(5,150,105,0.04))', iconColor: '#059669', href: '/customers' },
    { name: 'Quotas', value: quotaCount, loading: loadingQuotas, icon: ClipboardList, gradient: 'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(245,158,11,0.04))', iconColor: '#F59E0B', href: '/quotas' },
    { name: 'ANSM', value: blockedCount, loading: loadingBlocked, icon: AlertTriangle, gradient: 'linear-gradient(135deg, rgba(220,74,74,0.10), rgba(220,74,74,0.03))', iconColor: '#DC4A4A', href: '/products', danger: true },
  ]

  const quickActions = [
    { name: 'Allocations mensuelles', description: 'Lancer ou continuer un processus d\'allocation', href: '/monthly-processes', icon: CalendarRange, gradient: 'linear-gradient(135deg, rgba(13,148,136,0.10), rgba(13,148,136,0.03))', iconColor: 'var(--ivory-accent)' },
    { name: 'Gerer les produits', description: 'Catalogue de 1 760 references, import Excel', href: '/products', icon: Pill, gradient: 'linear-gradient(135deg, rgba(13,148,136,0.10), rgba(13,148,136,0.03))', iconColor: '#0D9488' },
    { name: 'Gerer les grossistes', description: 'Alliance, CERP, OCP et partenaires', href: '/wholesalers', icon: Truck, gradient: 'linear-gradient(135deg, rgba(59,130,246,0.10), rgba(59,130,246,0.03))', iconColor: '#3B82F6' },
    { name: 'Gerer les clients', description: 'Orifarm, MPA, Axicorp et importateurs', href: '/customers', icon: Users, gradient: 'linear-gradient(135deg, rgba(5,150,105,0.10), rgba(5,150,105,0.03))', iconColor: '#059669' },
  ]

  const catalogProgress = productCount != null ? Math.min((productCount / 1760) * 100, 100) : 0

  return (
    <div className="p-5 md:p-7 lg:p-8 space-y-7 max-w-[1200px] mx-auto ivory-page-glow">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="relative z-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="ivory-display text-2xl md:text-3xl">Tableau de bord</h2>
            <p className="text-[13px] mt-1" style={{ color: 'var(--ivory-text-muted)' }}>Vue d'ensemble des donnees de reference</p>
          </div>
          <Link to="/products">
            <Button variant="outline" size="sm" className="hidden sm:flex gap-1.5 text-[13px] h-9 rounded-xl"
              style={{ borderColor: 'rgba(0,0,0,0.08)', boxShadow: 'var(--ivory-shadow-sm)' }}>
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Import Excel
            </Button>
          </Link>
        </div>
      </motion.div>

      {/* Active process banner */}
      {activeProcess && (
        <Link to={`/monthly-processes/${activeProcess.id}`}>
          <motion.div initial={{ opacity: 0, scale: 0.99 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4, delay: 0.05 }} className="relative z-10">
            <div className="ivory-glass group cursor-pointer overflow-hidden"
              style={{ background: 'linear-gradient(135deg, rgba(13,148,136,0.04), rgba(13,148,136,0.02))', borderColor: 'rgba(13,148,136,0.15)' }}>
              <div className="p-5">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm transition-transform group-hover:scale-105"
                    style={{ background: 'linear-gradient(135deg, rgba(13,148,136,0.15), rgba(13,148,136,0.05))' }}>
                    <Play className="h-5 w-5" style={{ color: 'var(--ivory-accent)' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="ivory-heading text-[14px]">Processus en cours</h3>
                      <span className="ivory-badge" style={{ background: 'rgba(13,148,136,0.08)', color: 'var(--ivory-accent)' }}>
                        Etape {activeProcess.current_step}/8
                      </span>
                    </div>
                    <p className="text-[12px]" style={{ color: 'var(--ivory-text-muted)' }}>
                      {MONTH_NAMES[activeProcess.month - 1]} {activeProcess.year} — {STEP_LABELS[activeProcess.current_step - 1]}
                    </p>
                    <div className="flex items-center gap-1.5 mt-2.5">
                      {STEP_LABELS.map((label, idx) => {
                        const stepNum = idx + 1
                        const isCompleted = stepNum < activeProcess.current_step
                        const isCurrent = stepNum === activeProcess.current_step
                        return (
                          <div key={idx} className="flex items-center gap-1.5">
                            <div
                              className={`h-2 w-2 rounded-full transition-colors ${isCurrent ? 'animate-subtle-pulse' : ''}`}
                              style={{
                                background: isCompleted || isCurrent ? 'var(--ivory-accent)' : 'rgba(0,0,0,0.08)',
                              }}
                              title={label}
                            />
                            {idx < STEP_LABELS.length - 1 && (
                              <div className="w-4 h-0.5 rounded-full" style={{ background: isCompleted ? 'rgba(13,148,136,0.3)' : 'rgba(0,0,0,0.04)' }} />
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1 shrink-0" style={{ color: 'var(--ivory-text-muted)' }} />
                </div>
              </div>
            </div>
          </motion.div>
        </Link>
      )}

      {/* Stats Bento Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 relative z-10">
        {stats.map((stat, i) => (
          stat.loading ? <StatSkeleton key={stat.name} /> : (
            <Link key={stat.name} to={stat.href}>
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.06 }}
              >
                <div className="ivory-glass group cursor-pointer overflow-hidden p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--ivory-text-muted)' }}>
                      {stat.name}
                    </span>
                    <div className="h-9 w-9 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110"
                      style={{ background: stat.gradient }}>
                      <stat.icon className="h-4 w-4" style={{ color: stat.iconColor }} />
                    </div>
                  </div>
                  <AnimatedCounter
                    value={stat.value ?? 0}
                    valueClassName={`text-2xl ivory-heading tabular-nums ${stat.danger && stat.value ? 'text-red-500' : ''}`}
                  />
                  {stat.target && (
                    <div className="mt-3 flex items-center gap-2">
                      <ProgressRing value={stat.value ? (stat.value / stat.target) * 100 : 0} size={24} strokeWidth={2.5} showValue={false} />
                      <span className="text-[10px] font-medium tabular-nums" style={{ color: 'var(--ivory-text-muted)' }}>/ {stat.target}</span>
                    </div>
                  )}
                </div>
              </motion.div>
            </Link>
          )
        ))}
      </div>

      {/* Catalog progress */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.4 }} className="relative z-10">
        <div className="ivory-glass p-5 overflow-hidden">
          <div className="flex items-center gap-5">
            <ProgressRing value={catalogProgress} size={64} strokeWidth={5} color="var(--ivory-accent)" />
            <div className="flex-1 min-w-0">
              <h3 className="ivory-heading text-[14px]">Progression du catalogue</h3>
              <p className="text-[12px] mt-1" style={{ color: 'var(--ivory-text-muted)' }}>
                {productCount ?? 0} produits importes sur 1 760 attendus
              </p>
              <div className="mt-2.5 w-full h-2 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.04)' }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: 'linear-gradient(90deg, var(--ivory-accent), var(--ivory-teal))' }}
                  initial={{ width: 0 }}
                  animate={{ width: `${catalogProgress}%` }}
                  transition={{ duration: 1.5, ease: 'easeOut', delay: 0.4 }}
                />
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Quick actions */}
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-3.5">
          <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--ivory-text-muted)' }}>
            Acces rapide
          </span>
          <div className="flex-1 h-px" style={{ background: 'rgba(0,0,0,0.04)' }} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {quickActions.map((action, i) => (
            <Link key={action.href} to={action.href}>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.35 + i * 0.06 }}
              >
                <div className="ivory-glass group cursor-pointer overflow-hidden p-4">
                  <div className="flex items-center gap-3.5">
                    <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105"
                      style={{ background: action.gradient }}>
                      <action.icon className="h-4.5 w-4.5" style={{ color: action.iconColor }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[13px]" style={{ color: 'var(--ivory-text-heading)' }}>{action.name}</p>
                      <p className="text-[11px] mt-0.5 line-clamp-1" style={{ color: 'var(--ivory-text-muted)' }}>{action.description}</p>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" style={{ color: 'rgba(0,0,0,0.15)' }} />
                  </div>
                </div>
              </motion.div>
            </Link>
          ))}
        </div>
      </div>

      <div className="text-center pt-3 pb-5 relative z-10">
        <p className="text-[11px]" style={{ color: 'rgba(0,0,0,0.15)' }}>
          RW Pharma &middot; Phase 1 : Setup & Donnees de reference
        </p>
      </div>
    </div>
  )
}

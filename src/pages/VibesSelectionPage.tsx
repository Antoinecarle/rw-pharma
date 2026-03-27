import React, { useState } from 'react';
import {
  Activity,
  Package,
  ArrowRightLeft,
  ClipboardCheck,
  Search,
  MoreHorizontal,
  ChevronRight,
  Database,
  ArrowUpRight,
  Layers,
  CircleDot,
  CheckCircle2,
  Clock,
  BarChart3,
  Plus,
  FlaskConical,
  ShieldCheck,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ============================================================
// VIBE 1: Clinical Precision
// ============================================================

const KpiCardV1 = ({ label, value, icon: Icon, subValue }: { label: string; value: string; icon: any; subValue?: string }) => (
  <div className="bg-white border border-slate-200 p-4 flex flex-col gap-2 shadow-[0_1px_2px_rgba(0,0,0,0.03)] group hover:border-blue-400 transition-colors duration-200">
    <div className="flex items-center justify-between">
      <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase font-mono">{label}</span>
      <Icon className="w-3.5 h-3.5 text-blue-500" strokeWidth={2.5} />
    </div>
    <div className="flex items-baseline gap-2">
      <span className="text-xl font-medium tracking-tight text-slate-900 font-mono italic">{value}</span>
      {subValue && <span className="text-[10px] text-slate-400 font-mono">{subValue}</span>}
    </div>
    <div className="h-0.5 w-full bg-slate-50 overflow-hidden">
      <div className="h-full bg-blue-500 w-2/3 group-hover:w-full transition-all duration-500 ease-in-out" />
    </div>
  </div>
);

const BadgeV1 = ({ children, variant = 'default' }: { children: React.ReactNode; variant?: 'default' | 'success' | 'warning' }) => {
  const variants = {
    default: 'bg-slate-50 text-slate-600 border-slate-200',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
  };
  return (
    <span className={cn('px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider border font-mono', variants[variant])}>
      {children}
    </span>
  );
};

const ProcessStepV1 = ({ step, active }: { step: number; active?: boolean }) => (
  <div
    className={cn(
      'flex items-center gap-1.5 px-2 py-1 border transition-all duration-300',
      active ? 'opacity-100 scale-100 border-blue-500 bg-white ring-1 ring-blue-500/20' : 'opacity-40 grayscale border-transparent'
    )}
  >
    <span className="text-[10px] font-mono font-bold leading-none">{step.toString().padStart(2, '0')}</span>
    <div className={cn('h-1 w-3', active ? 'bg-blue-500' : 'bg-slate-200')} />
  </div>
);

function Vibe1() {
  return (
    <section className="w-full bg-[#F8FAFC] py-12 px-6 font-sans text-slate-900 overflow-hidden">
      {/* VIBE_1_START */}
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-xs font-bold tracking-[0.2em] text-slate-400 uppercase mb-1">System Overview</h2>
              <h1 className="text-2xl font-light tracking-tight text-slate-900 italic">
                RW Pharma <span className="text-blue-600 font-medium">Core</span>
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 text-[11px] font-mono text-slate-500">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                ANSM_COMPLIANT_V4.2
              </div>
              <button className="p-2 bg-slate-900 text-white hover:bg-blue-600 transition-colors">
                <Search className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <KpiCardV1 label="Commandes" value="545" icon={Package} subValue="+12.4%" />
            <KpiCardV1 label="Allocations" value="960" icon={ArrowRightLeft} subValue="98.2%" />
            <KpiCardV1 label="Couverture" value="87.3%" icon={Activity} subValue="Target: 90%" />
            <KpiCardV1 label="Processus" value="15" icon={ClipboardCheck} subValue="Active" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-5 shadow-[0_2px_4px_rgba(0,0,0,0.02)]">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase font-mono">Current Workflow</span>
              <div className="h-px w-12 bg-slate-200" />
              <span className="text-xs font-medium text-blue-600 uppercase tracking-wide">Phase II: Allocation Engine</span>
            </div>
            <div className="flex items-center gap-1 text-[10px] text-slate-400 font-mono">
              STEP 06 <ChevronRight className="w-3 h-3" /> 10
            </div>
          </div>
          <div className="flex items-center justify-between gap-1 overflow-x-auto pb-2">
            {[1, 2, 3, 4, 5, 6].map((s) => (
              <ProcessStepV1 key={s} step={s} active={true} />
            ))}
            {[7, 8, 9, 10].map((s) => (
              <ProcessStepV1 key={s} step={s} active={false} />
            ))}
          </div>
        </div>

        <div className="bg-white border border-slate-200 overflow-hidden shadow-[0_4px_6px_rgba(0,0,0,0.02)]">
          <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="w-3 h-3 text-slate-400" />
              <span className="text-[10px] font-bold tracking-widest text-slate-500 uppercase font-mono">Inventory Sample (1,735)</span>
            </div>
            <button className="text-[10px] text-blue-600 font-bold uppercase tracking-tighter hover:underline decoration-2 underline-offset-4">
              Full Catalog
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">CIP13 ID</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Product Nomenclature</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono text-right">PFHT</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {[
                  { cip: '3400936284521', name: 'Amoxicilline Sandoz 500mg', price: '12.45', variant: 'success' as const, status: 'Available' },
                  { cip: '3400930012942', name: 'Doliprane 1000mg Tab', price: '1.94', variant: 'warning' as const, status: 'Allocation' },
                  { cip: '3400938459214', name: 'Ventoline 100mcg Inhalateur', price: '4.82', variant: 'default' as const, status: 'Reserved' },
                ].map((row) => (
                  <tr key={row.cip} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="px-4 py-3 text-xs font-mono text-slate-500">{row.cip}</td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-700 tracking-tight">{row.name}</td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-600 text-right font-medium">{row.price}</td>
                    <td className="px-4 py-3">
                      <BadgeV1 variant={row.variant}>{row.status}</BadgeV1>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <MoreHorizontal className="w-4 h-4 text-slate-300 group-hover:text-slate-600 cursor-pointer inline-block" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 bg-slate-50/50 flex justify-between items-center text-[10px] text-slate-400 font-mono border-t border-slate-100">
            <span>SHOWING 3 OF 1,735 RECORDS</span>
            <div className="flex gap-4">
              <span className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500" /> IMPORT
              </span>
              <span className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-300" /> EXPORT
              </span>
            </div>
          </div>
        </div>
      </div>
      {/* VIBE_1_END */}
    </section>
  );
}

// ============================================================
// VIBE 2: Warm Professional
// ============================================================

const StatCardV2 = ({ label, value, icon: Icon, trend }: { label: string; value: string; icon: any; trend?: string }) => (
  <motion.div whileHover={{ y: -2 }} className="relative group overflow-hidden rounded-xl border border-white/5 bg-slate-900/40 p-4 backdrop-blur-sm">
    <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
    <div className="flex items-start justify-between">
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
        <h3 className="mt-1 text-xl font-semibold tracking-tight text-slate-100">{value}</h3>
        {trend && (
          <div className="mt-2 flex items-center gap-1 text-[10px] font-medium text-amber-400/80">
            <ArrowUpRight size={12} />
            <span>{trend} vs last month</span>
          </div>
        )}
      </div>
      <div className="rounded-lg bg-slate-800/50 p-2 text-amber-500 ring-1 ring-white/5 group-hover:ring-amber-500/30 transition-all">
        <Icon size={16} />
      </div>
    </div>
  </motion.div>
);

const BadgeV2 = ({ children, variant = 'default' }: { children: React.ReactNode; variant?: 'default' | 'success' | 'warning' }) => {
  const variants = {
    default: 'bg-slate-800 text-slate-400 border-slate-700',
    success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    warning: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  };
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-medium border uppercase tracking-tighter', variants[variant])}>
      {children}
    </span>
  );
};

const ProcessIndicatorV2 = () => {
  const phases = [
    { name: 'Collecte', steps: 3, current: 3 },
    { name: 'Allocation', steps: 4, current: 1 },
    { name: 'Cloture', steps: 3, current: 0 },
  ];
  return (
    <div className="rounded-xl border border-white/5 bg-slate-900/40 p-5 backdrop-blur-sm">
      <div className="mb-4 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-400">Flux de Processus Mensuel</h4>
        <span className="text-[10px] text-amber-500 font-mono">STEP 04/10</span>
      </div>
      <div className="relative flex justify-between gap-4">
        {phases.map((phase, i) => (
          <div key={phase.name} className="flex-1">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-[10px] font-medium text-slate-500">{phase.name}</span>
            </div>
            <div className="flex gap-1">
              {Array.from({ length: phase.steps }).map((_, stepIdx) => {
                const isActive = phase.current > stepIdx;
                const isCurrent = phase.current === stepIdx && i === 1;
                return (
                  <div
                    key={stepIdx}
                    className={cn(
                      'h-1.5 flex-1 rounded-full transition-all duration-700',
                      isActive ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]' : isCurrent ? 'bg-amber-500/40 animate-pulse' : 'bg-slate-800'
                    )}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3 rounded-lg bg-amber-500/5 border border-amber-500/10 p-2.5">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/20 text-amber-500">
          <Activity size={12} />
        </div>
        <p className="text-[11px] text-amber-200/70">
          <span className="font-bold text-amber-400">Phase Allocation:</span> Application de la strategie "Pro-rata" sur 420 lignes de stock.
        </p>
      </div>
    </div>
  );
};

function Vibe2() {
  const tableData = [
    { cip: '3400936214587', name: 'Humira 40mg Pen Injection', price: '742.15', status: 'Allocated' },
    { cip: '3400930014251', name: 'Eliquis 5mg Film-Coated Tab', price: '64.30', status: 'Pending' },
    { cip: '3400938452140', name: 'Enbrel 50mg Pre-filled Syringe', price: '812.90', status: 'Allocated' },
  ];
  return (
    <div className="w-full bg-slate-950 p-6 md:p-12 font-sans selection:bg-amber-500/30">
      {/* VIBE_2_START */}
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCardV2 label="Commandes" value="545" icon={Package} trend="+12%" />
          <StatCardV2 label="Allocations" value="960" icon={Layers} trend="+5.4%" />
          <StatCardV2 label="Couverture" value="87.3%" icon={Activity} />
          <StatCardV2 label="Processus" value="15" icon={ChevronRight} />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3 overflow-hidden rounded-2xl border border-white/5 bg-slate-900/40 backdrop-blur-md shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.02] px-5 py-4">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
                <h3 className="text-xs font-bold uppercase tracking-widest text-slate-100">Catalogue Produits</h3>
              </div>
              <button className="text-[10px] font-medium text-slate-500 hover:text-amber-400 transition-colors">Voir tout (1735)</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/5 bg-white/[0.01]">
                    <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">CIP13 / Produit</th>
                    <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">PFHT</th>
                    <th className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500 text-right">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {tableData.map((item, idx) => (
                    <tr key={idx} className="group hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex flex-col">
                          <span className="font-mono text-[10px] text-amber-500/60 leading-none mb-1">{item.cip}</span>
                          <span className="text-sm font-medium text-slate-200 group-hover:text-amber-100 transition-colors">{item.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-xs font-medium text-slate-400">{item.price} &euro;</td>
                      <td className="px-5 py-4 text-right">
                        <BadgeV2 variant={item.status === 'Allocated' ? 'success' : 'warning'}>{item.status}</BadgeV2>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-center border-t border-white/5 p-3">
              <MoreHorizontal size={14} className="text-slate-600" />
            </div>
          </div>
          <div className="lg:col-span-2 space-y-6">
            <ProcessIndicatorV2 />
            <div className="rounded-xl border border-white/5 bg-slate-900/40 p-5 backdrop-blur-sm relative overflow-hidden group">
              <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-amber-500/10 blur-2xl group-hover:bg-amber-500/20 transition-all duration-700" />
              <div className="relative">
                <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-4">Prochaines Echeances</h4>
                <div className="space-y-3">
                  {[
                    { title: 'Validation ANSM', time: 'Dans 2h', icon: CheckCircle2 },
                    { title: 'Export Excel Grossistes', time: 'Demain, 09:00', icon: CircleDot },
                  ].map((task, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-3 hover:border-amber-500/20 transition-all">
                      <div className="flex items-center gap-3">
                        <task.icon size={14} className={i === 0 ? 'text-emerald-500' : 'text-amber-500'} />
                        <span className="text-[11px] font-medium text-slate-300">{task.title}</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-500">{task.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* VIBE_2_END */}
    </div>
  );
}

// ============================================================
// VIBE 3: Nordic Clarity
// ============================================================

function Vibe3() {
  const products = [
    { cip: '3400936355321', name: 'Humira 40mg Injection', price: '482.50', status: 'In-Stock' },
    { cip: '3400930012457', name: 'Enbrel 50mg Solution', price: '215.10', status: 'Allocating' },
    { cip: '3400938472912', name: 'Stelara 45mg Vial', price: '1,120.00', status: 'Shortage' },
  ];
  const phases = [
    { name: 'Stock Collection', steps: 3, active: true },
    { name: 'Allocation Engine', steps: 4, active: false },
    { name: 'Distribution', steps: 3, active: false },
  ];
  return (
    <section className="w-full bg-[#F9FAF9] py-12 px-6 font-sans antialiased text-stone-800">
      {/* VIBE_3_START */}
      <div className="max-w-6xl mx-auto">
        <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <span className="text-[10px] uppercase tracking-[0.2em] text-stone-400 font-semibold mb-2 block">RW Pharma - Operations</span>
            <h2 className="text-2xl font-light text-stone-900 tracking-tight">
              Tableau de Bord <span className="text-stone-400">Mensuel</span>
            </h2>
          </div>
          <div className="flex items-center gap-2 text-xs text-stone-500 bg-white border border-stone-200 rounded-full px-3 py-1.5 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Processus d'allocation en cours - Phase 1
          </div>
        </header>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Commandes', value: '545', icon: Package, trend: '+12%' },
            { label: 'Allocations', value: '960', icon: Layers, trend: 'Stable' },
            { label: 'Couverture', value: '87.3%', icon: Activity, trend: '+2.4%' },
            { label: 'Processus', value: '15', icon: ChevronRight, trend: 'Actifs' },
          ].map((kpi, i) => (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              key={kpi.label}
              className="bg-white border border-stone-200 p-4 rounded-xl shadow-[0_2px_8px_rgba(0,0,0,0.02)] flex flex-col justify-between hover:border-stone-300 transition-colors"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="p-2 bg-stone-50 rounded-lg">
                  <kpi.icon size={16} className="text-stone-500" />
                </div>
                <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">{kpi.trend}</span>
              </div>
              <div>
                <p className="text-[11px] font-medium text-stone-400 uppercase tracking-wider">{kpi.label}</p>
                <p className="text-xl font-semibold text-stone-800 tracking-tight">{kpi.value}</p>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-white border border-stone-200 rounded-xl overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
            <div className="px-5 py-4 border-b border-stone-100 flex justify-between items-center">
              <h3 className="text-[13px] font-semibold text-stone-700">Catalogue & Disponibilité</h3>
              <button className="text-[11px] text-stone-400 hover:text-stone-600 font-medium transition-colors">Voir tout (1735)</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-stone-50/50">
                    <th className="px-5 py-3 text-[10px] font-semibold text-stone-400 uppercase tracking-wider">CIP13</th>
                    <th className="px-5 py-3 text-[10px] font-semibold text-stone-400 uppercase tracking-wider">Désignation</th>
                    <th className="px-5 py-3 text-[10px] font-semibold text-stone-400 uppercase tracking-wider">Prix PFHT</th>
                    <th className="px-5 py-3 text-[10px] font-semibold text-stone-400 uppercase tracking-wider">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {products.map((product, idx) => (
                    <tr key={idx} className="hover:bg-stone-50/40 transition-colors">
                      <td className="px-5 py-3.5 text-[12px] font-mono text-stone-500">{product.cip}</td>
                      <td className="px-5 py-3.5 text-[13px] font-medium text-stone-800">{product.name}</td>
                      <td className="px-5 py-3.5 text-[12px] text-stone-600 font-medium">{product.price} &euro;</td>
                      <td className="px-5 py-3.5">
                        <span
                          className={cn(
                            'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium',
                            product.status === 'In-Stock' ? 'bg-stone-100 text-stone-700' : product.status === 'Allocating' ? 'bg-amber-50 text-amber-700 border border-amber-100' : 'bg-stone-50 text-stone-400 border border-stone-100'
                          )}
                        >
                          {product.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="lg:col-span-5 flex flex-col gap-6">
            <div className="bg-[#8BA88E]/[0.03] border border-[#8BA88E]/20 rounded-xl p-5 relative overflow-hidden h-full">
              <div className="absolute top-0 right-0 p-8 opacity-[0.05] pointer-events-none">
                <Activity size={120} />
              </div>
              <h3 className="text-[13px] font-semibold text-stone-700 mb-6 flex items-center gap-2">
                <Activity size={14} className="text-[#8BA88E]" />
                Progression de l'Allocation
              </h3>
              <div className="space-y-6">
                {phases.map((phase, pIdx) => (
                  <div key={pIdx} className="relative">
                    <div className="flex justify-between items-center mb-2">
                      <span className={cn('text-[11px] font-bold uppercase tracking-tight', phase.active ? 'text-[#8BA88E]' : 'text-stone-400')}>
                        Phase {pIdx + 1}: {phase.name}
                      </span>
                      <span className="text-[10px] font-mono text-stone-400">{phase.active ? 'En cours' : pIdx === 0 ? 'Terminé' : 'En attente'}</span>
                    </div>
                    <div className="flex gap-1.5 h-1.5">
                      {Array.from({ length: phase.steps }).map((_, sIdx) => (
                        <div
                          key={sIdx}
                          className={cn(
                            'flex-1 rounded-full transition-all duration-700',
                            phase.active && sIdx === 0 ? 'bg-[#8BA88E] shadow-[0_0_8px_rgba(139,168,142,0.4)]' : pIdx === 0 ? 'bg-[#8BA88E]/40' : 'bg-stone-200'
                          )}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-8 pt-6 border-t border-stone-200/50">
                <div className="flex items-center justify-between">
                  <div className="flex -space-x-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="w-6 h-6 rounded-full border-2 border-white bg-stone-200 flex items-center justify-center text-[8px] font-bold text-stone-500">
                        {String.fromCharCode(64 + i)}
                      </div>
                    ))}
                    <div className="w-6 h-6 rounded-full border-2 border-white bg-stone-100 flex items-center justify-center text-[8px] font-bold text-stone-400">
                      +4
                    </div>
                  </div>
                  <button className="flex items-center gap-1.5 py-1.5 px-3 rounded-lg bg-stone-900 text-white text-[11px] font-medium hover:bg-stone-800 transition-all">
                    Action Requise
                    <ArrowUpRight size={12} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <footer className="mt-10 flex flex-col sm:flex-row justify-between items-center gap-4 text-[11px] text-stone-400">
          <div className="flex items-center gap-6">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 size={12} /> Conformité ANSM validée
            </span>
            <span className="flex items-center gap-1.5">
              <Activity size={12} /> Moteur d'allocation: Stratégie Équilibrée
            </span>
          </div>
          <div className="flex items-center gap-2">
            Rapport généré le 11 Mars 2026
            <MoreHorizontal size={14} className="ml-2 cursor-pointer hover:text-stone-600" />
          </div>
        </footer>
      </div>
      {/* VIBE_3_END */}
    </section>
  );
}

// ============================================================
// VIBE 4: Dark Executive
// ============================================================

interface KPICardV4Props {
  label: string;
  value: string;
  icon: React.ReactNode;
  trend: string;
  color: 'blue' | 'emerald';
}

const KPICardV4 = ({ label, value, icon, trend, color }: KPICardV4Props) => {
  const colorClasses = {
    blue: 'text-blue-400 group-hover:text-blue-300 bg-blue-500/10 border-blue-500/20 shadow-blue-500/5',
    emerald: 'text-emerald-400 group-hover:text-emerald-300 bg-emerald-500/10 border-emerald-500/20 shadow-emerald-500/5',
  };
  const trendClasses = {
    blue: 'text-blue-400/80 bg-blue-500/5',
    emerald: 'text-emerald-400/80 bg-emerald-500/5',
  };
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="group bg-slate-900/50 backdrop-blur-md border border-white/5 rounded-xl p-4 min-w-[140px] shadow-lg transition-all hover:bg-slate-800/60 hover:border-white/10"
    >
      <div className="flex items-center justify-between mb-3">
        <div className={cn('p-2 rounded-lg border transition-colors', colorClasses[color])}>{icon}</div>
        <div className={cn('text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 uppercase tracking-tighter', trendClasses[color])}>
          {trend}
          {trend.includes('%') && <ArrowUpRight className="w-2.5 h-2.5" />}
        </div>
      </div>
      <div>
        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</div>
        <div className="text-xl font-bold text-white mt-0.5 tracking-tight">{value}</div>
      </div>
    </motion.div>
  );
};

function Vibe4() {
  const products = [
    { cip13: '3400930012345', name: 'Amoxicilline 500mg Gelule', pfht: '4.12', status: 'In Stock' },
    { cip13: '3400930056789', name: 'Ibuprofene 400mg Comprime', pfht: '2.85', status: 'Allocated' },
    { cip13: '3400930091011', name: 'Paracetamol 1g Sachet', pfht: '1.98', status: 'Pending' },
  ];
  const phases = [
    { name: 'Phase 1: Collecte', steps: 3, active: true },
    { name: 'Phase 2: Allocation', steps: 4, active: true },
    { name: 'Phase 3: Validation', steps: 3, active: false },
  ];
  return (
    <div className="w-full bg-[#030712] text-slate-200 p-8 font-sans selection:bg-blue-500/30">
      {/* VIBE_4_START */}
      <div className="max-w-6xl mx-auto space-y-8 relative">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-blue-600/10 blur-[120px] rounded-full" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-emerald-600/5 blur-[120px] rounded-full" />

        <header className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
              <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold">Système RW Pharma Actif</span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Console Executive</h1>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 w-full lg:w-auto">
            <KPICardV4 label="Commandes" value="545" icon={<Package className="w-4 h-4" />} trend="+12.5%" color="blue" />
            <KPICardV4 label="Allocations" value="960" icon={<Activity className="w-4 h-4" />} trend="+4.2%" color="emerald" />
            <KPICardV4 label="Couverture" value="87.3%" icon={<ShieldCheck className="w-4 h-4" />} trend="Optimal" color="blue" />
            <KPICardV4 label="Processus" value="15" icon={<Layers className="w-4 h-4" />} trend="Actif" color="emerald" />
          </div>
        </header>

        <div className="grid lg:grid-cols-3 gap-6 relative z-10">
          <div className="lg:col-span-2 group">
            <div className="h-full bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-xl overflow-hidden shadow-2xl transition-all duration-300 hover:border-blue-500/20">
              <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Catalogue Produits (Aperçu)</h3>
                <button className="text-[10px] text-blue-400 font-medium flex items-center gap-1 hover:text-blue-300 transition-colors">
                  Voir tout <ChevronRight className="w-3 h-3" />
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-[10px] uppercase text-slate-500 border-b border-white/5">
                      <th className="px-6 py-3 font-semibold">Code CIP13</th>
                      <th className="px-6 py-3 font-semibold">Produit</th>
                      <th className="px-6 py-3 font-semibold">Prix PFHT</th>
                      <th className="px-6 py-3 font-semibold text-right">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {products.map((item, idx) => (
                      <tr key={idx} className="hover:bg-blue-500/5 transition-colors cursor-default border-b border-white/[0.02] last:border-0">
                        <td className="px-6 py-4 font-mono text-[12px] text-blue-400/80">{item.cip13}</td>
                        <td className="px-6 py-4 font-medium text-slate-200">{item.name}</td>
                        <td className="px-6 py-4 text-slate-400">{item.pfht} &euro;</td>
                        <td className="px-6 py-4 text-right">
                          <span
                            className={cn(
                              'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                              item.status === 'In Stock' && 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
                              item.status === 'Allocated' && 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
                              item.status === 'Pending' && 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                            )}
                          >
                            {item.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="h-full bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-xl p-6 shadow-2xl transition-all duration-300 hover:border-emerald-500/20">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Processus Mensuel</h3>
                <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-bold border border-emerald-500/20">PHASE 2</span>
              </div>
              <div className="space-y-8 relative">
                <div className="absolute left-[11px] top-2 bottom-2 w-px bg-slate-800" />
                {phases.map((phase, pIdx) => (
                  <div key={pIdx} className="relative z-10">
                    <div className="flex items-center gap-4 mb-3">
                      <div
                        className={cn(
                          'w-[22px] h-[22px] rounded-full flex items-center justify-center ring-4 ring-[#030712]',
                          phase.active ? 'bg-emerald-500 text-slate-900' : 'bg-slate-800 text-slate-500'
                        )}
                      >
                        {phase.active ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                      </div>
                      <span className={cn('text-[11px] font-bold uppercase tracking-wide', phase.active ? 'text-slate-100' : 'text-slate-500')}>
                        {phase.name}
                      </span>
                    </div>
                    <div className="ml-8 flex gap-1.5">
                      {Array.from({ length: phase.steps }).map((_, sIdx) => (
                        <div
                          key={sIdx}
                          className={cn(
                            'h-1.5 w-6 rounded-full transition-all duration-500',
                            phase.active ? 'bg-emerald-500/30 shadow-[0_0_8px_rgba(16,185,129,0.2)]' : 'bg-slate-800'
                          )}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-10 p-4 rounded-lg bg-blue-500/5 border border-blue-500/10 flex items-start gap-3">
                <div className="p-1.5 rounded-md bg-blue-500/20 text-blue-400 mt-0.5">
                  <FlaskConical className="w-3.5 h-3.5" />
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-blue-100">Strategie: Parallel Import Max</p>
                  <p className="text-[10px] text-blue-400/80 mt-0.5 leading-relaxed">Optimization des stocks entre 11 clients europeens en cours.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* VIBE_4_END */}
    </div>
  );
}

// ============================================================
// VIBE 5: Notion Minimal
// ============================================================

function Vibe5() {
  const [activeStep, setActiveStep] = useState(3);
  const kpis = [
    { label: 'Commandes', value: '545', icon: Package, trend: '+12%' },
    { label: 'Allocations', value: '960', icon: Layers, trend: '+5%' },
    { label: 'Couverture', value: '87.3%', icon: Activity, trend: 'Stable' },
    { label: 'Processus', value: '15', icon: BarChart3, trend: 'En cours' },
  ];
  const products = [
    { cip13: '3400930001234', name: 'Amoxicilline 500mg Gelule', price: '4.12', status: 'Disponible' },
    { cip13: '3400930005678', name: 'Paracetamol 1g Comprime', price: '1.85', status: 'Allocation' },
    { cip13: '3400930009101', name: 'Ibuprofene 400mg Caps', price: '3.44', status: 'Rupture' },
  ];
  const steps = [
    { id: 1, phase: 'Collecte' },
    { id: 2, phase: 'Collecte' },
    { id: 3, phase: 'Collecte' },
    { id: 4, phase: 'Allocation' },
    { id: 5, phase: 'Allocation' },
    { id: 6, phase: 'Allocation' },
    { id: 7, phase: 'Allocation' },
    { id: 8, phase: 'Validation' },
    { id: 9, phase: 'Validation' },
    { id: 10, phase: 'Validation' },
  ];

  return (
    <div className="w-full max-w-6xl mx-auto p-8 font-sans text-[#37352F] bg-white selection:bg-[#2EAADC33]">
      {/* VIBE_5_START */}
      <header className="mb-10">
        <div className="flex items-center gap-2 text-[13px] text-[#7A7A7B] mb-4">
          <span>RW Pharma</span>
          <ChevronRight size={14} strokeWidth={1.5} />
          <span className="text-[#37352F] font-medium">Tableau de bord operationnel</span>
        </div>
        <div className="grid grid-cols-4 gap-px bg-[#EDEDED] border border-[#EDEDED] rounded-lg overflow-hidden">
          {kpis.map((kpi, i) => (
            <div key={i} className="bg-white p-5 hover:bg-[#F7F7F5] transition-colors cursor-default group">
              <div className="flex items-center justify-between mb-2">
                <div className="p-1.5 rounded bg-[#F7F7F5] group-hover:bg-white transition-colors">
                  <kpi.icon size={16} strokeWidth={1.5} className="text-[#7A7A7B]" />
                </div>
                <span className="text-[11px] font-medium text-[#008151] bg-[#E9F3EE] px-1.5 py-0.5 rounded-sm uppercase tracking-wider">{kpi.trend}</span>
              </div>
              <div className="text-2xl font-semibold tracking-tight">{kpi.value}</div>
              <div className="text-[13px] text-[#7A7A7B] mt-1">{kpi.label}</div>
            </div>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-12 gap-8">
        <div className="col-span-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[15px] font-semibold flex items-center gap-2">
              Catalogue Produits <span className="text-[#7A7A7B] font-normal">1735</span>
            </h3>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-[13px] text-[#7A7A7B] px-2 py-1 hover:bg-[#F7F7F5] rounded cursor-pointer transition-colors">
                <Search size={14} />
                <span>Rechercher</span>
              </div>
              <div className="flex items-center gap-1 text-[13px] text-[#37352F] font-medium px-2 py-1 bg-[#F7F7F5] hover:bg-[#EFEFEF] rounded cursor-pointer transition-colors">
                <Plus size={14} />
                <span>Ajouter</span>
              </div>
            </div>
          </div>
          <div className="border-t border-[#EDEDED]">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="text-[#7A7A7B] border-b border-[#EDEDED]">
                  <th className="py-3 px-2 font-medium w-32">CIP13</th>
                  <th className="py-3 px-2 font-medium">Nom du produit</th>
                  <th className="py-3 px-2 font-medium text-right">PFHT</th>
                  <th className="py-3 px-2 font-medium w-24">Statut</th>
                  <th className="py-3 px-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {products.map((product, i) => (
                  <tr key={i} className="group border-b border-[#EDEDED] hover:bg-[#F7F7F5] transition-colors">
                    <td className="py-3 px-2 font-mono text-[12px] text-[#7A7A7B]">{product.cip13}</td>
                    <td className="py-3 px-2 font-medium">{product.name}</td>
                    <td className="py-3 px-2 text-right text-[#7A7A7B]">{product.price} &euro;</td>
                    <td className="py-3 px-2">
                      <span
                        className={cn(
                          'px-2 py-0.5 rounded text-[11px] font-medium',
                          product.status === 'Disponible' && 'bg-[#E9F3EE] text-[#008151]',
                          product.status === 'Allocation' && 'bg-[#FDF3E7] text-[#D9730D]',
                          product.status === 'Rupture' && 'bg-[#FBE4E4] text-[#EB5757]'
                        )}
                      >
                        {product.status}
                      </span>
                    </td>
                    <td className="py-3 px-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <MoreHorizontal size={14} className="text-[#7A7A7B] cursor-pointer" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 flex items-center text-[13px] text-[#7A7A7B] hover:text-[#37352F] cursor-pointer transition-colors w-fit">
              <span>Voir tout le catalogue</span>
              <ArrowUpRight size={14} className="ml-1" />
            </div>
          </div>
        </div>

        <div className="col-span-4 border-l border-[#EDEDED] pl-8">
          <h3 className="text-[14px] font-semibold mb-6 flex items-center justify-between">
            Processus Mensuel
            <span className="text-[11px] font-normal text-[#7A7A7B] border border-[#EDEDED] px-1.5 rounded">Mars 2026</span>
          </h3>
          <div className="space-y-1">
            {['Collecte', 'Allocation', 'Validation'].map((phaseName) => {
              const phaseSteps = steps.filter((s) => s.phase === phaseName);
              return (
                <div key={phaseName} className="mb-6">
                  <div className="text-[11px] uppercase tracking-widest text-[#7A7A7B] font-bold mb-3 px-2">{phaseName}</div>
                  <div className="space-y-1">
                    {phaseSteps.map((step) => {
                      const isCompleted = step.id < activeStep;
                      const isActive = step.id === activeStep;
                      return (
                        <div
                          key={step.id}
                          onClick={() => setActiveStep(step.id)}
                          className={cn(
                            'group flex items-center gap-3 px-2 py-2 rounded text-[13px] cursor-pointer transition-all',
                            isActive ? 'bg-[#F7F7F5] shadow-[inset_2px_0_0_0_#37352F]' : 'hover:bg-[#F7F7F5]'
                          )}
                        >
                          <div
                            className={cn(
                              'w-4 h-4 rounded-full border flex items-center justify-center text-[9px] transition-colors',
                              isCompleted ? 'bg-[#37352F] border-[#37352F] text-white' : 'border-[#EDEDED] text-[#7A7A7B]',
                              isActive ? 'border-[#37352F] ring-2 ring-[#37352F]/10' : ''
                            )}
                          >
                            {isCompleted ? '\u2713' : step.id}
                          </div>
                          <span className={cn(isActive ? 'font-medium' : 'text-[#7A7A7B]', isCompleted ? 'line-through opacity-50' : '')}>
                            Étape {step.id}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <button className="w-full mt-4 py-2 px-4 bg-[#37352F] hover:bg-[#1A1A1A] text-white rounded text-[13px] font-medium transition-colors">
            Finaliser la phase actuelle
          </button>
        </div>
      </div>
      {/* VIBE_5_END */}
    </div>
  );
}

// ============================================================
// MAIN PAGE: All 5 Vibes
// ============================================================

export default function VibesSelectionPage() {
  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-7xl mx-auto py-8 px-4">
        <h1 className="text-3xl font-bold text-center mb-2">Choisis ton Design System</h1>
        <p className="text-center text-gray-500 mb-12">Scroll pour voir les 5 vibes, puis dis-moi laquelle tu preferes (ex: "vibe 3")</p>
      </div>

      {/* Vibe 1 */}
      <div className="relative">
        <div className="sticky top-0 z-20 bg-slate-900 text-white py-2 px-6 text-sm font-bold tracking-widest uppercase text-center">
          Vibe 1 — Clinical Precision
        </div>
        <Vibe1 />
      </div>

      {/* Vibe 2 */}
      <div className="relative">
        <div className="sticky top-0 z-20 bg-amber-600 text-white py-2 px-6 text-sm font-bold tracking-widest uppercase text-center">
          Vibe 2 — Warm Professional
        </div>
        <Vibe2 />
      </div>

      {/* Vibe 3 */}
      <div className="relative">
        <div className="sticky top-0 z-20 bg-[#8BA88E] text-white py-2 px-6 text-sm font-bold tracking-widest uppercase text-center">
          Vibe 3 — Nordic Clarity
        </div>
        <Vibe3 />
      </div>

      {/* Vibe 4 */}
      <div className="relative">
        <div className="sticky top-0 z-20 bg-blue-900 text-white py-2 px-6 text-sm font-bold tracking-widest uppercase text-center">
          Vibe 4 — Dark Executive
        </div>
        <Vibe4 />
      </div>

      {/* Vibe 5 */}
      <div className="relative">
        <div className="sticky top-0 z-20 bg-[#37352F] text-white py-2 px-6 text-sm font-bold tracking-widest uppercase text-center">
          Vibe 5 — Notion Minimal
        </div>
        <Vibe5 />
      </div>
    </div>
  );
}

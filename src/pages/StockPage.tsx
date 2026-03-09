import { motion } from 'framer-motion'
import { Warehouse } from 'lucide-react'
import StockLotView from '@/components/stock/StockLotView'

export default function StockPage() {
  return (
    <div className="p-4 md:p-7 lg:p-8 space-y-6 max-w-[1400px] mx-auto ivory-page-glow overflow-x-hidden">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative z-10"
      >
        <div className="flex items-center gap-3.5">
          <div
            className="h-11 w-11 rounded-2xl flex items-center justify-center shadow-sm"
            style={{ background: 'linear-gradient(135deg, rgba(13,148,136,0.12), rgba(13,148,136,0.08))' }}
          >
            <Warehouse className="h-5 w-5" style={{ color: 'var(--ivory-accent)' }} />
          </div>
          <div>
            <h2 className="ivory-heading text-xl md:text-2xl">Stock Collecte</h2>
            <p className="text-[12px] mt-0.5" style={{ color: 'var(--ivory-text-muted)' }}>
              Vue globale du stock recu par produit et par lot — Quantite, Alloue, Restant
            </p>
          </div>
        </div>
      </motion.div>

      {/* Stock lot view (all processes) */}
      <StockLotView showKpis maxHeight="calc(100vh - 220px)" />
    </div>
  )
}

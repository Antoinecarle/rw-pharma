import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Clock, ArrowRight, Package } from 'lucide-react'
import { motion } from 'framer-motion'

interface WaitingStockBannerProps {
  processMonth: number
  processYear: number
  ordersCount: number
  onSkipToStock: () => void
}

const MONTH_NAMES = [
  'Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre',
]

export default function WaitingStockBanner({ processMonth, processYear, ordersCount, onSkipToStock }: WaitingStockBannerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card className="border-amber-200/60 dark:border-amber-800/40 bg-gradient-to-r from-amber-50/50 to-orange-50/30 dark:from-amber-950/20 dark:to-orange-950/10">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-amber-100 dark:bg-amber-900 flex items-center justify-center shrink-0">
              <Clock className="h-6 w-6 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-amber-800 dark:text-amber-200">
                En attente du stock des grossistes
              </h3>
              <p className="text-sm text-amber-700/80 dark:text-amber-300/60 mt-1">
                Les commandes de {MONTH_NAMES[processMonth - 1]} {processYear} ont ete envoyees aux grossistes
                ({ordersCount} commandes). Les grossistes collectent actuellement le stock.
                Vous pourrez passer a la phase suivante des reception du premier fichier de stock.
              </p>
            </div>
            <Button
              onClick={onSkipToStock}
              className="gap-2 shrink-0 bg-amber-600 hover:bg-amber-700 text-white"
            >
              <Package className="h-4 w-4" />
              Importer du stock
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

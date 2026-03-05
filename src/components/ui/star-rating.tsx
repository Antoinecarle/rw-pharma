import { motion } from 'framer-motion'
import { Star } from 'lucide-react'

interface StarRatingProps {
  value: number // 1-5
  onChange: (value: number) => void
  max?: number
  labels?: string[]
  className?: string
}

export default function StarRating({
  value,
  onChange,
  max = 5,
  labels = ['Haute priorite', 'Priorite elevee', 'Normal', 'Basse priorite', 'Tres basse'],
  className = '',
}: StarRatingProps) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center gap-1">
        {Array.from({ length: max }, (_, i) => {
          const level = i + 1
          const isActive = level <= value
          return (
            <motion.button
              key={level}
              type="button"
              onClick={() => onChange(level)}
              whileTap={{ scale: 0.85 }}
              whileHover={{ scale: 1.15 }}
              className="focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
            >
              <motion.div
                animate={isActive ? { scale: [1, 1.2, 1] } : { scale: 1 }}
                transition={{ duration: 0.2 }}
              >
                <Star
                  className={`h-6 w-6 transition-colors duration-150 ${
                    isActive
                      ? 'text-amber-400 fill-amber-400 drop-shadow-sm'
                      : 'text-muted-foreground/30'
                  }`}
                />
              </motion.div>
            </motion.button>
          )
        })}
      </div>
      {labels[value - 1] && (
        <motion.p
          key={value}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xs text-muted-foreground"
        >
          {labels[value - 1]}
        </motion.p>
      )}
    </div>
  )
}

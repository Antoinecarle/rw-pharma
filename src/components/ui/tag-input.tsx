import { useState, useRef, type KeyboardEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TagInputProps {
  value: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  className?: string
  getTagColor?: (tag: string) => string
}

function defaultGetTagColor(tag: string): string {
  // Parse YYYY-MM format and color by proximity
  const match = tag.match(/^(\d{4})-(\d{2})$/)
  if (!match) return 'bg-muted text-foreground'
  const date = new Date(parseInt(match[1]), parseInt(match[2]) - 1)
  const now = new Date()
  const months = (date.getFullYear() - now.getFullYear()) * 12 + date.getMonth() - now.getMonth()
  if (months < 0) return 'bg-red-100 text-red-800 border-red-200'
  if (months < 3) return 'bg-red-50 text-red-700 border-red-200'
  if (months < 6) return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-emerald-50 text-emerald-700 border-emerald-200'
}

export default function TagInput({
  value,
  onChange,
  placeholder = 'Ajouter une date (MM/YYYY)...',
  className = '',
  getTagColor = defaultGetTagColor,
}: TagInputProps) {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const normalizeDate = (raw: string): string | null => {
    const trimmed = raw.trim()
    // MM/YYYY → YYYY-MM
    const mmYyyy = trimmed.match(/^(\d{2})\/(\d{4})$/)
    if (mmYyyy) return `${mmYyyy[2]}-${mmYyyy[1]}`
    // YYYY-MM
    const iso = trimmed.match(/^(\d{4})-(\d{2})$/)
    if (iso) return trimmed
    return null
  }

  const addTag = (raw: string) => {
    const normalized = normalizeDate(raw)
    if (!normalized) return
    if (value.includes(normalized)) return
    onChange([...value, normalized])
    setInput('')
  }

  const removeTag = (tag: string) => {
    onChange(value.filter(t => t !== tag))
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(input)
    }
    if (e.key === 'Backspace' && !input && value.length > 0) {
      removeTag(value[value.length - 1])
    }
  }

  const formatDisplay = (tag: string) => {
    const m = tag.match(/^(\d{4})-(\d{2})$/)
    if (!m) return tag
    return `${m[2]}/${m[1]}`
  }

  return (
    <div
      className={cn(
        'flex flex-wrap gap-1.5 items-center rounded-lg border border-input bg-background px-3 py-2 min-h-[40px] cursor-text',
        'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1',
        className
      )}
      onClick={() => inputRef.current?.focus()}
    >
      <AnimatePresence mode="popLayout">
        {value.map((tag) => (
          <motion.span
            key={tag}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.6, opacity: 0 }}
            layout
            className={cn(
              'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium',
              getTagColor(tag)
            )}
          >
            <Calendar className="h-3 w-3 opacity-60" />
            {formatDisplay(tag)}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeTag(tag) }}
              className="rounded-full hover:bg-black/10 p-0.5 -mr-0.5"
            >
              <X className="h-3 w-3" />
            </button>
          </motion.span>
        ))}
      </AnimatePresence>
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => { if (input.trim()) addTag(input) }}
        placeholder={value.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[100px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  )
}

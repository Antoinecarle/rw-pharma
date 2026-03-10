import { supabase } from '@/lib/supabase'

/**
 * Format a date string into a French relative time string (e.g. "il y a 5 min").
 */
export function formatDistanceToNow(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) return "A l'instant"
  if (diffMin < 60) return `Il y a ${diffMin} min`
  if (diffHour < 24) return `Il y a ${diffHour}h`
  if (diffDay === 1) return 'Hier'
  if (diffDay < 7) return `Il y a ${diffDay}j`
  if (diffDay < 30) return `Il y a ${Math.floor(diffDay / 7)} sem.`
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

/**
 * Insert a notification into the database.
 * Call this from mutation onSuccess handlers.
 */
export async function createNotification(params: {
  type: string
  title: string
  message?: string
  monthly_order_id?: string
}) {
  const { error } = await supabase.from('notifications').insert({
    type: params.type,
    title: params.title,
    message: params.message ?? null,
    monthly_order_id: params.monthly_order_id ?? null,
    is_read: false,
  })
  if (error) {
    console.error('Failed to create notification:', error.message)
  }
}

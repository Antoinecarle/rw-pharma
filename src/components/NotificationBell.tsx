import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Bell, Check, CheckCheck, Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from '@/lib/notifications'

export interface Notification {
  id: string
  type: string | null
  title: string
  message: string | null
  monthly_order_id: string | null
  is_read: boolean
  created_at: string
}

const TYPE_COLORS: Record<string, string> = {
  process_created: 'rgba(59,130,246,0.12)',
  allocation_completed: 'rgba(16,185,129,0.12)',
  process_completed: 'rgba(139,92,246,0.12)',
  info: 'rgba(13,148,136,0.08)',
}

const TYPE_DOT_COLORS: Record<string, string> = {
  process_created: '#3b82f6',
  allocation_completed: '#10b981',
  process_completed: '#8b5cf6',
  info: 'var(--ivory-teal)',
}

export default function NotificationBell() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return data as Notification[]
    },
    refetchInterval: 30_000,
  })

  const unreadCount = notifications.filter((n) => !n.is_read).length

  const markReadMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const markAllReadMut = useMutation({
    mutationFn: async () => {
      const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id)
      if (unreadIds.length === 0) return
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .in('id', unreadIds)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  // Realtime subscription for new notifications
  useEffect(() => {
    const channel = supabase
      .channel('notifications-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['notifications'] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-xl"
          style={{
            background: open ? 'rgba(0,0,0,0.04)' : 'transparent',
            border: '1px solid rgba(0,0,0,0.06)',
          }}
        >
          <Bell className="h-4 w-4" style={{ color: 'var(--ivory-text-muted)' }} />
          {unreadCount > 0 && (
            <span
              className="absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
              style={{ background: '#ef4444' }}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[360px] p-0 rounded-2xl overflow-hidden"
        style={{
          border: '1px solid rgba(0,0,0,0.08)',
          boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}
        >
          <h3 className="ivory-heading text-[14px]">Notifications</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-[11px] gap-1 rounded-lg px-2"
              style={{ color: 'var(--ivory-accent)' }}
              onClick={() => markAllReadMut.mutate()}
              disabled={markAllReadMut.isPending}
            >
              <CheckCheck className="h-3 w-3" />
              Tout lire
            </Button>
          )}
        </div>

        {/* Notification list */}
        <div className="max-h-[380px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <div
                className="h-12 w-12 rounded-2xl flex items-center justify-center"
                style={{ background: 'rgba(13,148,136,0.06)' }}
              >
                <Inbox className="h-5 w-5" style={{ color: 'var(--ivory-text-muted)' }} />
              </div>
              <p className="text-[13px] font-medium" style={{ color: 'var(--ivory-text-muted)' }}>
                Aucune notification
              </p>
            </div>
          ) : (
            notifications.map((notif) => (
              <button
                key={notif.id}
                className={cn(
                  'w-full text-left px-4 py-3 transition-colors duration-150 flex items-start gap-3',
                  !notif.is_read && 'bg-[rgba(13,148,136,0.02)]',
                  'hover:bg-[rgba(0,0,0,0.02)]'
                )}
                style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}
                onClick={() => {
                  if (!notif.is_read) markReadMut.mutate(notif.id)
                }}
              >
                {/* Dot indicator */}
                <div className="mt-1.5 shrink-0">
                  <div
                    className={cn('h-2 w-2 rounded-full', notif.is_read && 'opacity-0')}
                    style={{
                      background: TYPE_DOT_COLORS[notif.type ?? 'info'] ?? 'var(--ivory-teal)',
                    }}
                  />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className={cn(
                        'text-[13px] leading-snug',
                        notif.is_read ? 'font-normal' : 'font-semibold'
                      )}
                      style={{ color: 'var(--ivory-text-heading)' }}
                    >
                      {notif.title}
                    </p>
                    {!notif.is_read && (
                      <Check className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: 'var(--ivory-text-muted)' }} />
                    )}
                  </div>
                  {notif.message && (
                    <p
                      className="text-[12px] mt-0.5 line-clamp-2"
                      style={{ color: 'var(--ivory-text-muted)' }}
                    >
                      {notif.message}
                    </p>
                  )}
                  <p
                    className="text-[10px] mt-1"
                    style={{ color: 'var(--ivory-text-muted)', opacity: 0.7 }}
                  >
                    {formatDistanceToNow(notif.created_at)}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Pill, Lock, Mail, UserPlus, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

export default function AcceptInvitationPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [invitation, setInvitation] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  useEffect(() => {
    if (!token) return
    supabase
      .from('customer_invitations')
      .select('*, customers(name)')
      .eq('token', token)
      .eq('status', 'pending')
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (err || !data) {
          setError('Invitation invalide ou expiree.')
        } else if (new Date(data.expires_at) < new Date()) {
          setError('Cette invitation a expire.')
        } else {
          setInvitation(data)
        }
        setLoading(false)
      })
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      toast.error('Les mots de passe ne correspondent pas')
      return
    }
    if (password.length < 6) {
      toast.error('Le mot de passe doit contenir au moins 6 caracteres')
      return
    }

    setSubmitting(true)
    try {
      // 1. Create Supabase auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: invitation.email,
        password,
      })
      if (authError) throw authError
      if (!authData.user) throw new Error('Erreur creation compte')

      // 2. Link to customer (store email for admin display)
      const { error: linkError } = await supabase
        .from('customer_users')
        .insert({
          auth_user_id: authData.user.id,
          customer_id: invitation.customer_id,
          role: invitation.role,
          email: invitation.email,
        })
      if (linkError) throw linkError

      // 3. Mark invitation as accepted
      await supabase
        .from('customer_invitations')
        .update({ status: 'accepted', accepted_at: new Date().toISOString() })
        .eq('id', invitation.id)

      toast.success('Compte cree avec succes !')
      navigate('/portal')
    } catch (err: any) {
      toast.error(err.message || 'Erreur lors de la creation du compte')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-background p-4">
        <Card className="max-w-sm w-full">
          <CardContent className="flex flex-col items-center py-10 text-center">
            <AlertTriangle className="h-10 w-10 text-amber-500 mb-4" />
            <p className="text-[14px] font-semibold mb-1">Invitation invalide</p>
            <p className="text-[12px] text-muted-foreground">{error}</p>
            <Button size="sm" className="mt-6" onClick={() => navigate('/login')}>
              Retour a la connexion
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 mb-6 justify-center">
          <div className="h-10 w-10 rounded-lg bg-primary/8 flex items-center justify-center">
            <Pill className="h-5 w-5 text-primary" />
          </div>
          <span className="text-xl font-semibold tracking-tight">RW Pharma</span>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[16px] flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Creer votre compte
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4 p-3 rounded-xl text-[12px]" style={{ background: 'rgba(13,148,136,0.04)', border: '1px solid rgba(13,148,136,0.1)' }}>
              <p style={{ color: 'var(--ivory-text-muted)' }}>
                Vous etes invite a rejoindre le portail client pour
              </p>
              <p className="font-semibold mt-0.5" style={{ color: 'var(--ivory-text-heading)' }}>
                {(invitation.customers as any)?.name ?? 'Client'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div className="space-y-1.5">
                <Label className="text-[13px]">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
                  <Input value={invitation.email} disabled className="pl-9 h-10 text-[13px]" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px]">Mot de passe</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="pl-9 h-10 text-[13px]"
                    placeholder="Min. 6 caracteres"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[13px]">Confirmer le mot de passe</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="pl-9 h-10 text-[13px]"
                    placeholder="Repetez le mot de passe"
                  />
                </div>
              </div>
              <Button type="submit" className="w-full h-10 text-[13px]" disabled={submitting}>
                {submitting ? 'Creation...' : 'Creer mon compte'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

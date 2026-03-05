import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Pill, Lock, Mail, ArrowRight, Package, TrendingUp, Shield } from 'lucide-react'
import { toast } from 'sonner'

export default function LoginPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await signIn(email, password)
      toast.success('Connexion reussie')
    } catch {
      toast.error('Email ou mot de passe incorrect')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-screen">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden bg-gradient-to-br from-emerald-600 via-primary to-teal-600">
        <div className="absolute -top-32 -left-32 w-[500px] h-[500px] bg-white/[0.04] rounded-full" />
        <div className="absolute top-1/3 -right-24 w-72 h-72 bg-white/[0.04] rounded-full" />
        <div className="absolute -bottom-20 left-1/4 w-56 h-56 bg-white/[0.04] rounded-full" />

        <div className="relative z-10 flex flex-col justify-between p-14 text-white w-full">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-white/15 backdrop-blur-sm flex items-center justify-center">
                <Pill className="h-4.5 w-4.5" />
              </div>
              <span className="text-lg font-semibold tracking-tight">RW Pharma</span>
            </div>
            <p className="text-white/50 text-xs mt-1 font-medium">Courtage pharmaceutique</p>
          </div>

          <div className="space-y-8 max-w-lg">
            <div>
              <h2 className="text-3xl font-bold leading-tight tracking-tight">Gerez vos allocations</h2>
              <h2 className="text-3xl font-bold leading-tight tracking-tight text-white/70">en toute simplicite</h2>
            </div>
            <p className="text-white/60 text-base leading-relaxed">
              Import parallele de medicaments en Europe. Collecte des commandes et allocation des stocks automatisees.
            </p>

            <div className="space-y-2.5">
              {[
                { icon: Package, label: '1 760+ produits', desc: 'Catalogue pharmaceutique complet' },
                { icon: TrendingUp, label: 'Allocation optimisee', desc: 'Quotas grossistes en temps reel' },
                { icon: Shield, label: 'Conformite ANSM', desc: 'Controle des produits bloques' },
              ].map((feat) => (
                <div key={feat.label} className="flex items-center gap-3 bg-white/[0.08] backdrop-blur-sm rounded-xl px-4 py-3">
                  <div className="h-8 w-8 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                    <feat.icon className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <p className="font-medium text-[13px] leading-tight">{feat.label}</p>
                    <p className="text-white/50 text-[11px] mt-0.5">{feat.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="text-white/30 text-[11px]">
            &copy; {new Date().getFullYear()} RW Pharma. Tous droits reserves.
          </p>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-[380px] animate-fade-in">
          <div className="lg:hidden flex items-center gap-2.5 mb-10 justify-center">
            <div className="h-10 w-10 rounded-lg bg-primary/8 flex items-center justify-center">
              <Pill className="h-5 w-5 text-primary" />
            </div>
            <span className="text-xl font-semibold text-foreground tracking-tight">RW Pharma</span>
          </div>

          <Card className="border-0 shadow-lg shadow-black/[0.03] lg:border lg:shadow-xl lg:shadow-black/[0.04]">
            <CardHeader className="space-y-1 pb-2">
              <CardTitle className="text-xl font-semibold tracking-tight">Connexion</CardTitle>
              <CardDescription className="text-[13px]">
                Entrez vos identifiants pour acceder a la plateforme
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-3.5">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-[13px]">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="julie@rwpharma.com"
                      required
                      autoComplete="email"
                      className="pl-9 h-10 text-[13px]"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-[13px]">Mot de passe</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      className="pl-9 h-10 text-[13px]"
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full h-10 font-medium text-[13px] mt-1" disabled={loading}>
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <div className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Connexion...
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      Se connecter
                      <ArrowRight className="h-3.5 w-3.5" />
                    </div>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          <p className="text-center text-[11px] text-muted-foreground/60 mt-6 lg:hidden">
            &copy; {new Date().getFullYear()} RW Pharma
          </p>
        </div>
      </div>
    </div>
  )
}

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
      {/* Left panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-primary via-emerald-600 to-teal-700">
        {/* Decorative circles */}
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-white/5 rounded-full" />
        <div className="absolute top-1/2 -right-32 w-80 h-80 bg-white/5 rounded-full" />
        <div className="absolute -bottom-16 left-1/3 w-64 h-64 bg-white/5 rounded-full" />

        <div className="relative z-10 flex flex-col justify-between p-12 text-white">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                <Pill className="h-5 w-5" />
              </div>
              <span className="text-xl font-bold tracking-tight">RW Pharma</span>
            </div>
            <p className="text-white/60 text-sm">Plateforme de courtage pharmaceutique</p>
          </div>

          <div className="space-y-8">
            <h2 className="text-4xl font-bold leading-tight">
              Gerez vos allocations<br />
              <span className="text-white/80">en toute simplicite</span>
            </h2>
            <p className="text-white/70 text-lg max-w-md">
              Import parallele de medicaments en Europe. Collecte des commandes et allocation des stocks automatisees.
            </p>

            <div className="grid grid-cols-1 gap-4">
              {[
                { icon: Package, label: '1 760+ produits', desc: 'Catalogue pharmaceutique complet' },
                { icon: TrendingUp, label: 'Allocation optimisee', desc: 'Quotas grossistes en temps reel' },
                { icon: Shield, label: 'Conformite ANSM', desc: 'Controle des produits bloques' },
              ].map((feat) => (
                <div key={feat.label} className="flex items-start gap-3 bg-white/10 backdrop-blur rounded-xl p-4">
                  <div className="h-9 w-9 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                    <feat.icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{feat.label}</p>
                    <p className="text-white/60 text-xs mt-0.5">{feat.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="text-white/40 text-xs">
            &copy; {new Date().getFullYear()} RW Pharma. Tous droits reserves.
          </p>
        </div>
      </div>

      {/* Right panel - Login form */}
      <div className="flex-1 flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-[420px] animate-fade-in">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center">
              <Pill className="h-5 w-5 text-primary" />
            </div>
            <span className="text-2xl font-bold text-foreground">RW Pharma</span>
          </div>

          <Card className="border-0 shadow-xl shadow-black/5 lg:border">
            <CardHeader className="space-y-1 pb-4">
              <CardTitle className="text-2xl font-bold">Connexion</CardTitle>
              <CardDescription>
                Entrez vos identifiants pour acceder a la plateforme
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="julie@rwpharma.com"
                      required
                      autoComplete="email"
                      className="pl-9"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Mot de passe</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      className="pl-9"
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full h-11 font-medium" disabled={loading}>
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Connexion...
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      Se connecter
                      <ArrowRight className="h-4 w-4" />
                    </div>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          <p className="text-center text-xs text-muted-foreground mt-6 lg:hidden">
            &copy; {new Date().getFullYear()} RW Pharma
          </p>
        </div>
      </div>
    </div>
  )
}

import { type FormEvent, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/lib/auth"
import { Loader2 } from "lucide-react"

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const result = await login(username, password)
    setLoading(false)
    if (result.ok) {
      navigate("/hub", { replace: true })
    } else {
      setError(result.error)
    }
  }

  return (
    <div className="grid min-h-svh place-items-center bg-muted md:p-6">
      <div className="grid min-h-svh w-full max-w-[980px] overflow-hidden md:min-h-[560px] md:grid-cols-2 md:rounded-[28px] md:shadow-2xl">
        {/* Panel de marca */}
        <div
          className="relative flex flex-col items-center justify-end gap-4 overflow-hidden rounded-b-[28px] bg-primary bg-cover bg-center px-8 pb-14 pt-12 md:rounded-none"
          style={{ backgroundImage: "url(/fondo.webp)" }}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/30 via-black/20 to-black/70"
          />
          <img src="/Logo.webp" alt="Natulac" className="relative z-10 h-24 w-auto drop-shadow" />
          <p className="relative z-10 text-2xl font-semibold tracking-wide text-white [text-shadow:0_1px_4px_rgb(0_0_0/0.55)]">
            Aséptico
          </p>
        </div>

        {/* Formulario */}
        <div className="relative z-10 -mt-7 flex items-center justify-center bg-background px-6 py-8 md:mt-0 md:px-10 md:py-12">
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-[360px] rounded-3xl bg-card p-7 shadow-lg md:rounded-none md:bg-transparent md:p-0 md:shadow-none"
          >
            <h1 className="text-3xl font-bold text-foreground">Bienvenido</h1>
            <p className="mb-7 mt-2 text-sm text-muted-foreground">Ingresa a tu cuenta para continuar</p>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="username">Usuario</Label>
                <Input
                  id="username"
                  autoComplete="username"
                  placeholder="ej. kgomez"
                  className="h-11 rounded-full border-transparent bg-primary/[0.06] px-5"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Mínimo 4 dígitos"
                  className="h-11 rounded-full border-transparent bg-primary/[0.06] px-5"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}

              <Button type="submit" className="mt-2 h-12 w-full rounded-full text-base" disabled={loading}>
                {loading && <Loader2 className="size-4 animate-spin" />}
                {loading ? "Ingresando…" : "Iniciar sesión"}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                Mensaje placeholder para link al manual
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

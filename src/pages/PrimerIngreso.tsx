import { type FormEvent, useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/lib/auth"
import { cedulaValida, claveCumplePolitica, formatearCedula } from "@/lib/credenciales"

/*
 * Pantalla obligatoria de primer ingreso. Mientras session.debeCompletarPerfil
 * sea true, App.tsx muestra SOLO esto (ver el guard ahí). La persona
 * confirma / completa Nombre y Apellido y Cédula y define su clave de 4
 * dígitos (distinta de 1234). Al guardar, el flag se apaga y sigue la app.
 */
export default function PrimerIngreso() {
  const { session, completarPrimerIngreso, logout } = useAuth()
  const [nombre, setNombre] = useState(session?.nombre ?? "")
  const [cedula, setCedula] = useState(formatearCedula(session?.cedula ?? ""))
  const [nueva, setNueva] = useState("")
  const [repetir, setRepetir] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!nombre.trim()) {
      setError("Ingresa tu nombre y apellido.")
      return
    }
    if (!cedulaValida(cedula)) {
      setError("La cédula debe quedar como X.XXX.XXX o XX.XXX.XXX.")
      return
    }
    if (!claveCumplePolitica(nueva)) {
      setError("La contraseña nueva debe ser de 4 dígitos y distinta de 1234.")
      return
    }
    if (nueva !== repetir) {
      setError("Las dos contraseñas nuevas no coinciden.")
      return
    }

    setLoading(true)
    const result = await completarPrimerIngreso({ nombre, cedula, passwordNueva: nueva })
    setLoading(false)
    if (!result.ok) setError(result.error)
    // Si sale bien, el flag se apaga en la sesión y App.tsx renderiza la app.
  }

  return (
    <div className="grid min-h-svh place-items-center bg-muted md:p-6">
      <div className="grid min-h-svh w-full max-w-[980px] overflow-hidden md:min-h-[560px] md:grid-cols-2 md:rounded-[28px] md:shadow-2xl">
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

        <div className="relative z-10 -mt-7 flex items-center justify-center bg-background px-6 py-8 md:mt-0 md:px-10 md:py-12">
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-[360px] rounded-3xl bg-card p-7 shadow-lg md:rounded-none md:bg-transparent md:p-0 md:shadow-none"
          >
            <h1 className="text-3xl font-bold text-foreground">Confirma tus datos</h1>
            <p className="mb-7 mt-2 text-sm text-muted-foreground">
              Primer ingreso: confirma tus datos y reemplaza la contraseña base por una propia de 4 dígitos (no puede ser
              1234).
            </p>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="usuario">Usuario</Label>
                <Input
                  id="usuario"
                  value={session?.username ?? ""}
                  readOnly
                  disabled
                  className="h-11 rounded-full border-transparent bg-muted px-5"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="nombre">Nombre y Apellido</Label>
                <Input
                  id="nombre"
                  autoComplete="name"
                  placeholder="ej. Juan Pérez"
                  className="h-11 rounded-full border-transparent bg-primary/[0.06] px-5"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="cedula">Cédula</Label>
                <Input
                  id="cedula"
                  inputMode="numeric"
                  placeholder="ej. 30.223.132"
                  className="h-11 rounded-full border-transparent bg-primary/[0.06] px-5"
                  value={cedula}
                  onChange={(e) => setCedula(formatearCedula(e.target.value))}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="nueva">Contraseña nueva</Label>
                <Input
                  id="nueva"
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  maxLength={4}
                  placeholder="4 dígitos"
                  className="h-11 rounded-full border-transparent bg-primary/[0.06] px-5"
                  value={nueva}
                  onChange={(e) => setNueva(e.target.value.replace(/\D/g, ""))}
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="repetir">Repetir contraseña nueva</Label>
                <Input
                  id="repetir"
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  maxLength={4}
                  placeholder="4 dígitos"
                  className="h-11 rounded-full border-transparent bg-primary/[0.06] px-5"
                  value={repetir}
                  onChange={(e) => setRepetir(e.target.value.replace(/\D/g, ""))}
                />
              </div>

              {error && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}

              <Button type="submit" className="mt-2 h-12 w-full rounded-full text-base" disabled={loading}>
                {loading && <Loader2 className="size-4 animate-spin" />}
                {loading ? "Guardando…" : "Guardar y entrar"}
              </Button>

              <button
                type="button"
                onClick={logout}
                className="text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
              >
                Salir
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

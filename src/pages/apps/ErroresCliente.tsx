import { useEffect, useState } from "react"
import { Loader2, RefreshCw, ShieldAlert } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { EmptyState } from "@/components/EmptyState"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useAuth } from "@/lib/auth"
import { listarErroresCliente, type ErrorCliente } from "@/lib/erroresCliente"

/*
 * Errores: log de todo error que devolvió un RPC de Supabase, para
 * quien tenga usuarios.ve_errores (hoy solo el dueño) — ver el wrapper
 * de supabase.rpc() en src/lib/supabase.ts, que manda cada error acá
 * solo, sin que ninguna pantalla tenga que acordarse. Antes esto se
 * perdía: quedaba solo en la pantalla de quien lo vivió en el momento.
 */
export default function ErroresCliente() {
  const { session } = useAuth()
  const [errores, setErrores] = useState<ErrorCliente[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function cargar() {
    if (!session) return
    setCargando(true)
    setError(null)
    const resultado = await listarErroresCliente(session.username)
    setCargando(false)
    if (!resultado.ok) {
      setError(resultado.error)
      return
    }
    setErrores(resultado.errores)
  }

  useEffect(() => {
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <AppShell title="Errores" description="Errores que le salieron a alguien usando la app">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={cargar} disabled={cargando}>
            {cargando ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            Actualizar
          </Button>
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        {cargando ? (
          <div className="flex justify-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : errores.length === 0 ? (
          <EmptyState icon={ShieldAlert} title="Sin errores registrados" description="Ningún RPC devolvió error todavía." />
        ) : (
          <div className="flex flex-col gap-3">
            {errores.map((e) => (
              <Card key={e.id}>
                <CardContent className="flex flex-col gap-1.5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-destructive">{e.funcion}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(e.creadoEn).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "medium" })}
                      {e.usuarioNombre ? ` · ${e.usuarioNombre}` : ""}
                    </span>
                  </div>
                  <p className="text-sm text-foreground">{e.mensaje}</p>
                  {e.contexto && (
                    <pre className="mt-1 overflow-x-auto rounded-lg bg-muted/50 p-2 text-[11px] text-muted-foreground">
                      {JSON.stringify(e.contexto, null, 2)}
                    </pre>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}

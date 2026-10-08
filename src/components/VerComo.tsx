import { useState } from "react"
import { Eye, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth"
import { ROLES, nombrePorCodigo, type RolCodigo } from "@/lib/catalogos"

/*
 * «Ver como» (dueña, 2026-10-08): el dueño mira la app como la vería un
 * supervisor, la analista, el jefe… Solo cambia lo que se muestra
 * (pantallas y botones); lo que se hace sigue quedando con su usuario.
 * Ver src/lib/auth.tsx y la migración 20261108690000.
 */
const ROLES_VISTA: RolCodigo[] = ["SUPERVISOR", "ANALISTA", "JEFE_PRODUCCION", "MANTENIMIENTO", "CALIDAD"]

/** Selector para el inicio. Solo lo ve el dueño de verdad. */
export function SelectorVerComo() {
  const { sessionReal, vistaComo, verComo } = useAuth()
  const [cambiando, setCambiando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!sessionReal?.esDueno) return null

  async function elegir(valor: string) {
    setCambiando(true)
    setError(null)
    const r = await verComo(valor === "" ? null : (valor as RolCodigo))
    setCambiando(false)
    if (!r.ok) setError(r.error)
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        {cambiando ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />}
        Ver como
        <select
          aria-label="Ver la app como"
          className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground"
          value={vistaComo?.rol ?? ""}
          disabled={cambiando}
          onChange={(e) => elegir(e.target.value)}
        >
          <option value="">Mi vista</option>
          {ROLES_VISTA.map((r) => (
            <option key={r} value={r}>
              {nombrePorCodigo(ROLES, r)}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

/** Franja arriba de todo mientras el dueño mira la app como otro rol. */
export function FranjaVerComo() {
  const { vistaComo, verComo } = useAuth()
  if (!vistaComo) return null
  return (
    <div className="border-b border-warning/40 bg-warning-soft px-4 py-1.5 text-sm text-warning-foreground">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
        <span>
          Viendo la app como <b>{nombrePorCodigo(ROLES, vistaComo.rol)}</b>. Lo que hagas queda con tu usuario.
        </span>
        <Button size="sm" variant="outline" className="h-7" onClick={() => verComo(null)}>
          Volver a mi vista
        </Button>
      </div>
    </div>
  )
}

import { useEffect, useMemo, useState } from "react"
import { Eye, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth"
import { nombreDeArea, useCatalogosLive } from "@/lib/catalogosLive"
import { listarEstructura, type PuestoEstructura } from "@/lib/estructura"

/*
 * «Ver como» (dueña, 2026-10-08; por puesto desde Personal por áreas y
 * puestos): el dueño mira la app como la vería quien ocupa un puesto, con
 * los permisos de ese puesto. Solo cambia lo que se muestra (pantallas y
 * botones); lo que se hace sigue quedando con su usuario. Ver
 * src/lib/auth.tsx y permisos_de_puesto (migración 20261114190000).
 */

/** Puestos activos agrupados por área, en el orden en que llegan de la base. */
export function agruparPuestosPorArea(puestos: PuestoEstructura[]): { areaCodigo: string | null; puestos: PuestoEstructura[] }[] {
  const grupos: { areaCodigo: string | null; puestos: PuestoEstructura[] }[] = []
  for (const p of puestos.filter((x) => x.activo)) {
    const grupo = grupos.find((g) => g.areaCodigo === p.areaCodigo)
    if (grupo) grupo.puestos.push(p)
    else grupos.push({ areaCodigo: p.areaCodigo, puestos: [p] })
  }
  return grupos
}

/** Selector para el inicio. Solo lo ve el dueño de verdad. */
export function SelectorVerComo() {
  const { sessionReal, vistaComo, verComo } = useAuth()
  const { areas } = useCatalogosLive()
  const [puestos, setPuestos] = useState<PuestoEstructura[]>([])
  const [cambiando, setCambiando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const esDueno = Boolean(sessionReal?.esDueno)
  const usuario = sessionReal?.username

  useEffect(() => {
    if (!esDueno || !usuario) return
    let cancelado = false
    listarEstructura(usuario).then((e) => {
      if (!cancelado) setPuestos(e?.puestos ?? [])
    })
    return () => {
      cancelado = true
    }
  }, [esDueno, usuario])

  const grupos = useMemo(() => agruparPuestosPorArea(puestos), [puestos])
  if (!esDueno) return null

  async function elegir(valor: string) {
    setCambiando(true)
    setError(null)
    const r = await verComo(valor === "" ? null : valor)
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
          className="h-8 max-w-[14rem] rounded-md border border-input bg-background px-2 text-sm text-foreground"
          value={vistaComo?.puestoId ?? ""}
          disabled={cambiando}
          onChange={(e) => elegir(e.target.value)}
        >
          <option value="">Mi vista</option>
          {grupos.map((g) => (
            <optgroup key={g.areaCodigo ?? "sin-area"} label={g.areaCodigo ? nombreDeArea(areas, g.areaCodigo) : "Sin área"}>
              {g.puestos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </optgroup>
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
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-2">
        <span>
          Viendo la app como <b>{vistaComo.puesto ?? "otro puesto"}</b>. Lo que hagas queda con tu usuario.
        </span>
        <Button size="sm" variant="outline" className="h-7" onClick={() => verComo(null)}>
          Volver a mi vista
        </Button>
      </div>
    </div>
  )
}

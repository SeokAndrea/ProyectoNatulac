import { useMemo, useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { diferenciasMatriz, NIVELES, type CambioMatriz, type PermisoEstructura, type PuestoEstructura, type TemaPermiso } from "@/lib/estructura"
import type { Permiso } from "@/lib/permisos"
import { useAccion } from "@/lib/useAccion"
import { cn } from "@/lib/utils"

const TEMAS: { tema: TemaPermiso; nombre: string }[] = [
  { tema: "TURNOS", nombre: "Turnos" },
  { tema: "PARADAS", nombre: "Paradas" },
  { tema: "MANTENIMIENTO", nombre: "Mantenimiento" },
  { tema: "DATOS", nombre: "Datos" },
  { tema: "PERSONAS", nombre: "Personas" },
  { tema: "ADMINISTRACION", nombre: "Administración" },
]

const copiar = (puestos: PuestoEstructura[]) => new Map(puestos.map((p) => [p.id, new Set<Permiso>(p.permisos)]))

/**
 * Matriz de permisos del área: columnas = puestos (por nivel), filas = permisos por tema.
 * Se marcan las casillas y se guarda todo junto; la base aplica todo o nada.
 * Los puestos con todos los permisos (Super Administrador, Probador) no son columna.
 */
export function MatrizPermisos({
  puestos,
  permisos,
  onGuardar,
  onEditarPuesto,
}: {
  puestos: PuestoEstructura[]
  permisos: PermisoEstructura[]
  onGuardar: (cambios: CambioMatriz[]) => Promise<{ ok: boolean; error?: string }>
  /** Con esto, el nombre del puesto en el encabezado abre su formulario. */
  onEditarPuesto?: (puesto: PuestoEstructura) => void
}) {
  /** Último estado guardado que se conoce: lo que llegó de la base o lo que se acaba de guardar. */
  const [base, setBase] = useState(puestos)
  const [recibidos, setRecibidos] = useState(puestos)
  const [editada, setEditada] = useState(() => copiar(puestos))
  const [aviso, setAviso] = useState<string | null>(null)
  const { enviando, error, ejecutar } = useAccion()

  // El padre pasó una lista nueva (otra área, recarga): se parte de ella; el aviso se queda.
  if (recibidos !== puestos) {
    setRecibidos(puestos)
    setBase(puestos)
    setEditada(copiar(puestos))
  }

  const columnas = useMemo(
    () => puestos.filter((p) => !p.todosLosPermisos).sort((a, b) => (a.nivel ?? 99) - (b.nivel ?? 99) || a.nombre.localeCompare(b.nombre, "es")),
    [puestos],
  )
  const grupos = useMemo(() => {
    const conocidos = TEMAS.map((t) => ({ ...t, filas: permisos.filter((p) => p.tema === t.tema) }))
    const otros = permisos.filter((p) => !TEMAS.some((t) => t.tema === p.tema))
    return [...conocidos, { tema: "OTROS" as const, nombre: "Otros", filas: otros }].filter((g) => g.filas.length > 0)
  }, [permisos])

  const cambios = useMemo(() => diferenciasMatriz(base, editada), [base, editada])

  function marcar(puestoId: string, permiso: Permiso, marcado: boolean) {
    setAviso(null)
    setEditada((prev) => {
      const nueva = new Map(prev)
      const set = new Set(prev.get(puestoId))
      if (marcado) set.add(permiso)
      else set.delete(permiso)
      nueva.set(puestoId, set)
      return nueva
    })
  }

  async function guardar() {
    const enviados = cambios
    setAviso(null)
    const ok = await ejecutar(async () => {
      const r = await onGuardar(enviados)
      return r.ok ? { ok: true as const } : { ok: false as const, error: r.error ?? "No se pudieron guardar los permisos." }
    })
    if (!ok) return
    // Lo guardado pasa a ser el punto de partida: el contador vuelve a 0 aunque el padre no recargue.
    const guardados = base.map((p) => ({ ...p, permisos: [...(editada.get(p.id) ?? p.permisos)] }))
    setBase(guardados)
    setAviso(`${enviados.length} ${enviados.length === 1 ? "cambio guardado" : "cambios guardados"}`)
  }

  if (columnas.length === 0) {
    return <p className="rounded-xl border border-border bg-card px-4 py-6 text-sm text-foreground">Esta área no tiene puestos. Crea uno con «+ Puesto».</p>
  }

  return (
    <section aria-label="Permisos por puesto" className="flex min-w-0 flex-col gap-3">
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full border-separate border-spacing-0 text-sm text-foreground">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 min-w-44 border-b border-border bg-card px-3 py-2 text-left font-semibold">
                Permiso
              </th>
              {columnas.map((p) => (
                <th key={p.id} scope="col" className={cn("min-w-28 border-b border-l border-border bg-card px-3 py-2 text-center font-semibold", !p.activo && "text-muted-foreground italic")}>
                  {onEditarPuesto ? (
                    <button type="button" onClick={() => onEditarPuesto(p)} className="min-h-11 font-semibold text-info-foreground underline-offset-2 hover:underline">
                      {p.nombre}
                    </button>
                  ) : (
                    p.nombre
                  )}
                  <span className="block text-xs font-normal">
                    {p.nivel ? `nivel ${p.nivel}` : "sin nivel"}
                    {!p.activo && " · inactivo"}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) => (
              <GrupoFilas key={g.tema} nombre={g.nombre} columnas={columnas.length}>
                {g.filas.map((permiso) => (
                  <tr key={permiso.codigo}>
                    <th scope="row" className="sticky left-0 z-10 border-b border-border bg-card px-3 py-1 text-left font-normal">
                      {permiso.nombre}
                    </th>
                    {columnas.map((p) => (
                      <td key={p.id} className="border-b border-l border-border p-0 text-center">
                        <label className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center">
                          <Checkbox
                            aria-label={`${permiso.nombre} × ${p.nombre}`}
                            checked={editada.get(p.id)?.has(permiso.codigo) ?? false}
                            disabled={enviando}
                            onCheckedChange={(v) => marcar(p.id, permiso.codigo, v === true)}
                          />
                        </label>
                      </td>
                    ))}
                  </tr>
                ))}
              </GrupoFilas>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button className="h-11" onClick={guardar} disabled={cambios.length === 0 || enviando}>
          {enviando && <Loader2 className="size-4 animate-spin" />}
          Guardar cambios ({cambios.length})
        </Button>
        {cambios.length > 0 && !enviando && (
          <Button variant="outline" className="h-11" onClick={() => setEditada(copiar(base))}>
            Deshacer
          </Button>
        )}
        <div role="status" aria-live="polite" className="text-sm">
          {error ? <span className="text-destructive">{error}</span> : aviso ? <span className="text-success-foreground">{aviso}</span> : null}
        </div>
      </div>
      <p className="text-xs text-foreground">
        Niveles: {NIVELES.map((n) => `${n.nivel} ${n.nombre}`).join(" · ")}. Super Administrador y Probador tienen todos los permisos y no aparecen aquí.
      </p>
    </section>
  )
}

function GrupoFilas({ nombre, columnas, children }: { nombre: string; columnas: number; children: React.ReactNode }) {
  return (
    <>
      <tr>
        <th colSpan={columnas + 1} scope="colgroup" className="border-b border-border bg-muted px-3 py-1.5 text-left text-xs font-semibold tracking-wide uppercase">
          {nombre}
        </th>
      </tr>
      {children}
    </>
  )
}

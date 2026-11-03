import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { GrupoTabla } from "@/lib/catalogoFallas/tabla"
import type { NivelCatalogo } from "@/lib/catalogoFallas/tipos"
import { cn } from "@/lib/utils"
import { COLUMNAS_FALLAS, FilaFalla } from "./FilaFalla"
import type { NivelAEditar } from "./DialogoNivel"

/**
 * La tabla del catálogo: una franja por subsistema (Equipo › Sistema ›
 * Subsistema, cada uno con su sufijo; tocar un nombre lo edita) y sus fallas
 * debajo. El «+» de la franja pone el formulario en ese subsistema.
 */
export function TablaFallas({
  grupos,
  editable,
  usuario,
  onEditarNivel,
  onAgregarEn,
  onGuardado,
}: {
  grupos: GrupoTabla[]
  editable: boolean
  usuario: string
  onEditarNivel: (n: NivelAEditar) => void
  onAgregarEn: (g: GrupoTabla) => void
  onGuardado: () => Promise<void>
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className={cn(COLUMNAS_FALLAS, "hidden gap-x-3 border-b border-border bg-surface px-3 py-2.5 text-xs font-semibold text-muted-foreground sm:grid")}>
        <span>Código</span>
        <span>Falla</span>
        <span>Clase</span>
      </div>
      {grupos.map((g) => (
        <section key={g.subsistema.id} aria-label={`${g.equipo.nombre}, ${g.sistema.nombre}, ${g.subsistema.nombre}`} className="border-b border-border last:border-b-0">
          <div className="flex items-center gap-2 border-b border-border/60 bg-muted/60 py-1 pr-1 pl-3">
            <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 py-1 text-sm">
              <Nivel nivel="EQUIPO" id={g.equipo.id} nombre={g.equipo.nombre} sufijo={g.equipo.sufijo} editable={editable && !g.equipo.reservada} onEditar={onEditarNivel} />
              <span className="text-muted-foreground" aria-hidden>›</span>
              <Nivel nivel="SISTEMA" id={g.sistema.id} nombre={g.sistema.nombre} sufijo={g.sistema.sufijo} editable={editable && !g.sistema.reservada} onEditar={onEditarNivel} />
              <span className="text-muted-foreground" aria-hidden>›</span>
              <Nivel nivel="SUBSISTEMA" id={g.subsistema.id} nombre={g.subsistema.nombre} sufijo={g.subsistema.sufijo} editable={editable && !g.subsistema.reservada} onEditar={onEditarNivel} fuerte />
              {g.subsistema.codigoSheet && <span className="num text-xs text-muted-foreground">Sheet {g.subsistema.codigoSheet}</span>}
              {g.subsistema.reservada && <span className="text-xs text-muted-foreground">· reservado</span>}
            </div>
            <span className="num shrink-0 text-xs text-muted-foreground">{g.total}</span>
            {editable && !g.subsistema.reservada && (
              <Button variant="ghost" size="icon-sm" aria-label={`Agregar falla en ${g.subsistema.nombre}`} onClick={() => onAgregarEn(g)}>
                <Plus />
              </Button>
            )}
          </div>
          {g.fallas.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">Sin fallas todavía.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {g.fallas.map((f) => (
                <li key={f.id}>
                  <FilaFalla falla={f} usuario={usuario} editable={editable} onGuardado={onGuardado} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  )
}

/** Un nivel de la franja: «Superestructura SUP». Para quien edita, es un botón que lo abre. */
function Nivel({
  nivel,
  id,
  nombre,
  sufijo,
  editable,
  onEditar,
  fuerte,
}: {
  nivel: NivelCatalogo
  id: string
  nombre: string
  sufijo: string
  editable: boolean
  onEditar: (n: NivelAEditar) => void
  fuerte?: boolean
}) {
  const contenido = (
    <>
      <span className={cn(fuerte ? "font-semibold text-foreground" : "text-foreground")}>{nombre}</span>{" "}
      <span className="num text-xs text-muted-foreground">{sufijo}</span>
    </>
  )
  if (!editable) return <span>{contenido}</span>
  return (
    <button
      type="button"
      title={`Editar ${nombre}`}
      aria-label={`Editar ${nombre} (${sufijo})`}
      onClick={() => onEditar({ nivel, id })}
      className="rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {contenido}
    </button>
  )
}

import { Desplegable } from "@/components/Desplegable"
import { horaCortaPlanta } from "@/lib/tiempoPlanta"
import type { TurnoDelDia } from "@/lib/resumenDiario"

/** Las novedades que cargaron los supervisores, turno por turno. */
export function NovedadesDelDia({ turnos }: { turnos: TurnoDelDia[] }) {
  const novedades = turnos.flatMap((t) => t.novedades.map((n) => ({ ...n, etiqueta: t.etiqueta, fecha: t.turno.fecha })))
  return (
    <Desplegable titulo="Novedades del día" resumen={novedades.length > 0 ? `${novedades.length}` : undefined}>
      {novedades.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin novedades cargadas.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border text-sm">
          {novedades.map((n) => (
            <li key={n.id} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2 py-1.5">
              <span className="num text-xs text-muted-foreground">
                {n.etiqueta} {horaCortaPlanta(n.creadoEn, n.fecha)}
              </span>
              <span className="text-foreground">{n.texto}</span>
            </li>
          ))}
        </ul>
      )}
    </Desplegable>
  )
}

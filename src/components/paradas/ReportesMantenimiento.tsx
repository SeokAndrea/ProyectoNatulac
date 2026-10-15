import { Badge } from "@/components/ui/badge"
import { Desplegable } from "@/components/paradas/Desplegable"
import { ActualizarDesdeSheet } from "@/components/paradas/ActualizarDesdeSheet"
import { duracionMin, fmtDuracion, nombreLineaParada, paradaAbierta, partesNotaSheet, type Parada } from "@/lib/paradas"

/*
 * Paradas que reportó Mantenimiento (su Sheet o su app), con el mismo
 * filtro del Panel de Paradas. Antes leía el Sheet con su propio filtro
 * (Hoy / Ayer / 7 días) y no cuadraba con el resto (dueña, 2026-10-15).
 * Ahora salen de la base: son las mismas que suman arriba. El Sheet se
 * trae solo cada 5 min (useParadasAbiertas) y con el botón de acá.
 */
export function ReportesMantenimiento({
  paradas,
  ahora,
  usuarioSheet,
  onActualizado,
}: {
  /** Ya filtradas por el panel (fechas, turno, línea, clase) y solo de Mantenimiento. */
  paradas: Parada[]
  ahora: Date
  /** Quien puede traer el Sheet; null = sin botón. */
  usuarioSheet: string | null
  onActualizado: () => void
}) {
  const variosDias = new Set(paradas.map((p) => p.inicio.slice(0, 10))).size > 1
  const enCurso = paradas.filter(paradaAbierta).length
  const resumen = paradas.length === 0 ? "Sin paradas" : [`${paradas.length} ${paradas.length === 1 ? "parada" : "paradas"}`, enCurso > 0 && `${enCurso} en curso`].filter(Boolean).join(" · ")

  return (
    // Cerrada por defecto, como el detalle: al abrir el panel se ve limpio (dueña, 2026-10-15).
    <Desplegable titulo="Paradas de Mantenimiento" resumen={resumen}>
        <p className="text-xs text-muted-foreground">
          Las que reportó Mantenimiento (en su Sheet o en la app) con el filtro de arriba. Ya están sumadas en los números del panel.
        </p>
        {usuarioSheet && <ActualizarDesdeSheet usuario={usuarioSheet} onListo={onActualizado} />}
        {paradas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Mantenimiento no reportó paradas con este filtro.</p>
        ) : (
          // Una tarjeta por parada (no tabla): en el teléfono la falla se lee entera, sin correr de costado.
          <ul className="flex flex-col gap-2">
            {paradas.map((p) => {
              const { falla, equipo } = p.origen === "SHEET" ? partesNotaSheet(p.nota) : { falla: p.nota?.trim() ?? "", equipo: "" }
              return (
                <li key={p.id} className="flex flex-col gap-0.5 rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="num font-medium text-foreground">
                      {variosDias && <span className="text-muted-foreground">{p.inicio.slice(8, 10)}/{p.inicio.slice(5, 7)} </span>}
                      {p.inicio.slice(11, 16)}
                      {p.fin ? `–${p.fin.slice(11, 16)}` : "–…"}
                    </span>
                    <span className="text-muted-foreground">· {nombreLineaParada(p.lineaCodigo)} ·</span>
                    <span className="num font-semibold text-foreground">{fmtDuracion(duracionMin(p, ahora))}</span>
                    {paradaAbierta(p) ? <Badge variant="warning">En curso</Badge> : <Badge variant="muted">Finalizada</Badge>}
                  </div>
                  <p className="font-medium text-foreground">{p.tipoNombre}</p>
                  {falla && <p className="text-muted-foreground">{falla}</p>}
                  <p className="text-xs text-muted-foreground">
                    {[equipo, p.origen === "SHEET" ? "Sheet de Mantenimiento" : "App de Mantenimiento"].filter(Boolean).join(" · ")}
                  </p>
                </li>
              )
            })}
          </ul>
        )}
    </Desplegable>
  )
}

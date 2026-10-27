import type { ReactNode } from "react"
import { Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TURNO_TIPOS } from "@/lib/catalogos"
import { SIN_SUBSISTEMA } from "@/lib/mttoCatalogo"
import { duracionMin, nombreLineaParada, type Parada } from "@/lib/paradas"
import { codigoDeParadaLive, useCatalogoParadas } from "@/lib/paradasCatalogo"
import { useEquiposParadas } from "@/lib/paradasEquipos"
import { desgloseEnTurnos, type VentanaTurno } from "@/lib/paradasTramo"

/** 'YYYY-MM-DDTHH:MM:SS' → '21/10/2026 14:05'. */
const fechaHora = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)} ${iso.slice(11, 16)}`

/** «210 min · T1 60 + T2 150»; con un solo turno, solo los minutos. */
export function textoTiempos(p: Pick<Parada, "inicio" | "fin">, ventanas: VentanaTurno[], ahora: Date): string {
  const { total, tramos } = desgloseEnTurnos(p, ventanas, ahora)
  if (tramos.length === 0) return `${duracionMin(p, ahora)} min`
  if (tramos.length === 1) return `${total} min`
  return `${total} min · ${tramos.map((t) => `${t.etiqueta} ${t.min}`).join(" + ")}`
}

// Al imprimir solo sale el reporte: lo demás de la pantalla se oculta.
const ESTILO_IMPRESION = `@media print {
  body * { visibility: hidden !important; }
  .reporte-imprimible, .reporte-imprimible * { visibility: visible !important; }
  .reporte-imprimible { position: absolute; left: 0; top: 0; width: 100%; border: 0 !important; box-shadow: none !important; }
}`

/** «CBP-EMP-05 · EMPUJADOR» (el nombre de ese día); «Sin subsistema»; o el texto de antes del catálogo. */
function textoSubsistema(p: Pick<Parada, "subsistemaCodigo" | "subsistemaNombre">): string | null {
  if (p.subsistemaCodigo === SIN_SUBSISTEMA) return "Sin subsistema"
  if (!p.subsistemaCodigo) return null
  return p.subsistemaNombre ? `${p.subsistemaCodigo} · ${p.subsistemaNombre}` : p.subsistemaCodigo
}

function Campo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{titulo}</dt>
      <dd className="text-sm text-foreground">{children ?? "—"}</dd>
    </div>
  )
}

/** Reporte de una parada: lo que pasó, quién la abrió y la terminó, y cuánto duró en cada turno. */
export function ReporteParada({ parada, ventanas, ahora }: { parada: Parada; ventanas: VentanaTurno[]; ahora: Date }) {
  const catalogo = useCatalogoParadas()
  const equipos = useEquiposParadas()
  const tipo = catalogo.find((t) => t.codigo === parada.tipoCodigo)
  const equipo = tipo?.equipoCodigo ? (equipos.find((e) => e.codigo === tipo.equipoCodigo)?.nombre ?? tipo.equipoCodigo) : null
  const turno = TURNO_TIPOS.find((t) => t.codigo === parada.turnoTipo)?.nombre ?? parada.turnoTipo

  return (
    <article className="reporte-imprimible flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5">
      <style>{ESTILO_IMPRESION}</style>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-foreground">
            Reporte de parada · {nombreLineaParada(parada.lineaCodigo)}
          </h2>
          <p className="text-xs text-muted-foreground">
            {fechaHora(parada.inicio)} → {parada.fin ? fechaHora(parada.fin) : "en curso"}
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" className="print:hidden" onClick={() => window.print()}>
          <Printer className="size-4" />
          Imprimir
        </Button>
      </header>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        <Campo titulo="Línea">{nombreLineaParada(parada.lineaCodigo)}</Campo>
        <Campo titulo="Turno de inicio">{turno}</Campo>
        <Campo titulo="Lote">{parada.lote}</Campo>
        <Campo titulo="Sabor">{parada.sabor}</Campo>
        <Campo titulo="Equipo">{equipo}</Campo>
        <Campo titulo="Falla">{parada.tipoNombre}</Campo>
        <Campo titulo="Equipo de Mantenimiento">{parada.mttoEquipoNombre}</Campo>
        <Campo titulo="Subsistema">{textoSubsistema(parada)}</Campo>
        <Campo titulo="Código">{codigoDeParadaLive(parada)}</Campo>
        <Campo titulo="Comentario">{parada.nota}</Campo>
        <Campo titulo="¿Qué se realizó?">{parada.solucion}</Campo>
        <Campo titulo="La abrió">{parada.supervisorNombre}</Campo>
        <Campo titulo="La terminó">{parada.terminadaPor ?? (parada.fin ? null : "Sigue en curso")}</Campo>
        <Campo titulo="Tiempo">
          <span className="num font-semibold">{textoTiempos(parada, ventanas, ahora)}</span>
        </Campo>
      </dl>
    </article>
  )
}

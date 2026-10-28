import { useEffect, useState, type ReactNode } from "react"
import { createPortal, flushSync } from "react-dom"
import { Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TURNO_TIPOS } from "@/lib/catalogos"
import { SIN_SUBSISTEMA } from "@/lib/mttoCatalogo"
import { duracionMin, fmtDuracion, nombreLineaParada, type Parada } from "@/lib/paradas"
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

/*
 * Hoja impresa (dueña, 2026-10-28: «se ve feo»). Antes se escondía la pantalla
 * con visibility, que deja el espacio: salían hojas en blanco y la tarjeta con
 * su letra gris. Ahora, solo mientras se imprime, se monta aparte una hoja
 * tipo planilla de planta (blanco y negro, recuadros, firmas) y la app entera
 * (#root) no se imprime.
 */
const ESTILO_HOJA = `
.hoja-parada { display: none; }
@media print {
  @page { size: letter; margin: 14mm; }
  body > #root { display: none !important; }
  html, body { background: #fff !important; }
  .hoja-parada { display: block; color: #000; font: 10.5pt/1.35 system-ui, "Segoe UI", Arial, sans-serif; }
  .hoja-parada * { color: #000 !important; }
  .hoja-parada header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #000; padding-bottom: 6pt; margin-bottom: 10pt; }
  .hoja-parada .empresa { font-size: 9pt; letter-spacing: .08em; text-transform: uppercase; }
  .hoja-parada h1 { font-size: 16pt; font-weight: 700; margin: 2pt 0 0; }
  .hoja-parada .meta { text-align: right; font-size: 9pt; }
  .hoja-parada h2 { font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; margin: 10pt 0 3pt; }
  .hoja-parada table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .hoja-parada th, .hoja-parada td { border: 1px solid #000; padding: 4pt 6pt; vertical-align: top; text-align: left; }
  .hoja-parada th { width: 18%; font-weight: 600; font-size: 8.5pt; background: #eee !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .hoja-parada td.texto { height: 34pt; white-space: pre-wrap; }
  .hoja-parada .firmas { display: flex; gap: 24pt; margin-top: 34pt; }
  .hoja-parada .firmas div { flex: 1; border-top: 1px solid #000; padding-top: 3pt; font-size: 9pt; text-align: center; }
  .hoja-parada footer { margin-top: 14pt; font-size: 8pt; }
  .hoja-parada table, .hoja-parada .firmas { break-inside: avoid; }
}`

/** Lo que va en una celda: el valor o una raya. */
const v = (x: ReactNode) => (x === null || x === undefined || x === "" ? "—" : x)

/** Fila de dos pares título/valor. */
function Fila({ a, va, b, vb }: { a: string; va: ReactNode; b: string; vb: ReactNode }) {
  return (
    <tr>
      <th>{a}</th>
      <td>{v(va)}</td>
      <th>{b}</th>
      <td>{v(vb)}</td>
    </tr>
  )
}

/** Texto largo a todo lo ancho. */
function FilaTexto({ titulo, texto }: { titulo: string; texto: string | null | undefined }) {
  return (
    <tr>
      <th>{titulo}</th>
      <td className="texto" colSpan={3}>
        {v(texto)}
      </td>
    </tr>
  )
}

/** La hoja que sale en papel: fuera de la app (portal en body), montada solo mientras se imprime. */
function HojaParada({
  parada,
  equipo,
  turno,
  tiempos,
  ahora,
}: {
  parada: Parada
  equipo: string | null
  turno: string
  tiempos: string
  ahora: Date
}) {
  const deMtto = parada.responsable === "MANTENIMIENTO"
  const impreso = ahora.toLocaleString("es-VE", { dateStyle: "short", timeStyle: "short", timeZone: "America/Caracas" })
  return createPortal(
    <div className="hoja-parada">
      <header>
        <div>
          <div className="empresa">Natulac · Producción Aséptico</div>
          <h1>Reporte de parada</h1>
        </div>
        <div className="meta">
          <div>
            <strong>{nombreLineaParada(parada.lineaCodigo)}</strong> · {codigoDeParadaLive(parada) ?? parada.tipoNombre}
          </div>
          <div>
            {fechaHora(parada.inicioReal ?? parada.inicio)} → {parada.fin ? fechaHora(parada.fin) : "en curso"}
          </div>
        </div>
      </header>

      <h2>Datos de la parada</h2>
      <table>
        <tbody>
          <Fila a="Línea" va={nombreLineaParada(parada.lineaCodigo)} b="Turno de inicio" vb={turno} />
          <Fila a="Inicio" va={fechaHora(parada.inicioReal ?? parada.inicio)} b="Fin" vb={parada.fin ? fechaHora(parada.fin) : "En curso"} />
          <Fila a="Tiempo" va={tiempos} b="Responsable" vb={deMtto ? "Mantenimiento" : "Operacional"} />
        </tbody>
      </table>

      <h2>Producción</h2>
      <table>
        <tbody>
          <Fila a="Lote" va={parada.lote} b="Sabor" vb={parada.sabor} />
          <Fila a="Equipo" va={equipo} b="Falla" vb={parada.tipoNombre} />
          <FilaTexto titulo="Comentario" texto={parada.nota} />
        </tbody>
      </table>

      <h2>Mantenimiento</h2>
      <table>
        <tbody>
          <Fila a="Equipo" va={parada.mttoEquipoNombre} b="Subsistema" vb={textoSubsistema(parada)} />
          <Fila a="Tiempo de reparación" va={parada.reparacionMin != null ? fmtDuracion(parada.reparacionMin) : null} b="Código" vb={codigoDeParadaLive(parada)} />
          <FilaTexto titulo="¿Qué se realizó?" texto={parada.solucion} />
        </tbody>
      </table>

      <h2>Registro</h2>
      <table>
        <tbody>
          <Fila a="La abrió" va={parada.supervisorNombre} b="La terminó" vb={parada.terminadaPor ?? (parada.fin ? null : "Sigue en curso")} />
        </tbody>
      </table>

      <div className="firmas">
        <div>Supervisor de turno</div>
        <div>Mantenimiento</div>
        <div>Jefe de Producción</div>
      </div>
      <footer>Impreso el {impreso} desde la app de Producción.</footer>
    </div>,
    document.body,
  )
}

/** true mientras el navegador imprime (botón Imprimir o Ctrl+P): ahí se monta la hoja. */
function useImprimiendo(): boolean {
  const [imprimiendo, setImprimiendo] = useState(false)
  useEffect(() => {
    // flushSync: la hoja tiene que estar en la página antes de que el navegador arme la impresión.
    const antes = () => flushSync(() => setImprimiendo(true))
    const despues = () => setImprimiendo(false)
    window.addEventListener("beforeprint", antes)
    window.addEventListener("afterprint", despues)
    return () => {
      window.removeEventListener("beforeprint", antes)
      window.removeEventListener("afterprint", despues)
    }
  }, [])
  return imprimiendo
}

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
  // El servidor ya trae el equipo; el catálogo cargado queda de respaldo (base sin la migración 20261113090000).
  const equipo =
    parada.equipoNombre ?? (tipo?.equipoCodigo ? (equipos.find((e) => e.codigo === tipo.equipoCodigo)?.nombre ?? tipo.equipoCodigo) : null)
  const turno = TURNO_TIPOS.find((t) => t.codigo === parada.turnoTipo)?.nombre ?? parada.turnoTipo
  const imprimiendo = useImprimiendo()

  return (
    <article className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:p-5">
      <style>{ESTILO_HOJA}</style>
      {imprimiendo && <HojaParada parada={parada} equipo={equipo} turno={turno} tiempos={textoTiempos(parada, ventanas, ahora)} ahora={ahora} />}
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
        {parada.responsable === "MANTENIMIENTO" && (
          <Campo titulo="Tiempo de reparación">{parada.reparacionMin != null ? <span className="num">{fmtDuracion(parada.reparacionMin)}</span> : null}</Campo>
        )}
      </dl>
    </article>
  )
}

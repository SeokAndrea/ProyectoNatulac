import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { CircleCheck, ListPlus, Loader2, TriangleAlert } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { tramosLibres, ubicarMinutos } from "@/lib/cubrirTurno"
import { duracionBaseTurnoMin, ventanaTurnoMin } from "@/lib/eficiencia"
import { minutosSinReportar } from "@/lib/minutosSinReportar"
import type { LineaCodigo } from "@/lib/catalogos"
import { obtenerEstadoPlantaActual } from "@/lib/panelProduccion"
import { fmtDuracion, minutosPorClaseSinSolape, type Parada } from "@/lib/paradas"
import { cargarParadasDelTurno } from "@/lib/paradasCatalogo"
import { useProductoTerminado } from "@/lib/productoTerminado"
import type { Corrida, LineaEstado } from "@/lib/produccion/tipos"
import { horasTranscurridasTurno } from "@/lib/reportes"
import type { TurnoActivo } from "@/lib/turno"
import { AnimacionLinea } from "./AnimacionLinea"
import { aspectoLinea } from "./estadoLinea"
import { FilaAcciones } from "./FilaAcciones"
import { PanelParadasLinea } from "./PanelParadasLinea"

/*
 * Modo Paradas de Líneas (dueña, 2026-10-25), como el Modo Vacío de
 * Preparación: la pantalla queda solo para las paradas. Cada línea conserva su
 * animación de siempre y muestra la cuenta de su turno con la misma regla que «sin reportar» y la eficiencia
 * (minutosSinReportar.ts): lo producido según el PT, las paradas cargadas y
 * lo que falta cubrir. No es una barra de horas a propósito: la app sabe
 * cuándo se apretaron los botones, no cuándo corrió la máquina; el PT dice
 * cuánto, no cuándo. «Cubrir» anota el tipo y los minutos (cubrirTurno.ts).
 * Si a una corrida terminada le falta el PT, se avisa primero: sin el PT todo
 * su tiempo sale sin cubrir y no hay que taparlo con paradas.
 */

const REFRESCO_MS = 60_000
const numero = (codigo: string) => codigo.replace(/^LINEA_T?/, "")

interface LineaModo {
  codigo: LineaCodigo
  nombre: string
}

export function ModoParadas({
  lineas,
  corridas,
  lineasEstado,
  usuario,
  areaCodigo,
  pendientes,
  onCambio,
}: {
  lineas: LineaModo[]
  /** Corridas del turno (las de useProduccion). */
  corridas: Corrida[]
  /** Para la misma animación de la línea que en su tarjeta. */
  lineasEstado: LineaEstado[]
  usuario: string
  areaCodigo: string | null
  /** +1 sin minutos del área. */
  pendientes: Parada[]
  /** Se anotó o completó una parada (pendientes, líneas). */
  onCambio: () => Promise<void>
}) {
  const areaParadas = areaCodigo === "PRUEBAS" ? "PRUEBAS" : "ASEPTICO"
  const [turno, setTurno] = useState<TurnoActivo | null | undefined>(undefined)
  const [paradas, setParadas] = useState<Parada[] | null>(null)
  /** La hora con la que se hace la cuenta: se renueva en cada recarga (cada minuto y al guardar). */
  const [ahora, setAhora] = useState(() => new Date())
  const [abierto, setAbierto] = useState<{ linea: string; modo: "cubrir" | "paradas" } | null>(null)
  const pt = useProductoTerminado(turno?.id ?? null)
  const { recargar: recargarPt } = pt

  const cargar = useCallback(async () => {
    const t = await obtenerEstadoPlantaActual(areaParadas)
    setTurno(t)
    setParadas(t ? await cargarParadasDelTurno(t.id) : [])
    await recargarPt()
    setAhora(new Date())
  }, [areaParadas, recargarPt])

  useEffect(() => {
    void cargar()
    const id = setInterval(() => void cargar(), REFRESCO_MS)
    return () => clearInterval(id)
  }, [cargar])

  async function cambio() {
    await Promise.all([cargar(), onCambio()])
  }

  if (turno === undefined || paradas === null) {
    return (
      <div className="flex justify-center py-8 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }
  if (!turno) {
    return <p className="mx-auto max-w-xl rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">No hay un turno abierto: el Modo Paradas cuenta el tiempo del turno en curso.</p>
  }

  const horas = horasTranscurridasTurno(turno.horaInicio, turno.estado, turno.horaFin)
  const filas = minutosSinReportar({
    turnoTipo: turno.turnoTipo,
    esquema: turno.esquema,
    horaInicio: turno.horaInicio,
    estado: turno.estado,
    horasTranscurridas: horas,
    corridas,
    productoTerminado: pt.registros,
    paradas,
    ahora,
  })
  const turnoMin = duracionBaseTurnoMin(turno.turnoTipo, turno) ?? 0
  const ventanaMin = ventanaTurnoMin(turnoMin, turno.estado, horas)
  const desdeMs = new Date(`${turno.fecha}T${turno.horaInicio.slice(0, 5)}:00`).getTime()
  const hastaMs = Math.min(desdeMs + ventanaMin * 60_000, ahora.getTime())

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 sm:grid-cols-3">
      {lineas.map((l) => {
        const paradasLinea = paradas.filter((p) => numero(p.lineaCodigo) === numero(l.codigo))
        const corridasLinea = corridas.filter((c) => numero(c.linea) === numero(l.codigo))
        const fila = filas.find((f) => f.linea === numero(l.codigo))
        // Una línea que no corrió también tiene que quedar cubierta (con su LNP): lo producido es 0.
        const porClase = minutosPorClaseSinSolape(paradasLinea, ahora)
        const paradasMin = fila?.paradasMin ?? porClase.PROGRAMADA + porClase.NO_PROGRAMADA + porClase.OCIOSO
        const producidoMin = fila?.producidoMin ?? 0
        const lineaTurno = corridasLinea.find((c) => c.activa) ?? null
        const esperandoPt = lineaTurno === null && corridasLinea.some((c) => c.esperandoCierre)
        const aspecto = aspectoLinea(lineaTurno, lineasEstado.find((le) => le.linea === l.codigo)?.condicion ?? "DETENIDA", esperandoPt)
        const faltaMin = Math.max(0, fila ? fila.sinReportarMin : ventanaMin - paradasMin)
        const sinPt = corridasLinea.filter((c) => !c.activa && !pt.registros.some((r) => r.corridaId === c.id))
        const enMarchaSinPt = corridasLinea.some((c) => c.activa && !pt.registros.some((r) => r.corridaId === c.id))
        const pendientesLinea = pendientes.filter((p) => p.lineaCodigo === l.codigo)
        const abiertoAca = abierto?.linea === l.codigo ? abierto.modo : null

        return (
          <section key={l.codigo} aria-label={l.nombre} className="flex flex-col gap-3 rounded-xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{l.nombre}</h3>
              <Badge variant={aspecto.variante}>{aspecto.badge}</Badge>
            </div>

            <AnimacionLinea lineaCodigo={l.codigo} lineaTurno={lineaTurno} aspecto={aspecto} />

            <CuentaTurno
              ventanaMin={ventanaMin}
              programadasMin={porClase.PROGRAMADA + porClase.OCIOSO}
              producidoMin={producidoMin}
              noProgramadasMin={porClase.NO_PROGRAMADA}
              sinReportarMin={faltaMin}
            />

            {sinPt.map((c) => (
              <p key={c.id} className="flex items-start gap-2 rounded-md border border-warning/50 bg-warning-soft px-3 py-2 text-sm text-warning-foreground">
                <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>
                  Falta el PT de {c.saborNombre ?? "la corrida"}
                  {c.lote ? ` · lote ${c.lote}` : ""}: hasta cargarlo, su tiempo cuenta como sin cubrir.{" "}
                  <Link to="/producto-terminado" className="font-semibold underline underline-offset-2">
                    Cargar PT
                  </Link>
                </span>
              </p>
            ))}
            {enMarchaSinPt && <p className="text-xs text-muted-foreground">Lo que produce la corrida en marcha se suma al cargar su PT.</p>}
            {corridasLinea.length === 0 && faltaMin > 0 && (
              <p className="text-xs text-muted-foreground">La línea no corrió en este turno: cúbrelo con su motivo (LNP).</p>
            )}

            {abiertoAca ? (
              <PanelParadasLinea
                lineaCodigo={l.codigo}
                nombreLinea={l.nombre}
                areaCodigo={areaCodigo}
                usuario={usuario}
                presentacionMl={Number(corridasLinea.find((c) => c.activa)?.presentacion) || null}
                pendientes={pendientesLinea}
                onCambio={cambio}
                onCerrar={() => setAbierto(null)}
                cubrir={
                  abiertoAca === "cubrir"
                    ? { faltaMin, ubicar: (min) => ubicarMinutos(tramosLibres(paradasLinea, desdeMs, hastaMs), min) }
                    : undefined
                }
              />
            ) : (
              <FilaAcciones>
                {faltaMin > 0 && (
                  <Button size="sm" onClick={() => setAbierto({ linea: l.codigo, modo: "cubrir" })}>
                    Cubrir {fmtDuracion(faltaMin)}
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => setAbierto({ linea: l.codigo, modo: "paradas" })}>
                  <ListPlus className="size-3.5" />
                  Paradas
                  {pendientesLinea.length > 0 && (
                    <span className="num rounded-sm bg-warning-soft px-1.5 text-xs font-semibold text-warning-foreground">{pendientesLinea.length}</span>
                  )}
                </Button>
              </FilaAcciones>
            )}
          </section>
        )
      })}
    </div>
  )
}

/** Minutos para la cuenta: 0 es «0 min», no «< 1 min». */
const dur = (min: number) => (min <= 0 ? "0 min" : fmtDuracion(min))

/**
 * La cuenta del turno como la eficiencia (eficiencia.ts): las programadas (y el
 * ocioso) restan del tiempo disponible; dentro de él, lo que produjo (PT), las
 * no programadas y lo sin reportar, rayado porque falta explicarlo.
 */
function CuentaTurno({
  ventanaMin,
  programadasMin,
  producidoMin,
  noProgramadasMin,
  sinReportarMin,
}: {
  ventanaMin: number
  programadasMin: number
  producidoMin: number
  noProgramadasMin: number
  sinReportarMin: number
}) {
  const total = Math.max(ventanaMin, programadasMin + producidoMin + noProgramadasMin + sinReportarMin, 1)
  const ancho = (min: number) => `${(min / total) * 100}%`
  const disponibleMin = Math.max(0, ventanaMin - programadasMin)
  const rayado = "repeating-linear-gradient(135deg, var(--warning) 0 4px, var(--warning-soft) 4px 8px)"
  const filas: [string, number, React.CSSProperties][] = [
    ["Programadas", programadasMin, { background: "var(--muted-foreground)" }],
    ["Produjo", producidoMin, { background: "var(--success)" }],
    ["No programadas", noProgramadasMin, { background: "var(--danger)" }],
    ["Sin reportar", sinReportarMin, { background: rayado }],
  ]
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <div
          className="flex h-3.5 overflow-hidden rounded-sm bg-muted"
          role="img"
          aria-label={filas.map(([n, m]) => `${n} ${dur(m)}`).join(", ")}
        >
          {filas.map(([n, m, estilo]) => (
            <span key={n} style={{ ...estilo, width: ancho(m) }} />
          ))}
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>
            Tiempo disponible <span className="num text-foreground">{dur(disponibleMin)}</span>
          </span>
          <span>
            de <span className="num">{dur(ventanaMin)}</span>
          </span>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        {filas.map(([n, m, estilo]) => (
          <div key={n} className="flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 shrink-0 rounded-[2px]" style={estilo} />
            <dt className="text-muted-foreground">{n}</dt>
            <dd className={cn("num ml-auto", n === "Sin reportar" && m > 0 ? "font-semibold text-warning-foreground" : "text-foreground")}>{dur(m)}</dd>
          </div>
        ))}
      </dl>
      {sinReportarMin <= 0 && (
        <p className="flex items-center gap-1 text-xs text-success-foreground">
          <CircleCheck aria-hidden className="size-3.5" />
          Todo el turno está cubierto.
        </p>
      )}
    </div>
  )
}

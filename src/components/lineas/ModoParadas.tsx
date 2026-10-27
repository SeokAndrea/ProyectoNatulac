import { useCallback, useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { CircleCheck, ListPlus, Loader2, PauseCircle, TriangleAlert, Wrench } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { tramosLibres, ubicarMinutos } from "@/lib/cubrirTurno"
import { duracionBaseTurnoMin, ventanaTurnoMin } from "@/lib/eficiencia"
import { minutosSinReportar } from "@/lib/minutosSinReportar"
import type { LineaCodigo } from "@/lib/catalogos"
import { obtenerEstadoPlantaActual, obtenerTurnoDeFechaTipo } from "@/lib/panelProduccion"
import { useProduccion } from "@/lib/produccion/useProduccion"
import { TURNOS_COMPLETOS } from "@/lib/paradasTurnoCompleto"
import { diaMesPlanta, fechaPlanta, horaCortaPlanta, mismaFechaPlanta, restarDias } from "@/lib/tiempoPlanta"
import { abrirParadaMantenimiento, duracionMin, esDeMantenimiento, fmtDuracion, minutosPorClaseSinSolape, porClasificar, type Parada } from "@/lib/paradas"
import { cargarParadasDelTurno } from "@/lib/paradasCatalogo"
import { useProductoTerminado } from "@/lib/productoTerminado"
import type { Corrida, LineaEstado, ParadaQueDetiene, Resultado } from "@/lib/produccion/tipos"
import { horasTranscurridasTurno } from "@/lib/reportes"
import type { TurnoActivo } from "@/lib/turno"
import { AnimacionLinea } from "./AnimacionLinea"
import { aspectoLinea } from "./estadoLinea"
import { FilaAcciones } from "./FilaAcciones"
import { FormDetenerLinea } from "./FormDetenerLinea"
import { FormParadaLinea } from "./FormParadaLinea"
import { FormTerminarParada } from "./FormTerminarParada"
import { PanelParadasLinea } from "./PanelParadasLinea"
import { PanelPausada } from "./PanelPausada"
import type { AccionesLinea } from "./tipos"

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
 *
 * Todo lo de paradas vive aquí (dueña, 2026-10-26): «Parar» la línea ya
 * (Operacional o Mantenimiento, con equipo y falla); una línea parada tiene
 * Continuar y Entregar PT. «Anotar» es para las que ya pasaron. Solo en el
 * turno en curso.
 *
 * Mantenimiento (area MANTENIMIENTO) entra directo aquí, sin los botones que
 * manejan la línea (Continuar, Entregar PT): abre sus paradas desde la
 * tarjeta y las termina con Terminar parada. Toda parada abierta de
 * Mantenimiento se cierra así, nunca con Continuar; con el interruptor del
 * área apagado también la termina el supervisor.
 */
const PAGINA = "Líneas"

const REFRESCO_MS = 60_000
/** El turno de antes de cada uno (3x8): T1 ← T3 del día anterior, T2 ← T1, T3 ← T2. */
const ANTERIOR: Record<string, [string, number]> = { TURNO_1: ["TURNO_3", 1], TURNO_2: ["TURNO_1", 0], TURNO_3: ["TURNO_2", 0] }
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
  acciones,
  paradasDetienen,
  esMantenimiento = false,
  terminaSiempre = false,
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
  /** Parar, continuar y detener la corrida en marcha (las de LineasEstadoPlanta). */
  acciones: Pick<AccionesLinea, "pausar" | "continuar" | "detener">
  /** Qué parada tiene detenida a cada línea (paradas_que_detienen_lineas). */
  paradasDetienen: ParadaQueDetiene[]
  /** Usuario del área Mantenimiento: sin botones que manejan la línea; abre y termina sus paradas. */
  esMantenimiento?: boolean
  /** Puede terminar cualquier parada de Mantenimiento aunque el interruptor del área esté encendido (la dueña). */
  terminaSiempre?: boolean
}) {
  const areaParadas = areaCodigo === "PRUEBAS" ? "PRUEBAS" : "ASEPTICO"
  const [actual, setActual] = useState<TurnoActivo | null | undefined>(undefined)
  const [anterior, setAnterior] = useState<TurnoActivo | null>(null)
  /** Como en el PT: el turno anterior también se puede cubrir después de cerrado. */
  const [verAnterior, setVerAnterior] = useState(false)
  const turno = verAnterior && anterior ? anterior : actual
  const [paradas, setParadas] = useState<Parada[] | null>(null)
  /** La hora con la que se hace la cuenta: se renueva en cada recarga (cada minuto y al guardar). */
  const [ahora, setAhora] = useState(() => new Date())
  const [abierto, setAbierto] = useState<{ linea: string; modo: "cubrir" | "paradas" | "parada" | "detener" | "terminar"; paradaId?: string } | null>(null)
  const pt = useProductoTerminado(turno?.id ?? null)
  const { recargar: recargarPt } = pt
  // Las corridas del turno anterior (las del en curso llegan por props).
  const delAnterior = useProduccion(verAnterior && anterior ? anterior.id : null)
  const corridasTurno = verAnterior && anterior ? delAnterior.corridas : corridas

  const cargar = useCallback(async () => {
    const t = await obtenerEstadoPlantaActual(areaParadas)
    setActual(t)
    const previo = t && ANTERIOR[t.turnoTipo]
    const ant = previo ? await obtenerTurnoDeFechaTipo(restarDias(t.fecha, previo[1]), previo[0], areaParadas) : null
    setAnterior(ant)
    const ver = verAnterior && ant ? ant : t
    setParadas(ver ? await cargarParadasDelTurno(ver.id) : [])
    await recargarPt()
    setAhora(new Date())
  }, [areaParadas, recargarPt, verAnterior])

  useEffect(() => {
    void cargar()
    const id = setInterval(() => void cargar(), REFRESCO_MS)
    return () => clearInterval(id)
  }, [cargar])

  async function cambio() {
    await Promise.all([cargar(), onCambio()])
  }

  /** Parar / continuar / detener: si salió bien, se relee la cuenta del turno. */
  function yRecargar<A extends unknown[]>(fn: (...args: A) => Promise<Resultado>) {
    return async (...args: A): Promise<Resultado> => {
      const r = await fn(...args)
      if (r.ok) await cambio()
      return r
    }
  }

  if (actual === undefined || paradas === null) {
    return (
      <div className="flex justify-center py-8 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    )
  }
  if (!turno) {
    return <p className="mx-auto max-w-xl rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">No hay un turno abierto.</p>
  }

  const horas = horasTranscurridasTurno(turno.horaInicio, turno.estado, turno.horaFin)
  const filas = minutosSinReportar({
    turnoTipo: turno.turnoTipo,
    esquema: turno.esquema,
    horaInicio: turno.horaInicio,
    estado: turno.estado,
    horasTranscurridas: horas,
    corridas: corridasTurno,
    productoTerminado: pt.registros,
    paradas,
    ahora,
  })
  const turnoMin = duracionBaseTurnoMin(turno.turnoTipo, turno) ?? 0
  const ventanaMin = ventanaTurnoMin(turnoMin, turno.estado, horas)
  // Dónde caben las paradas que cubren: desde el horario oficial del turno (T1 07:00…) si abrió tarde,
  // porque la cuenta le suma el turno entero igual; hasta el fin de ese horario o ahora.
  const abrio = new Date(`${turno.fecha}T${turno.horaInicio.slice(0, 5)}:00`).getTime()
  const oficial = TURNOS_COMPLETOS.find((t) => t.tipo === turno.turnoTipo)
  const desdeOficial = oficial ? new Date(`${turno.fecha}T${oficial.desde}:00`).getTime() : abrio
  const desdeMs = Math.min(abrio, desdeOficial)
  const hastaMs = Math.min(desdeMs + turnoMin * 60_000, ahora.getTime())

  return (
    <>
    {anterior && actual && (
      <div role="group" aria-label="Qué turno cubrir" className="mx-auto mb-3 flex max-w-6xl flex-wrap gap-2">
        <Button size="sm" variant={verAnterior ? "outline" : "default"} onClick={() => setVerAnterior(false)}>
          Turno en curso · {actual.codigo}
        </Button>
        <Button size="sm" variant={verAnterior ? "default" : "outline"} onClick={() => setVerAnterior(true)}>
          Turno anterior · {anterior.codigo}
        </Button>
      </div>
    )}
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 sm:grid-cols-3">
      {lineas.map((l) => {
        const paradasLinea = paradas.filter((p) => numero(p.lineaCodigo) === numero(l.codigo))
        const corridasLinea = corridasTurno.filter((c) => numero(c.linea) === numero(l.codigo))
        const fila = filas.find((f) => f.linea === numero(l.codigo))
        // Una línea que no corrió también tiene que quedar cubierta (con su LNP): lo producido es 0.
        const porClase = minutosPorClaseSinSolape(paradasLinea, ahora)
        const paradasMin = fila?.paradasMin ?? porClase.PROGRAMADA + porClase.NO_PROGRAMADA + porClase.OCIOSO
        const producidoMin = fila?.producidoMin ?? 0
        const lineaTurno = corridasLinea.find((c) => c.activa) ?? null
        const esperandoPt = lineaTurno === null && corridasLinea.some((c) => c.esperandoCierre)
        const condicion = lineasEstado.find((le) => le.linea === l.codigo)?.condicion ?? "DETENIDA"
        const aspecto = aspectoLinea(lineaTurno, condicion, esperandoPt)
        // Parar y continuar: solo en el turno en curso, con la corrida en marcha (no en CIP ni con el lote terminado).
        const enVivo = !verAnterior && lineaTurno !== null && condicion !== "CIP" && lineaTurno.loteTerminado == null ? lineaTurno : null
        const corriendo = enVivo !== null && enVivo.pausadaEn == null
        const parada = enVivo !== null && enVivo.pausadaEn != null
        const detiene = paradasDetienen.filter((p) => p.linea === l.codigo)
        const sinClasificar = paradasLinea.filter(porClasificar).length
        const faltaMin = Math.max(0, fila ? fila.sinReportarMin : ventanaMin - paradasMin)
        const sinPt = corridasLinea.filter((c) => !c.activa && !pt.registros.some((r) => r.corridaId === c.id))
        const enMarchaSinPt = corridasLinea.some((c) => c.activa && !pt.registros.some((r) => r.corridaId === c.id))
        const pendientesLinea = pendientes.filter((p) => p.lineaCodigo === l.codigo)
        const abiertoAca = abierto?.linea === l.codigo ? abierto.modo : null
        // Paradas de Mantenimiento abiertas: se terminan con Terminar parada, nunca con Continuar.
        const abiertasMtto = paradasLinea.filter((p) => p.fin === null && !p.pendiente && esDeMantenimiento(p))
        // Las que se terminan con Terminar parada: las de Mantenimiento y las que no detienen una corrida
        // (la línea sin corrida, o una que arrancó después de abrirse). La de la corrida en pausa se cierra con Continuar.
        const abiertas = paradasLinea.filter(
          (p) =>
            p.fin === null &&
            !p.pendiente &&
            (esDeMantenimiento(p) || lineaTurno === null || new Date(p.inicioReal ?? p.inicio).getTime() < new Date(lineaTurno.activadaEn).getTime()),
        )
        const aTerminar = abiertas.find((p) => p.id === abierto?.paradaId) ?? null
        const puedeTerminar = (p: Parada) => esMantenimiento || terminaSiempre || !p.laTerminaMantenimiento
        // Con la línea sin corrida (programada pero sin poder arrancar) la parada queda abierta desde su hora de inicio.
        const sinCorrida = lineaTurno === null && !verAnterior
        // Mantenimiento abre su parada también con la línea libre o en CIP (queda anotada); el supervisor, con la corrida en marcha o la línea sin corrida.
        const puedeParar = esMantenimiento ? !verAnterior : corriendo || sinCorrida

        return (
          <section key={l.codigo} aria-label={l.nombre} className="flex flex-col gap-3 rounded-xl bg-card p-4 text-card-foreground ring-1 ring-foreground/10">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{l.nombre}</h3>
              <Badge variant={aspecto.variante}>{aspecto.badge}</Badge>
            </div>

            <div className="relative">
              <AnimacionLinea lineaCodigo={l.codigo} lineaTurno={lineaTurno} aspecto={aspecto} />
              {abiertasMtto.length > 0 && (
                <span className="num absolute left-2 top-2 flex items-center gap-1 rounded-sm bg-info-soft px-1.5 py-0.5 text-xs font-semibold text-info-foreground">
                  <Wrench aria-hidden className="size-3" />
                  Mantenimiento · {fmtDuracion(Math.max(...abiertasMtto.map((p) => duracionMin(p, ahora))))}
                </span>
              )}
            </div>

            <CuentaTurno
              ventanaMin={ventanaMin}
              programadasMin={porClase.PROGRAMADA + porClase.OCIOSO}
              producidoMin={producidoMin}
              noProgramadasMin={porClase.NO_PROGRAMADA}
              sinReportarMin={faltaMin}
            />

            {!esMantenimiento && sinPt.map((c) => (
              <p key={c.id} className="flex items-start gap-2 rounded-md border border-warning/50 bg-warning-soft px-3 py-2 text-sm text-warning-foreground">
                <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>
                  Falta el PT de {c.saborNombre ?? "la corrida"}
                  {c.lote ? ` · lote ${c.lote}` : ""}.{" "}
                  <Link to="/producto-terminado" className="font-semibold underline underline-offset-2">
                    Cargar PT
                  </Link>
                </span>
              </p>
            ))}
            {!esMantenimiento && enMarchaSinPt && <p className="text-xs text-muted-foreground">Lo que produce la corrida en marcha se suma al cargar su PT.</p>}
            {corridasLinea.length === 0 && faltaMin > 0 && (
              <p className="text-xs text-muted-foreground">La línea no corrió en este turno: cúbrelo con su motivo (LNP).</p>
            )}

            {sinClasificar > 0 && (
              <p className="text-xs text-muted-foreground">
                {sinClasificar === 1 ? "1 falla espera" : `${sinClasificar} fallas esperan`} el código de Mantenimiento.
              </p>
            )}

            {abiertoAca === "terminar" && aTerminar ? (
              <FormTerminarParada
                parada={aTerminar}
                usuario={usuario}
                areaCodigo={areaCodigo}
                esMantenimiento={esMantenimiento}
                onTerminada={async () => {
                  setAbierto(null)
                  await cambio()
                }}
              />
            ) : abiertoAca === "parada" && (esMantenimiento || sinCorrida) ? (
              <FormParadaLinea
                corridaId={enVivo?.id ?? ""}
                lineaCodigo={l.codigo}
                areaCodigo={areaCodigo}
                presentacionMl={Number(lineaTurno?.presentacion) || null}
                sinCorrida={lineaTurno === null}
                responsableFijo={esMantenimiento ? "MANTENIMIENTO" : undefined}
                pausar={async (_corridaId, datos): Promise<Resultado> => {
                  const r = await abrirParadaMantenimiento(
                    usuario,
                    { lineaCodigo: l.codigo, tipoCodigo: datos.tipoCodigo, nota: datos.motivo, inicio: datos.inicio, ...(esMantenimiento ? {} : { responsable: datos.responsable }) },
                    PAGINA,
                  )
                  if (r.ok) await cambio()
                  return r
                }}
                onCerrar={() => setAbierto(null)}
              />
            ) : abiertoAca === "parada" && enVivo ? (
              <FormParadaLinea
                corridaId={enVivo.id}
                lineaCodigo={l.codigo}
                areaCodigo={areaCodigo}
                presentacionMl={Number(enVivo.presentacion) || null}
                pausar={yRecargar(acciones.pausar)}
                onCerrar={() => setAbierto(null)}
              />
            ) : abiertoAca === "detener" && enVivo && !esMantenimiento ? (
              <FormDetenerLinea corrida={enVivo} detener={yRecargar(acciones.detener)} onCerrar={() => setAbierto(null)} />
            ) : abiertoAca === "cubrir" || abiertoAca === "paradas" ? (
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
                ubicar={abiertoAca === "paradas" ? (min) => ubicarMinutos(tramosLibres(paradasLinea, desdeMs, hastaMs), min) : undefined}
              />
            ) : (
              <>
                {parada && enVivo && (
                  <PanelPausada
                    corrida={enVivo}
                    paradaQueDetiene={detiene.find((p) => p.pendiente) ?? null}
                    paradaDeLinea={detiene[0] ?? null}
                    continuar={esMantenimiento ? undefined : yRecargar(acciones.continuar)}
                    onDetener={esMantenimiento ? undefined : () => setAbierto({ linea: l.codigo, modo: "detener" })}
                  />
                )}
                {abiertas.map((p) => {
                  const yaEnPanel = parada && detiene.some((d) => d.paradaId === p.id)
                  // El comienzo verdadero y el tiempo entero: `inicio` viene recortado al turno que se mira.
                  const comienzo = new Date(p.inicioReal ?? p.inicio)
                  const desde = mismaFechaPlanta(comienzo, fechaPlanta(ahora)) ? "las" : `el ${diaMesPlanta(comienzo)} a las`
                  return (
                    <div key={p.id} className="flex flex-col gap-1.5 text-xs">
                      {!yaEnPanel && (
                        <p className="text-muted-foreground">
                          Desde {desde} {horaCortaPlanta(p.inicioReal ?? p.inicio, p.inicio)} ({fmtDuracion(duracionMin({ inicio: p.inicioReal ?? p.inicio, fin: null }, ahora))}) · <span className="font-medium text-foreground">{p.tipoNombre}</span>
                          {p.nota ? ` · ${p.nota}` : ""}
                        </p>
                      )}
                      {puedeTerminar(p) ? (
                        <Button size="sm" className="self-start" onClick={() => setAbierto({ linea: l.codigo, modo: "terminar", paradaId: p.id })}>
                          Terminar parada
                        </Button>
                      ) : (
                        !yaEnPanel && <p className="text-muted-foreground">La termina Mantenimiento.</p>
                      )}
                    </div>
                  )
                })}
                <FilaAcciones>
                  {puedeParar && (
                    <Button size="sm" variant="outline" onClick={() => setAbierto({ linea: l.codigo, modo: "parada" })}>
                      <PauseCircle className="size-3.5" />
                      Parar
                    </Button>
                  )}
                  {!esMantenimiento && faltaMin > 0 && (
                    <Button size="sm" onClick={() => setAbierto({ linea: l.codigo, modo: "cubrir" })}>
                      Cubrir {fmtDuracion(faltaMin)}
                    </Button>
                  )}
                  {!esMantenimiento && (
                    <Button size="sm" variant="outline" onClick={() => setAbierto({ linea: l.codigo, modo: "paradas" })}>
                      <ListPlus className="size-3.5" />
                      Anotar
                      {pendientesLinea.length > 0 && (
                        <span className="num rounded-sm bg-warning-soft px-1.5 text-xs font-semibold text-warning-foreground">{pendientesLinea.length}</span>
                      )}
                    </Button>
                  )}
                </FilaAcciones>
              </>
            )}
          </section>
        )
      })}
    </div>
    </>
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

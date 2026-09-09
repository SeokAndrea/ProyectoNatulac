import { GRUPOS, TURNO_TIPOS, nombrePorCodigo } from "@/lib/catalogos"
import type { LineaLive, PresentacionLive } from "@/lib/catalogosLive"
import { mermaCorrida } from "@/lib/reportes"
import type { TurnoHistorial } from "@/lib/historialTurnos"

/**
 * Historial del turno: lista cronológica de todo lo registrado (Hora
 * - Sección - Qué), armada a partir de los mismos datos que ya viven
 * en el turno (Tanques, Líneas, Contadores, Producto Terminado) — no
 * es una tabla nueva, es una vista combinada y ordenada por hora.
 */
export interface EventoHistorial {
  /** Epoch ms — SOLO para ordenar (ver construirHistorial). "hora" es lo que se muestra. */
  momento: number
  hora: string
  seccion: string
  detalle: string
}

/**
 * A partir de un timestamp completo (ISO) o de turno.horaInicio (bare
 * "HH:MM:SS", hora local sin fecha — ver src/lib/turno.tsx) arma un
 * Date real, ancorado en turno.fecha para el segundo caso. Un turno
 * nocturno (ej. TURNO_3) cruza medianoche — sin esto, dos eventos de
 * noches distintas del mismo turno no se pueden ordenar ni distinguir.
 */
function comoFecha(valor: string, fechaTurno: string): Date {
  return /^\d{2}:\d{2}/.test(valor) ? new Date(`${fechaTurno}T${valor}`) : new Date(valor)
}

/** "23:50", o "27/08 00:10" si el evento cayó en una fecha distinta a la de inicio del turno (turno que cruzó medianoche). */
function formatearHora(valor: string, fechaTurno: string): string {
  const d = comoFecha(valor, fechaTurno)
  const horaTexto = d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })
  const mismaFecha = d.toLocaleDateString("en-CA") === fechaTurno
  return mismaFecha ? horaTexto : `${d.toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit" })} ${horaTexto}`
}

export function construirHistorial(
  turno: TurnoHistorial,
  lineas: LineaLive[],
  presentaciones: PresentacionLive[],
): EventoHistorial[] {
  const eventos: EventoHistorial[] = []

  /*
   * Piso de la línea de tiempo: el instante en que arrancó el turno.
   * turno_json() trae lotes / corridas / tanques HEREDADOS de turnos
   * anteriores — el lote abierto del área, la corrida que sigue activa
   * (ver iniciar_turno y el turno_json de 20261010) — para poder medir
   * el consumo del tramo. Pero sus timestamps de creación / activación
   * son de OTRO turno, y sin este piso aparecían mezclados y
   * desordenados al principio de la secuencia. Un sub-evento que SÍ
   * pasó en este turno (liberar / cerrar un lote heredado) igual entra:
   * se filtra por su propia hora, no por la del lote.
   */
  const inicioTurno = comoFecha(turno.horaInicio, turno.fecha).getTime()
  const MARGEN_MS = 5 * 60_000 // tolera desfases menores (hora "pelada" vs timestamp ISO)

  function agregar(valor: string, seccion: string, detalle: string) {
    const momento = comoFecha(valor, turno.fecha).getTime()
    if (Number.isFinite(momento) && Number.isFinite(inicioTurno) && momento < inicioTurno - MARGEN_MS) return
    eventos.push({ momento, hora: formatearHora(valor, turno.fecha), seccion, detalle })
  }

  agregar(turno.horaInicio, "Comenzar Turno", `${nombrePorCodigo(TURNO_TIPOS, turno.turnoTipo)} · ${nombrePorCodigo(GRUPOS, turno.grupo)}`)

  // Líneas y tanques ya no se fijan al iniciar el turno: son estado
  // continuo (ver Preparación) que se activa/cambia en cualquier
  // momento, incluso en un turno anterior — por eso cada uno usa su
  // propia hora de activación en vez de la hora de inicio del turno.
  // "lineas" trae TODAS las corridas tocadas en este turno (activas y
  // finalizadas durante él), por eso una corrida finalizada suma un
  // segundo evento con su hora de cierre.
  for (const l of turno.corridas) {
    const lote = l.loteId ? turno.preparaciones.find((p) => p.id === l.loteId) : null
    agregar(
      l.activadaEn,
      "Líneas en uso",
      `${nombrePorCodigo(lineas, l.linea)}: ${l.presentacion} ml · ${l.envasesHora} env/h${l.saborNombre ? ` · ${l.saborNombre}` : ""}${l.lote ? ` · Lote ${l.lote}` : ""}${lote ? ` · Tanque ${lote.numeroTanque}` : ""}`,
    )
    if (l.finalizadaEn) {
      agregar(l.finalizadaEn, "Líneas en uso", `${nombrePorCodigo(lineas, l.linea)}: corrida finalizada`)
    }
  }

  for (const t of turno.tanques) {
    const estado =
      t.condicion === "LISTO" || t.condicion === "STANDBY"
        ? `${t.saborNombre ?? "Sabor"} · ${t.volumenL} L${t.lote ? ` · Lote ${t.lote}` : ""}`
        : t.condicion === "SUCIO"
          ? `Sucio${t.ultimoSaborNombre ? ` · último: ${t.ultimoSaborNombre}${t.ultimoLote ? ` · Lote ${t.ultimoLote}` : ""}` : ""}`
          : t.condicion === "CIP"
            ? "En CIP"
            : t.condicion === "LIMPIO"
              ? "Limpio"
              : "En Preparación"
    agregar(t.activadaEn, "Tanques", `Tanque ${t.numeroTanque}: ${estado}`)
  }

  for (const p of turno.preparaciones) {
    const ajustes = [
      p.agua !== null ? `Agua ${p.agua} L` : null,
      p.azucar !== null ? `Azúcar ${p.azucar} kg` : null,
      p.acidoCitrico !== null ? `Ácido cítrico ${p.acidoCitrico} kg` : null,
    ]
      .filter(Boolean)
      .join(" · ")
    agregar(
      p.creadoEn,
      "Preparaciones",
      `Tanque ${p.numeroTanque}: ${p.saborNombre ?? "sin sabor"}${p.lote ? ` · Lote ${p.lote}` : ""} · ${p.tambores} tambores${ajustes ? ` · ${ajustes}` : ""}`,
    )
    if (p.liberadoEn) {
      agregar(p.liberadoEn, "Preparaciones", `Tanque ${p.numeroTanque}: lote liberado (Listo)`)
    }
    if (p.cerradoEn) {
      agregar(p.cerradoEn, "Preparaciones", `Tanque ${p.numeroTanque}: lote finalizado`)
    }
  }

  for (const c of turno.contadores) {
    const merma = c.corridaId ? mermaCorrida(c.corridaId, turno.contadores, turno.productoTerminado, presentaciones) : null
    agregar(
      c.creadoEn,
      "Contadores y Merma",
      `${nombrePorCodigo(lineas, c.linea)}: ${c.envasesLlenadora} envases de la llenadora${merma !== null ? ` (${merma.pct}% merma)` : ""}`,
    )
  }

  for (const p of turno.productoTerminado) {
    const cajasXPaleta = presentaciones.find((pr) => pr.codigo === p.presentacion)?.cajasXPaleta ?? 0
    const cajasTotales = p.paletas * cajasXPaleta + p.cajasSueltas
    // El lote no vive en la fila de Producto Terminado: sale de la
    // corrida que la generó (corridaId → Corrida.lote). Se muestra
    // junto al sabor para que un auditor lo pueda rastrear y buscar
    // (ver coincideBusqueda en src/lib/auditoriaVista.ts).
    const lote = p.corridaId ? (turno.corridas.find((l) => l.id === p.corridaId)?.lote ?? null) : null
    agregar(
      p.creadoEn,
      "Producto Terminado",
      `${nombrePorCodigo(lineas, p.linea)}: ${p.paletas} paletas + ${p.cajasSueltas} cajas sueltas = ${cajasTotales} cajas · ${p.saborNombre ?? "sin sabor"}${lote ? ` · Lote ${lote}` : ""}`,
    )
  }

  return eventos.sort((a, b) => a.momento - b.momento)
}

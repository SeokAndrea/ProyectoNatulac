import { supabase } from "@/lib/supabase"
import type { PresentacionLive } from "@/lib/catalogosLive"
import { mapearTurnoHistorial, type TurnoHistorial } from "@/lib/historialTurnos"
import { duracionMin, esDeMantenimiento, listarParadas, porClasificar, type Parada } from "@/lib/paradas"
import { cargarParadasDelTurno } from "@/lib/paradasCatalogo"
import { restarDias } from "@/lib/tiempoPlanta"
import { tramosPorLote, type MotivoSinContraste } from "@/lib/reportes/realidadPreparacion"
import { cargarValidacionesTurno, validarTurno, type ValidacionTurno } from "@/lib/resumenDia"

/*
 * Validar jornada (maqueta aprobada 2026-10-12, primero solo en Pruebas):
 * la Analista revisa el día (7:00 a 7:00, por turnos.fecha) en cuatro
 * partes — cajas, envases, semielaborado y paradas — y valida la jornada.
 * Recién validada cuenta en los KPIs. Lo del supervisor no se toca: lo
 * corregido vive en validacion_turno / _contador / _lote / _parada
 * (migraciones 20261108590000 y 20261109590000).
 *
 * Las funciones `filas*` son puras: arman lo que se ve a partir de los
 * turnos del día y lo ya validado.
 */

type Resultado = { ok: true } | { ok: false; error: string }

const TIPOS = ["TURNO_1", "TURNO_2", "TURNO_3"] as const

export type EstadoValidacion = "CONFIRMADO" | "EDITADO" | "EXCLUIDA"

/** Lo que la Analista hizo con una fila: confirmó, corrigió (`valor`) o, en paradas, marcó que no cuenta. */
export interface Validacion {
  estado: EstadoValidacion
  /** Valor corregido; null = vale el original. */
  valor: number | null
  nota: string | null
  validadoPorNombre: string | null
}

export interface EstadoJornada {
  fecha: string
  estado: "VALIDADA" | "REABIERTA"
  nota: string | null
  validadoPorNombre: string | null
  validadoEn: string
}

export interface TurnoJornada {
  turno: TurnoHistorial
  /** "T1", "T2", "T3"; si un tipo se repite (12x12), lleva la hora. */
  etiqueta: string
}

export interface DatosJornada {
  turnos: TurnoJornada[]
  paradas: Parada[]
  /** Ids de las paradas que siguen abiertas (el tramo de un turno ya cerrado trae fin, pero la parada no terminó). */
  paradasAbiertas?: Set<string>
  /** Las mismas paradas, por turno (id del turno): para los minutos sin reportar. */
  paradasPorTurno: Map<string, Parada[]>
  /** Cajas del supervisor por turno + sabor + presentación (suma de líneas). */
  cajas: { turnoId: string; saborNombre: string; volumenMl: number; cajas: number }[]
  validacionesCajas: ValidacionTurno[]
  contadores: Map<string, Validacion>
  lotes: Map<string, Validacion>
  paradasValidadas: Map<string, Validacion>
}

// ------------------------------------------------------------
// Carga
// ------------------------------------------------------------

/** Días hacia atrás donde buscar paradas que siguen abiertas. */
const DIAS_ATRAS_ABIERTAS = 7

const ETIQUETA_TIPO: Record<string, string> = { TURNO_1: "T1", TURNO_2: "T2", TURNO_3: "T3", "12X12": "12x12" }

/** "T1", "T2"…; si un tipo se repite, cada uno lleva su hora de inicio. */
export function etiquetarTurnos(turnos: TurnoHistorial[]): TurnoJornada[] {
  return turnos.map((turno) => {
    const base = ETIQUETA_TIPO[turno.turnoTipo] ?? turno.turnoTipo
    const repetido = turnos.filter((t) => t.turnoTipo === turno.turnoTipo).length > 1
    return { turno, etiqueta: repetido ? `${base} ${turno.horaInicio.slice(0, 5)}` : base }
  })
}

export interface FilaValidacion {
  estado: EstadoValidacion
  nota: string | null
  validado_por_nombre: string | null
}

export function aValidacion(f: FilaValidacion, valor: number | null): Validacion {
  return { estado: f.estado, valor: valor === null ? null : Number(valor), nota: f.nota, validadoPorNombre: f.validado_por_nombre }
}

export async function cargarJornada(usuario: string, area: string, fecha: string): Promise<DatosJornada | { error: string }> {
  const [porTurnoRes, valRes, validacionesCajas, ...porTipo] = await Promise.all([
    supabase.rpc("resumen_produccion_dia_por_turno", { p_usuario: usuario, p_area_codigo: area, p_fecha: fecha }),
    supabase.rpc("validacion_jornada_de", { p_usuario: usuario, p_area_codigo: area, p_fecha: fecha }),
    cargarValidacionesTurno(usuario, area, fecha),
    ...TIPOS.map((tipo) => supabase.rpc("turnos_de_fecha_tipo", { p_fecha: fecha, p_turno_tipo: tipo, p_area_codigo: area })),
  ])
  if (porTurnoRes.error) return { error: porTurnoRes.error.message || "No se pudieron leer las cajas del día." }
  if (valRes.error) return { error: valRes.error.message || "No se pudo leer lo validado del día." }
  if ("error" in validacionesCajas) return validacionesCajas
  const caida = porTipo.find((r) => r.error)
  if (caida?.error) return { error: caida.error.message || "No se pudieron cargar los turnos del día." }

  const turnos = etiquetarTurnos(
    porTipo.flatMap((r) => (Array.isArray(r.data) ? (r.data as Parameters<typeof mapearTurnoHistorial>[0][]) : [])).map(mapearTurnoHistorial),
  )

  const cajas = new Map<string, { turnoId: string; saborNombre: string; volumenMl: number; cajas: number }>()
  for (const f of (porTurnoRes.data ?? []) as { turno_id: string; sabor_nombre: string | null; presentacion_volumen_ml: number; cajas: number }[]) {
    const sabor = f.sabor_nombre ?? "Sin sabor"
    const llave = `${f.turno_id}|${sabor}|${f.presentacion_volumen_ml}`
    const actual = cajas.get(llave) ?? { turnoId: f.turno_id, saborNombre: sabor, volumenMl: f.presentacion_volumen_ml, cajas: 0 }
    actual.cajas += Number(f.cajas)
    cajas.set(llave, actual)
  }

  const val = valRes.data as {
    contadores: (FilaValidacion & { turno_linea_id: string; envases_llenadora: number | null })[]
    lotes: (FilaValidacion & { preparacion_id: string; volumen_final: number | null })[]
    paradas: (FilaValidacion & { parada_id: string; minutos: number | null })[]
  }
  const deCadaTurno = await Promise.all(turnos.map((t) => cargarParadasDelTurno(t.turno.id)))
  const paradas = deCadaTurno.flat()
  const paradasPorTurno = new Map(turnos.map((t, i) => [t.turno.id, deCadaTurno[i]]))
  // Sin recortar al turno: de ahí se sabe cuáles siguen abiertas (una puede venir de días atrás).
  const completas = await listarParadas({ desde: restarDias(fecha, DIAS_ATRAS_ABIERTAS), hasta: fecha, area })
  const paradasAbiertas = new Set(completas.filter((p) => p.fin === null).map((p) => p.id))

  return {
    turnos,
    paradas,
    paradasAbiertas,
    paradasPorTurno,
    cajas: [...cajas.values()],
    validacionesCajas,
    contadores: new Map(val.contadores.map((v) => [v.turno_linea_id, aValidacion(v, v.envases_llenadora)])),
    lotes: new Map(val.lotes.map((v) => [v.preparacion_id, aValidacion(v, v.volumen_final)])),
    paradasValidadas: new Map(val.paradas.map((v) => [v.parada_id, aValidacion(v, v.minutos)])),
  }
}

/** Estado de las jornadas validadas (o reabiertas) del rango. */
export async function cargarEstadosJornada(usuario: string, area: string, desde: string, hasta: string): Promise<EstadoJornada[]> {
  const { data, error } = await supabase.rpc("jornadas_validadas", { p_usuario: usuario, p_area_codigo: area, p_desde: desde, p_hasta: hasta })
  if (error || !data) return []
  return (data as { fecha: string; estado: EstadoJornada["estado"]; nota: string | null; validado_por_nombre: string | null; validado_en: string }[]).map(
    (f) => ({ fecha: f.fecha, estado: f.estado, nota: f.nota, validadoPorNombre: f.validado_por_nombre, validadoEn: f.validado_en }),
  )
}

// ------------------------------------------------------------
// Acciones
// ------------------------------------------------------------

const resultado = (error: { message?: string } | null, porDefecto: string): Resultado =>
  error ? { ok: false, error: error.message || porDefecto } : { ok: true }

/** Cajas de un sabor + presentación en un turno (la misma corrección del mensaje de WhatsApp). */
export function validarCajas(usuario: string, turnoId: string, saborNombre: string, volumenMl: number, cajas: number | null): Promise<Resultado> {
  return validarTurno(usuario, turnoId, saborNombre, volumenMl, cajas, "")
}

export async function validarContador(usuario: string, corridaId: string, envasesLlenadora: number | null): Promise<Resultado> {
  const { error } = await supabase.rpc("validar_contador", { p_usuario: usuario, p_turno_linea_id: corridaId, p_envases_llenadora: envasesLlenadora })
  return resultado(error, "No se pudo guardar el contador.")
}

export async function validarLote(usuario: string, loteId: string, fecha: string, volumenFinal: number | null): Promise<Resultado> {
  const { error } = await supabase.rpc("validar_lote", { p_usuario: usuario, p_preparacion_id: loteId, p_fecha: fecha, p_volumen_final: volumenFinal })
  return resultado(error, "No se pudo guardar el lote.")
}

export async function validarParada(usuario: string, paradaId: string, estado: EstadoValidacion, minutos: number | null): Promise<Resultado> {
  const { error } = await supabase.rpc("validar_parada", { p_usuario: usuario, p_parada_id: paradaId, p_estado: estado, p_minutos: minutos })
  return resultado(error, "No se pudo guardar la parada.")
}

export async function validarJornada(usuario: string, area: string, fecha: string): Promise<Resultado> {
  const { error } = await supabase.rpc("validar_jornada", { p_usuario: usuario, p_area_codigo: area, p_fecha: fecha })
  return resultado(error, "No se pudo validar la jornada.")
}

export async function reabrirJornada(usuario: string, area: string, fecha: string, nota: string): Promise<Resultado> {
  const { error } = await supabase.rpc("reabrir_jornada", { p_usuario: usuario, p_area_codigo: area, p_fecha: fecha, p_nota: nota })
  return resultado(error, "No se pudo reabrir la jornada.")
}

// ------------------------------------------------------------
// Filas de cada revisión (puras)
// ------------------------------------------------------------

export interface FilaCajas {
  id: string
  turnoId: string
  turno: string
  saborNombre: string
  volumenMl: number
  cajas: number
  validacion: Validacion | null
}

export function filasCajas(datos: Pick<DatosJornada, "turnos" | "cajas" | "validacionesCajas">): FilaCajas[] {
  const orden = new Map(datos.turnos.map((t, i) => [t.turno.id, i]))
  return datos.cajas
    .filter((c) => orden.has(c.turnoId))
    .sort((a, b) => (orden.get(a.turnoId)! - orden.get(b.turnoId)!) || a.saborNombre.localeCompare(b.saborNombre) || a.volumenMl - b.volumenMl)
    .map((c) => {
      const v = datos.validacionesCajas.find((x) => x.turnoId === c.turnoId && x.saborNombre === c.saborNombre && x.volumenMl === c.volumenMl)
      return {
        id: `${c.turnoId}|${c.saborNombre}|${c.volumenMl}`,
        turnoId: c.turnoId,
        turno: datos.turnos.find((t) => t.turno.id === c.turnoId)?.etiqueta ?? "",
        saborNombre: c.saborNombre,
        volumenMl: c.volumenMl,
        cajas: c.cajas,
        validacion: v ? { estado: v.estado, valor: v.cajas, nota: v.nota, validadoPorNombre: v.validadoPorNombre } : null,
      }
    })
}

export interface FilaEnvases {
  /** id de la corrida. */
  id: string
  turno: string
  lineaCodigo: string
  saborNombre: string
  presentacion: string
  lote: string | null
  /** Contador de la llenadora del supervisor (suma de la corrida). */
  contador: number
  buenos: number | null
  /** Envases del PT: cajas × envases por caja. null sin PT. */
  envasesPt: number | null
  justificacion: string | null
  validacion: Validacion | null
}

/** Merma de envases con el contador vigente (el corregido, si lo hay). null si falta contador o PT. */
export function mermaEnvases(f: FilaEnvases): number | null {
  const contador = f.validacion?.valor ?? f.contador
  if (contador <= 0 || f.envasesPt === null) return null
  return Math.round((1 - f.envasesPt / contador) * 10000) / 100
}

export function filasEnvases(turnos: TurnoJornada[], presentaciones: PresentacionLive[], validadas: Map<string, Validacion>): FilaEnvases[] {
  const filas: FilaEnvases[] = []
  for (const { turno, etiqueta } of turnos) {
    for (const c of turno.corridas) {
      const contadores = turno.contadores.filter((x) => x.corridaId === c.id)
      const pt = turno.productoTerminado.find((p) => p.corridaId === c.id) ?? null
      if (contadores.length === 0 && !pt) continue
      const pres = presentaciones.find((p) => p.codigo === c.presentacion)
      filas.push({
        id: c.id,
        turno: etiqueta,
        lineaCodigo: c.linea,
        saborNombre: c.saborNombre ?? "Sin sabor",
        presentacion: c.presentacion,
        lote: c.lote,
        contador: contadores.reduce((a, x) => a + x.envasesLlenadora, 0),
        buenos: contadores.some((x) => x.envasesBuenos != null) ? contadores.reduce((a, x) => a + (x.envasesBuenos ?? 0), 0) : null,
        envasesPt: pt && pres ? (pt.paletas * pres.cajasXPaleta + pt.cajasSueltas) * pres.envasesXCaja : null,
        justificacion: contadores.map((x) => x.justificacion?.trim()).filter(Boolean).join(" · ") || null,
        validacion: validadas.get(c.id) ?? null,
      })
    }
  }
  return filas
}

export interface FilaLote {
  /** id del lote (preparación). */
  id: string
  lote: string | null
  numeroTanque: number
  saborId: string | null
  saborNombre: string | null
  /** Volumen al empezar la jornada (o el preparado, si nació ese día). */
  inicio: number | null
  /** Recibido de otros lotes a mitad de turno. */
  entradas: number
  /** Transferido, desvasado o entregado a Vacío. */
  salidas: number
  /** Volumen al terminar la jornada, según el sistema. */
  final: number
  /** Suma de los tramos de los turnos (consumo según el sistema). */
  consumo: number
  pt: number
  /** Por qué no entra en la merma, si algún turno lo dejó afuera. */
  sinContraste: MotivoSinContraste | null
  validacion: Validacion | null
}

/** Consumo con el final corregido: lo que se corrige del final pasa al consumo. */
export function consumoLote(f: FilaLote): number {
  return f.validacion?.valor != null ? f.consumo + (f.final - f.validacion.valor) : f.consumo
}

/** Merma de semielaborado del lote en la jornada. null si no hay consumo. */
export function mermaLote(f: FilaLote): number | null {
  const consumo = consumoLote(f)
  if (consumo <= 0) return null
  return Math.round((1 - f.pt / consumo) * 10000) / 100
}

/** Lotes que tocó la jornada, sumando sus tramos turno por turno (los de Vacío no cuentan). */
export function filasLotes(turnos: TurnoJornada[], presentaciones: PresentacionLive[], validadas: Map<string, Validacion>): FilaLote[] {
  const porLote = new Map<string, FilaLote>()
  for (const { turno } of turnos) {
    const { tramos } = tramosPorLote(
      turno.id,
      turno.preparaciones,
      turno.corridas,
      turno.productoTerminado,
      turno.contadores,
      presentaciones,
      turno.transferencias,
      turno.desvases,
    )
    for (const t of tramos) {
      if (!t.lote) continue
      const fila = porLote.get(t.loteId)
      if (!fila) {
        porLote.set(t.loteId, {
          id: t.loteId,
          lote: t.lote.lote,
          numeroTanque: t.lote.numeroTanque,
          saborId: t.lote.saborId,
          saborNombre: t.lote.saborNombre,
          inicio: t.inicio,
          entradas: t.entrantes,
          salidas: t.salientes,
          final: t.fin,
          consumo: t.tramo ?? 0,
          pt: t.pt,
          sinContraste: t.excluido,
          validacion: validadas.get(t.loteId) ?? null,
        })
        continue
      }
      fila.entradas += t.entrantes
      fila.salidas += t.salientes
      fila.final = t.fin
      fila.consumo += t.tramo ?? 0
      fila.pt += t.pt
      fila.sinContraste = fila.sinContraste ?? t.excluido
    }
  }
  return [...porLote.values()].sort((a, b) => a.numeroTanque - b.numeroTanque || (a.lote ?? "").localeCompare(b.lote ?? ""))
}

export interface FilaParada {
  id: string
  lineaCodigo: string
  /** "T2 16:40" */
  cuando: string
  tipoNombre: string
  clase: Parada["clase"]
  /** Quién responde por la parada: el campo Responsable, no el origen. */
  responsable: "Operacional" | "Mantenimiento"
  deMantenimiento: boolean
  minutos: number
  /** Sin minutos todavía (+1 sin completar). */
  pendiente: boolean
  /** «No sé / es una falla»: tiene sus minutos, falta el código de Mantenimiento. No traba el cierre. */
  sinClasificar: boolean
  /** Sigue abierta (sin fin). */
  abierta: boolean
  /** Del supervisor y se pisa con una de Mantenimiento en la misma línea: probablemente la misma falla. */
  seSolapa: boolean
  /** Más de 4 horas. */
  larga: boolean
  validacion: Validacion | null
}

const MIN_PARADA_LARGA = 240
const numeroLinea = (codigo: string) => codigo.replace(/^LINEA_T?/, "")
const ms = (iso: string) => new Date(iso).getTime()

export function filasParadas(
  paradas: Parada[],
  validadas: Map<string, Validacion>,
  ahora: Date = new Date(),
  abiertas: Set<string> = new Set(),
): FilaParada[] {
  return [...paradas]
    .sort((a, b) => numeroLinea(a.lineaCodigo).localeCompare(numeroLinea(b.lineaCodigo)) || a.inicio.localeCompare(b.inicio))
    .map((p) => {
      const deMantenimiento = esDeMantenimiento(p)
      const fin = p.fin ? ms(p.fin) : ahora.getTime()
      const seSolapa =
        !deMantenimiento &&
        paradas.some(
          (o) =>
            o.id !== p.id &&
            esDeMantenimiento(o) &&
            numeroLinea(o.lineaCodigo) === numeroLinea(p.lineaCodigo) &&
            ms(o.inicio) < fin &&
            (o.fin ? ms(o.fin) : ahora.getTime()) > ms(p.inicio),
        )
      const minutos = duracionMin(p, ahora)
      return {
        id: p.id,
        lineaCodigo: p.lineaCodigo,
        cuando: `${ETIQUETA_TIPO[p.turnoTipo] ?? p.turnoTipo} ${p.inicio.slice(11, 16)}`,
        tipoNombre: p.tipoNombre,
        clase: p.clase,
        responsable: deMantenimiento ? "Mantenimiento" : "Operacional",
        deMantenimiento,
        minutos,
        pendiente: p.pendiente === true,
        sinClasificar: porClasificar(p),
        abierta: p.fin === null || abiertas.has(p.id),
        seSolapa,
        larga: minutos > MIN_PARADA_LARGA,
        validacion: validadas.get(p.id) ?? null,
      }
    })
}

/** Una revisión está completa cuando todas sus filas tienen validación. */
export const revisada = (filas: { validacion: Validacion | null }[]) => filas.every((f) => f.validacion !== null)

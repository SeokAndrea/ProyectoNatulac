import { supabase } from "@/lib/supabase"
import { leerSemanas } from "@/lib/programacion"
import { planDelMes } from "@/lib/programacionSemanal"
import type { PresentacionLive, VelocidadLive } from "@/lib/catalogosLive"
import { eficienciaDelTurno } from "@/lib/eficiencia"
import { mapearTurnoHistorial, type TurnoHistorial } from "@/lib/historialTurnos"
import { duracionMin, mapearFilaParada, type FilaParada, type Parada } from "@/lib/paradas"
import { aValidacion, consumoLote, filasEnvases, filasLotes, type FilaValidacion, type TurnoJornada, type Validacion } from "@/lib/validarJornada"
import { finDeMes, numeroLinea } from "@/lib/indicadores/calculos"
import { claveP, mesVacio, presentacionVacia, type DatosMes, type DatosPresentacion } from "@/lib/indicadores/tipos"

/*
 * Modo AUTOMÁTICO: el mes calculado SOLO con las jornadas VALIDADAS y con lo
 * que corrigió la Analista en Validar jornada (dueña, 2026-10-14). Usa las
 * mismas cuentas que el resto de la app, no fórmulas nuevas; todo se arma
 * día por día (como en Validar jornada) y después se suma:
 *
 *   Eficiencia      eficienciaDelTurno() turno por turno, con las cajas corregidas;
 *                   Σ producción ÷ Σ (producción + no programadas + sin reportar).
 *   Cajas           PT de cada corrida; si la Analista corrigió las cajas del turno
 *                   (sabor + presentación), se reparten entre sus corridas.
 *   Merma           filasEnvases(): PT contra el contador (el corregido, si lo hay).
 *   Paradas         las NO programadas que cuentan, con sus minutos corregidos, a la
 *                   presentación que corría a esa hora; las de entre corridas, a ninguna.
 *   Plan            Programación del mes, por presentación (ml). Si la corrieron
 *                   dos líneas, se reparte según lo que produjo cada una.
 *   Semielaborado   filasLotes() con el final corregido: Σ PT ÷ Σ consumo por familia.
 */

export interface CatalogosIndicadores {
  /** Códigos de línea del área (LINEA_1… o LINEA_T1…). */
  lineas: string[]
  presentaciones: PresentacionLive[]
  velocidades: VelocidadLive[]
  /** sabor_id → nombre de la familia (familias_producto). */
  familiaDeSabor: Map<string, string>
}

export interface TurnoConParadas {
  turno: TurnoHistorial
  paradas: Parada[]
}

/** Lo validado de un día (validacion_jornada_de). */
export interface ValidacionesDia {
  contadores: Map<string, Validacion>
  lotes: Map<string, Validacion>
  paradas: Map<string, Validacion>
}

/** Cajas corregidas de un turno, sabor y presentación (validacion_turno). */
export interface CajasValidadas {
  turnoId: string
  saborId: string
  volumenMl: number
  cajas: number
}

export interface EntradaMes {
  /** Turnos cerrados de las jornadas validadas. */
  turnos: TurnoConParadas[]
  /** Por fecha ('YYYY-MM-DD'). */
  validaciones: Map<string, ValidacionesDia>
  cajas: CajasValidadas[]
  /** Plan sin línea (programación diaria de antes, o productos de la semana que nunca se programaron): se reparte. */
  plan: { volumenMl: number; cajas: number }[]
  /**
   * Plan de la programación semanal, por producto (sabor + presentación), con la línea con que se
   * programó (migración 20261110790000). Va a la línea que de verdad lo corrió (asignarPlanProgramado).
   */
  planConLinea?: { linea: string; saborId?: string; volumenMl: number; cajas: number }[]
}

const redondear = (n: number, decimales: number) => Math.round(n * 10 ** decimales) / 10 ** decimales
const sinValidaciones = (): ValidacionesDia => ({ contadores: new Map(), lotes: new Map(), paradas: new Map() })

/** 'YYYY-MM-DDTHH:MM:SS' (hora de planta, como listar_paradas) corrido n minutos. */
function sumarMinutos(iso: string, minutos: number): string {
  const d = new Date(new Date(iso).getTime() + minutos * 60000)
  const dos = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}T${dos(d.getHours())}:${dos(d.getMinutes())}:${dos(d.getSeconds())}`
}

/** Las paradas como quedaron validadas: sin las que "no cuentan" y con los minutos corregidos. */
export function paradasValidadas(paradas: Parada[], validadas: Map<string, Validacion>): Parada[] {
  return paradas.flatMap((p) => {
    const v = validadas.get(p.id)
    if (v?.estado === "EXCLUIDA") return []
    return v?.valor != null ? [{ ...p, fin: sumarMinutos(p.inicio, v.valor) }] : [p]
  })
}

function eficienciaPorLinea(turnos: TurnoConParadas[], cat: CatalogosIndicadores, corregidas: CajasValidadas[]): DatosMes["eficiencia"] {
  const suma = new Map<string, { produccion: number; noProgramada: number }>()
  for (const { turno, paradas } of turnos) {
    // Lo reportado, con las cajas que corrigió la Analista (repartidas entre sus corridas).
    const productoTerminado = cajasDelDia([{ turno, etiqueta: "" }], cat, corregidas).map((c) => ({ corridaId: c.corridaId, paletas: 0, cajasSueltas: c.cajas }))
    const ef = eficienciaDelTurno({
      turnoTipo: turno.turnoTipo,
      esquema: turno.esquema,
      horaInicio: turno.horaInicio,
      estado: turno.estado,
      horasTranscurridas: 0,
      corridas: turno.corridas,
      productoTerminado,
      presentaciones: cat.presentaciones,
      velocidades: cat.velocidades,
      paradas,
      lineas: cat.lineas,
    })
    for (const [codigo, r] of ef.porLinea) {
      const s = suma.get(numeroLinea(codigo)) ?? { produccion: 0, noProgramada: 0 }
      s.produccion += r.produccionMin
      s.noProgramada += r.noProgramadaMin + (r.sinReportarMin ?? 0) // lo sin reportar castiga como no programada
      suma.set(numeroLinea(codigo), s)
    }
  }
  return Object.fromEntries([...suma].map(([l, s]) => [l, s.produccion > 0 ? Math.round((s.produccion / (s.produccion + s.noProgramada)) * 100) : null]))
}

/**
 * Cajas de cada corrida en cada turno del día: las del PT, o las corregidas del
 * turno (sabor + presentación) repartidas entre sus corridas según su PT.
 */
interface CajasCorrida {
  corridaId: string
  /** claveP(línea, presentación). */
  clave: string
  linea: string
  saborId: string | null
  volumenMl: number
  cajas: number
}

function cajasDelDia(turnos: TurnoJornada[], cat: CatalogosIndicadores, corregidas: CajasValidadas[]): CajasCorrida[] {
  const salida: CajasCorrida[] = []
  for (const { turno } of turnos) {
    const grupos = new Map<string, CajasCorrida[]>()
    for (const c of turno.corridas) {
      const pres = cat.presentaciones.find((p) => p.codigo === c.presentacion)
      const pt = turno.productoTerminado.find((p) => p.corridaId === c.id)
      if (!pres || !pt) continue
      const grupo = `${c.saborId}|${pres.volumenMl}`
      grupos.set(grupo, [
        ...(grupos.get(grupo) ?? []),
        {
          corridaId: c.id,
          clave: claveP(numeroLinea(c.linea), c.presentacion),
          linea: numeroLinea(c.linea),
          saborId: c.saborId,
          volumenMl: pres.volumenMl,
          cajas: pt.paletas * pres.cajasXPaleta + pt.cajasSueltas,
        },
      ])
    }
    for (const [grupo, filas] of grupos) {
      const v = corregidas.find((x) => x.turnoId === turno.id && `${x.saborId}|${x.volumenMl}` === grupo)
      const total = filas.reduce((s, f) => s + f.cajas, 0)
      for (const f of filas) salida.push({ ...f, cajas: !v ? f.cajas : total > 0 ? (v.cajas * f.cajas) / total : v.cajas / filas.length })
    }
  }
  return salida
}

/** Producto (sabor|ml) → cajas que hizo cada línea en el mes. */
type ProducidoPorProducto = Map<string, Map<string, number>>
const claveProducto = (saborId: string, volumenMl: number) => `${saborId}|${volumenMl}`

/** Cajas producidas y merma de envases por presentación, día por día. Devuelve lo producido de cada producto por línea. */
function cajasYMerma(
  dias: { turnos: TurnoJornada[]; v: ValidacionesDia }[],
  cat: CatalogosIndicadores,
  corregidas: CajasValidadas[],
  pres: Record<string, DatosPresentacion>,
): ProducidoPorProducto {
  const merma = new Map<string, { pt: number; contador: number }>()
  const porProducto: ProducidoPorProducto = new Map()
  for (const { turnos, v } of dias) {
    for (const c of cajasDelDia(turnos, cat, corregidas)) {
      const p = (pres[c.clave] ??= presentacionVacia())
      p.corrio = true
      p.prod = (p.prod ?? 0) + c.cajas
      if (c.saborId && c.cajas > 0) {
        const lineas = porProducto.get(claveProducto(c.saborId, c.volumenMl)) ?? new Map<string, number>()
        lineas.set(c.linea, (lineas.get(c.linea) ?? 0) + c.cajas)
        porProducto.set(claveProducto(c.saborId, c.volumenMl), lineas)
      }
    }
    for (const f of filasEnvases(turnos, cat.presentaciones, v.contadores)) {
      const clave = claveP(numeroLinea(f.lineaCodigo), f.presentacion)
      ;(pres[clave] ??= presentacionVacia()).corrio = true
      const contador = f.validacion?.valor ?? f.contador
      if (f.envasesPt != null && contador > 0) {
        const m = merma.get(clave) ?? { pt: 0, contador: 0 }
        m.pt += f.envasesPt
        m.contador += contador
        merma.set(clave, m)
      }
    }
  }
  for (const [clave, p] of Object.entries(pres)) {
    if (p.prod != null) p.prod = Math.round(p.prod)
    const m = merma.get(clave)
    p.merma = m ? redondear((1 - m.pt / m.contador) * 100, 2) : null
  }
  return porProducto
}

/**
 * Plan programado de cada producto (sabor + presentación) a la línea que DE VERDAD lo corrió en el
 * mes; si lo corrieron dos, según las cajas de cada una. Si no se produjo, queda en la línea con que
 * se programó (así se ve el incumplido). La analista elige solo el producto; la línea que pone la
 * app puede no ser la real, porque las líneas cambian de presentación (dueña, 2026-10-15).
 */
function asignarPlanProgramado(plan: NonNullable<EntradaMes["planConLinea"]>, porProducto: ProducidoPorProducto, pres: Record<string, DatosPresentacion>) {
  for (const { linea, saborId, volumenMl, cajas } of plan) {
    const corrieron = [...((saborId && porProducto.get(claveProducto(saborId, volumenMl))) || new Map<string, number>())]
    const total = corrieron.reduce((a, [, c]) => a + c, 0)
    const destino = total > 0 ? corrieron.map(([l, c]) => ({ l, parte: c / total })) : [{ l: linea, parte: 1 }]
    for (const { l, parte } of destino) {
      const p = (pres[claveP(l, String(volumenMl))] ??= presentacionVacia())
      p.plan = Math.round((p.plan ?? 0) + cajas * parte)
    }
  }
}

/** La corrida de la línea que estaba corriendo a esa hora (la última que arrancó antes). */
function corridaALaHora(turno: TurnoHistorial, linea: string, hora: number) {
  return turno.corridas
    .filter((c) => numeroLinea(c.linea) === linea && new Date(c.activadaEn).getTime() <= hora)
    .filter((c) => {
      const fin = c.finalizadaEn ?? c.entregadaEn
      return !fin || hora < new Date(fin).getTime()
    })
    .sort((a, b) => b.activadaEn.localeCompare(a.activadaEn))[0]
}

function paradasPorPresentacion(turnos: TurnoConParadas[], pres: Record<string, DatosPresentacion>) {
  const porClave = new Map<string, Map<string, { minutos: number; veces: number }>>()
  for (const { turno, paradas } of turnos) {
    for (const p of paradas) {
      if (p.clase !== "NO_PROGRAMADA") continue
      const linea = numeroLinea(p.lineaCodigo)
      const corrida = corridaALaHora(turno, linea, new Date(p.inicio).getTime())
      if (!corrida) continue
      const clave = claveP(linea, corrida.presentacion)
      const causas = porClave.get(clave) ?? new Map()
      const c = causas.get(p.tipoNombre) ?? { minutos: 0, veces: 0 }
      c.minutos += duracionMin(p)
      c.veces += 1
      causas.set(p.tipoNombre, c)
      porClave.set(clave, causas)
    }
  }
  for (const [clave, causas] of porClave) {
    const p = (pres[clave] ??= presentacionVacia())
    p.paradas = [...causas].map(([causa, c]) => ({ causa, minutos: c.minutos, veces: c.veces }))
  }
}

/** Cajas programadas de cada presentación (ml) a la línea que la corrió; si fueron dos, según lo producido. */
function repartirPlan(plan: EntradaMes["plan"], cat: CatalogosIndicadores, pres: Record<string, DatosPresentacion>) {
  const lineas = [...new Set(cat.lineas.map(numeroLinea))]
  for (const { volumenMl, cajas } of plan) {
    const ml = String(volumenMl)
    const corrieron = lineas.filter((l) => (pres[claveP(l, ml)]?.prod ?? 0) > 0)
    const total = corrieron.reduce((a, l) => a + pres[claveP(l, ml)].prod!, 0)
    const destino = corrieron.length
      ? corrieron.map((l) => ({ l, parte: pres[claveP(l, ml)].prod! / total }))
      : lineas
          .filter((l) => cat.velocidades.some((v) => v.activo && numeroLinea(v.linea) === l && v.presentacion === ml))
          .slice(0, 1)
          .map((l) => ({ l, parte: 1 }))
    for (const { l, parte } of destino) {
      const p = (pres[claveP(l, ml)] ??= presentacionVacia())
      p.plan = Math.round((p.plan ?? 0) + cajas * parte)
    }
  }
}

function semielaboradoPorFamilia(dias: { turnos: TurnoJornada[]; v: ValidacionesDia }[], cat: CatalogosIndicadores): DatosMes["semielaborado"] {
  const suma = new Map<string, { pt: number; consumo: number }>()
  for (const { turnos, v } of dias) {
    for (const f of filasLotes(turnos, cat.presentaciones, v.lotes)) {
      const familia = f.saborId ? cat.familiaDeSabor.get(f.saborId) : undefined
      const consumo = consumoLote(f)
      if (!familia || f.sinContraste || consumo <= 0) continue
      const s = suma.get(familia) ?? { pt: 0, consumo: 0 }
      s.pt += f.pt
      s.consumo += consumo
      suma.set(familia, s)
    }
  }
  return Object.fromEntries([...suma].map(([fam, s]) => [fam, redondear((s.pt / s.consumo) * 100, 1)]))
}

/** El mes completo, a partir de sus jornadas validadas. Pura (se prueba sin Supabase). */
export function calcularMesAutomatico(e: EntradaMes, cat: CatalogosIndicadores): DatosMes {
  const datos = mesVacio()
  const validadasDe = (fecha: string) => e.validaciones.get(fecha) ?? sinValidaciones()
  const turnos = e.turnos.map((t) => ({ turno: t.turno, paradas: paradasValidadas(t.paradas, validadasDe(t.turno.fecha).paradas) }))
  const fechas = [...new Set(turnos.map((t) => t.turno.fecha))]
  const dias = fechas.map((fecha) => ({
    turnos: turnos.filter((t) => t.turno.fecha === fecha).map((t): TurnoJornada => ({ turno: t.turno, etiqueta: "" })),
    v: validadasDe(fecha),
  }))
  datos.eficiencia = eficienciaPorLinea(turnos, cat, e.cajas)
  const porProducto = cajasYMerma(dias, cat, e.cajas, datos.presentaciones)
  paradasPorPresentacion(turnos, datos.presentaciones)
  repartirPlan(e.plan, cat, datos.presentaciones)
  asignarPlanProgramado(e.planConLinea ?? [], porProducto, datos.presentaciones)
  datos.semielaborado = semielaboradoPorFamilia(dias, cat)
  return datos
}

type FilaValidada<T> = FilaValidacion & T

interface RespuestaTurnos {
  turnos: { turno: Parameters<typeof mapearTurnoHistorial>[0]; paradas: FilaParada[] }[]
  validaciones: {
    fecha: string
    contadores: FilaValidada<{ turno_linea_id: string; envases_llenadora: number | null }>[]
    lotes: FilaValidada<{ preparacion_id: string; volumen_final: number | null }>[]
    paradas: FilaValidada<{ parada_id: string; minutos: number | null }>[]
  }[]
  cajas: { turno_id: string; sabor_id: string; volumen_ml: number; cajas: number }[]
  plan: { volumen_ml: number; cajas: number }[]
}

/** Lee el mes con indicadores_turnos (una sola consulta) y lo calcula. */
export async function cargarMesAutomatico(usuario: string, area: string, mes: string, cat: CatalogosIndicadores): Promise<DatosMes | { error: string }> {
  const [{ data, error }, prog] = await Promise.all([
    supabase.rpc("indicadores_turnos", { p_usuario: usuario, p_area_codigo: area, p_desde: mes, p_hasta: finDeMes(mes) }),
    leerSemanas(area, mes, finDeMes(mes)),
  ])
  if (error || !data) return { error: error?.message || "No se pudieron leer las jornadas del mes." }
  const r = data as RespuestaTurnos
  // Cajas planeadas: de la programación semanal (con su línea) y, para las semanas sin plan semanal,
  // de la diaria de antes. Si la base todavía no tiene la semanal, todo como antes.
  const planes = "error" in prog ? null : planDelMes(prog.semanas, mes)
  const viejoDelMes = "error" in prog ? [] : prog.viejo.filter((v) => v.fecha.slice(0, 7) === mes.slice(0, 7)).map((v) => ({ volumenMl: v.presentacionMl, cajas: v.cajasPlan }))
  return calcularMesAutomatico(
    {
      turnos: r.turnos.map((t) => ({ turno: mapearTurnoHistorial(t.turno), paradas: t.paradas.map(mapearFilaParada) })),
      validaciones: new Map(
        r.validaciones.map((v) => [
          v.fecha,
          {
            contadores: new Map(v.contadores.map((x) => [x.turno_linea_id, aValidacion(x, x.envases_llenadora)])),
            lotes: new Map(v.lotes.map((x) => [x.preparacion_id, aValidacion(x, x.volumen_final)])),
            paradas: new Map(v.paradas.map((x) => [x.parada_id, aValidacion(x, x.minutos)])),
          },
        ]),
      ),
      cajas: r.cajas.map((c) => ({ turnoId: c.turno_id, saborId: c.sabor_id, volumenMl: c.volumen_ml, cajas: Number(c.cajas) })),
      plan: planes ? [...viejoDelMes, ...planes.sinLinea] : r.plan.map((p) => ({ volumenMl: p.volumen_ml, cajas: Number(p.cajas) })),
      planConLinea: planes?.conLinea ?? [],
    },
    cat,
  )
}

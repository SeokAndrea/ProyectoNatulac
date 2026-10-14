import { supabase } from "@/lib/supabase"
import type { PresentacionLive, VelocidadLive } from "@/lib/catalogosLive"
import { eficienciaDelTurno } from "@/lib/eficiencia"
import { mapearTurnoHistorial, type TurnoHistorial } from "@/lib/historialTurnos"
import { duracionMin, mapearFilaParada, type FilaParada, type Parada } from "@/lib/paradas"
import { consumoLote, filasEnvases, filasLotes, type TurnoJornada } from "@/lib/validarJornada"
import { finDeMes, numeroLinea } from "@/lib/indicadores/calculos"
import { claveP, mesVacio, presentacionVacia, type DatosMes, type DatosPresentacion } from "@/lib/indicadores/tipos"

/*
 * Modo AUTOMÁTICO: el mes calculado con los turnos CERRADOS (todavía no
 * solo las jornadas validadas: falta que la dueña lo decida). Usa las
 * mismas cuentas que el resto de la app, no fórmulas nuevas:
 *
 *   Eficiencia      eficienciaDelTurno() turno por turno; Σ operativo ÷ Σ disponible.
 *   Cajas y merma   filasEnvases() de Validar jornada: PT contra contador, por corrida.
 *   Paradas         las NO programadas, a la presentación que corría a esa hora;
 *                   las de entre corridas no van a ninguna.
 *   Plan            Programación del mes, por presentación (ml). Si la corrieron
 *                   dos líneas, se reparte según lo que produjo cada una.
 *   Semielaborado   filasLotes() de Validar jornada: Σ PT ÷ Σ consumo por familia.
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

const redondear = (n: number, decimales: number) => Math.round(n * 10 ** decimales) / 10 ** decimales

function eficienciaPorLinea(turnos: TurnoConParadas[], cat: CatalogosIndicadores): DatosMes["eficiencia"] {
  const suma = new Map<string, { disponible: number; operativo: number }>()
  for (const { turno, paradas } of turnos) {
    const ef = eficienciaDelTurno({
      turnoTipo: turno.turnoTipo,
      esquema: turno.esquema,
      horaInicio: turno.horaInicio,
      estado: turno.estado,
      horasTranscurridas: 0,
      corridas: turno.corridas,
      contadores: turno.contadores,
      presentaciones: cat.presentaciones,
      velocidades: cat.velocidades,
      paradas,
      lineas: cat.lineas,
    })
    for (const [codigo, r] of ef.porLinea) {
      const s = suma.get(numeroLinea(codigo)) ?? { disponible: 0, operativo: 0 }
      s.disponible += r.disponibleMin
      s.operativo += r.operativoMin
      suma.set(numeroLinea(codigo), s)
    }
  }
  return Object.fromEntries([...suma].map(([l, s]) => [l, s.disponible > 0 ? Math.round((s.operativo / s.disponible) * 100) : null]))
}

/** Cajas producidas y merma de envases por presentación. */
function cajasYMerma(turnos: TurnoJornada[], cat: CatalogosIndicadores, pres: Record<string, DatosPresentacion>) {
  const merma = new Map<string, { pt: number; contador: number }>()
  for (const f of filasEnvases(turnos, cat.presentaciones, new Map())) {
    const clave = claveP(numeroLinea(f.lineaCodigo), f.presentacion)
    const p = (pres[clave] ??= presentacionVacia())
    p.corrio = true
    const porCaja = cat.presentaciones.find((x) => x.codigo === f.presentacion)?.envasesXCaja ?? 0
    if (f.envasesPt != null && porCaja > 0) p.prod = (p.prod ?? 0) + f.envasesPt / porCaja
    if (f.envasesPt != null && f.contador > 0) {
      const m = merma.get(clave) ?? { pt: 0, contador: 0 }
      m.pt += f.envasesPt
      m.contador += f.contador
      merma.set(clave, m)
    }
  }
  for (const [clave, p] of Object.entries(pres)) {
    if (p.prod != null) p.prod = Math.round(p.prod)
    const m = merma.get(clave)
    p.merma = m ? redondear((1 - m.pt / m.contador) * 100, 2) : null
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
function repartirPlan(plan: { volumenMl: number; cajas: number }[], cat: CatalogosIndicadores, pres: Record<string, DatosPresentacion>) {
  for (const { volumenMl, cajas } of plan) {
    const ml = String(volumenMl)
    const lineas = [...new Set(cat.lineas.map(numeroLinea))]
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

function semielaboradoPorFamilia(turnos: TurnoJornada[], cat: CatalogosIndicadores): DatosMes["semielaborado"] {
  const suma = new Map<string, { pt: number; consumo: number }>()
  for (const f of filasLotes(turnos, cat.presentaciones, new Map())) {
    const familia = f.saborId ? cat.familiaDeSabor.get(f.saborId) : undefined
    const consumo = consumoLote(f)
    if (!familia || f.sinContraste || consumo <= 0) continue
    const s = suma.get(familia) ?? { pt: 0, consumo: 0 }
    s.pt += f.pt
    s.consumo += consumo
    suma.set(familia, s)
  }
  return Object.fromEntries([...suma].map(([fam, s]) => [fam, redondear((s.pt / s.consumo) * 100, 1)]))
}

/** El mes completo, a partir de sus turnos cerrados y lo programado. Pura (se prueba sin Supabase). */
export function calcularMesAutomatico(turnos: TurnoConParadas[], plan: { volumenMl: number; cajas: number }[], cat: CatalogosIndicadores): DatosMes {
  const datos = mesVacio()
  const jornada: TurnoJornada[] = turnos.map((t) => ({ turno: t.turno, etiqueta: "" }))
  datos.eficiencia = eficienciaPorLinea(turnos, cat)
  cajasYMerma(jornada, cat, datos.presentaciones)
  paradasPorPresentacion(turnos, datos.presentaciones)
  repartirPlan(plan, cat, datos.presentaciones)
  datos.semielaborado = semielaboradoPorFamilia(jornada, cat)
  return datos
}

interface RespuestaTurnos {
  turnos: { turno: Parameters<typeof mapearTurnoHistorial>[0]; paradas: FilaParada[] }[]
  plan: { volumen_ml: number; cajas: number }[]
}

/** Lee el mes con indicadores_turnos (una sola consulta) y lo calcula. */
export async function cargarMesAutomatico(usuario: string, area: string, mes: string, cat: CatalogosIndicadores): Promise<DatosMes | { error: string }> {
  const { data, error } = await supabase.rpc("indicadores_turnos", { p_usuario: usuario, p_area_codigo: area, p_desde: mes, p_hasta: finDeMes(mes) })
  if (error || !data) return { error: error?.message || "No se pudieron leer los turnos del mes." }
  const r = data as RespuestaTurnos
  return calcularMesAutomatico(
    r.turnos.map((t) => ({ turno: mapearTurnoHistorial(t.turno), paradas: t.paradas.map(mapearFilaParada) })),
    r.plan.map((p) => ({ volumenMl: p.volumen_ml, cajas: Number(p.cajas) })),
    cat,
  )
}

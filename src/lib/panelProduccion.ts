import { supabase } from "@/lib/supabase"
import { mapearTurno, type FilaTurno, type TurnoActivo } from "@/lib/turno"
import type { PresentacionLive } from "@/lib/catalogosLive"

/*
 * Panel de Producción: estado actual de la planta (o histórico por
 * fecha/tipo, ver supabase/migrations/20260906090000_panel_produccion.sql).
 * Reutiliza mapearTurno() de turno.tsx — es el mismo objeto
 * TurnoActivo que usa Comenzar/Finalizar Turno, solo que acá puede
 * ser de CUALQUIER supervisor, no del usuario logueado.
 */
export async function obtenerEstadoPlantaActual(areaCodigo: string | null): Promise<TurnoActivo | null> {
  const { data, error } = await supabase.rpc("estado_planta_actual", { p_area_codigo: areaCodigo })
  if (error || !data) return null
  return mapearTurno(data as FilaTurno)
}

export async function obtenerTurnoDeFechaTipo(fecha: string, turnoTipo: string, areaCodigo: string | null): Promise<TurnoActivo | null> {
  const { data, error } = await supabase.rpc("turno_de_fecha_tipo", {
    p_fecha: fecha,
    p_turno_tipo: turnoTipo,
    p_area_codigo: areaCodigo,
  })
  if (error || !data) return null
  return mapearTurno(data as FilaTurno)
}

/*
 * Meta: cajas que DEBERÍAN haber salido de cada línea activa, según
 * la velocidad elegida en Comenzar Turno y las horas transcurridas
 * del turno — no un número fijo cargado a mano. Si en 3h debían salir
 * 3000 cajas y salieron 2000, no se cumplió — ahí es donde después se
 * van a poder cargar las paradas que lo explican (todavía sin
 * construir). Por ahora el cálculo no necesita paradas, solo mide el
 * resultado.
 */
export interface MetaLinea {
  linea: string
  cajasEsperadas: number
  cajasReales: number
}

export function calcularMeta(
  turno: TurnoActivo,
  presentaciones: PresentacionLive[],
): { porLinea: MetaLinea[]; totalEsperadas: number; totalReales: number; pctCumplimiento: number | null } {
  const horas = horasTranscurridasTurno(turno)

  // Solo las corridas ACTIVAS ahora mismo — turno.lineas trae también
  // las que ya se finalizaron durante este turno (historial), esas no
  // cuentan para la meta en curso.
  const porLinea: MetaLinea[] = turno.lineas
    .filter((l) => l.activa)
    .map((l) => {
      const pres = presentaciones.find((p) => p.codigo === l.presentacion)
      const cajasHora = pres && pres.envasesXCaja > 0 ? l.envasesHora / pres.envasesXCaja : 0
      const cajasEsperadas = Math.round(cajasHora * horas)

      const envasesLlenadora = turno.contadores.filter((c) => c.turnoLineaId === l.id).reduce((a, c) => a + c.envasesLlenadora, 0)
      const cajasReales = pres && pres.envasesXCaja > 0 ? Math.round(envasesLlenadora / pres.envasesXCaja) : 0

      return { linea: l.linea, cajasEsperadas, cajasReales }
    })

  const totalEsperadas = porLinea.reduce((a, m) => a + m.cajasEsperadas, 0)
  const totalReales = porLinea.reduce((a, m) => a + m.cajasReales, 0)
  const pctCumplimiento = totalEsperadas === 0 ? null : Math.round((totalReales / totalEsperadas) * 1000) / 10

  return { porLinea, totalEsperadas, totalReales, pctCumplimiento }
}

/** Horas transcurridas desde el inicio del turno (hasta ahora si sigue abierto, o hasta el cierre si ya cerró). */
export function horasTranscurridasTurno(turno: TurnoActivo): number {
  const [h1, m1] = turno.horaInicio.split(":").map(Number)
  const ahora = new Date()
  const horaActual = `${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}:${String(ahora.getSeconds()).padStart(2, "0")}`
  const [h2, m2] = horaActual.split(":").map(Number)
  let minutos = h2 * 60 + m2 - (h1 * 60 + m1)
  if (minutos < 0) minutos += 24 * 60
  return Math.max(minutos / 60, 0.1)
}

export interface MermaEnvasesTurno {
  pct: number | null
}

/**
 * Merma de ENVASES de todo el turno (todas las corridas juntas):
 * envases de Producto Terminado contra los que sumaron los
 * contadores. Ya no existe una "merma teórica" aparte (dependía de
 * envases_desechados, columna que se sacó de Contadores) — queda una
 * sola merma, la misma que se calcula por corrida en mermaCorrida()
 * de turno.tsx.
 */
export function mermaEnvasesTurno(turno: TurnoActivo, presentaciones: PresentacionLive[]): MermaEnvasesTurno {
  const llenadoraTotal = turno.contadores.reduce((a, c) => a + c.envasesLlenadora, 0)

  const envasesRealesTotal = turno.productoTerminado.reduce((a, p) => {
    const pres = presentaciones.find((pr) => pr.codigo === p.presentacion)
    const cajasXPaleta = pres?.cajasXPaleta ?? 0
    const envasesXCaja = pres?.envasesXCaja ?? 0
    return a + (p.paletas * cajasXPaleta + p.cajasSueltas) * envasesXCaja
  }, 0)
  const pct = llenadoraTotal === 0 ? null : Math.round((1 - envasesRealesTotal / llenadoraTotal) * 10000) / 100

  return { pct }
}

/**
 * Merma de ENVASES de una línea puntual, sumando TODAS sus corridas
 * del turno (no solo la corrida activa ahora mismo) — mismo criterio
 * de "sumar todo y recién ahí dividir" que mermaEnvasesTurno(), pero
 * acotado a las corridas de esa línea. Si la línea ya cerró un lote y
 * arrancó uno nuevo en el mismo turno (ej. preparó encima de un
 * tanque en Standby), el lote nuevo recién arranca sin contador propio
 * todavía — sin esto, el dashboard de la línea individual mostraba "—"
 * en vez de la merma real acumulada de esa línea en el turno.
 */
export function mermaLineaTurno(turno: TurnoActivo, lineaCodigo: string, presentaciones: PresentacionLive[]): { pct: number | null } {
  const corridaIds = new Set(turno.lineas.filter((l) => l.linea === lineaCodigo).map((l) => l.id))

  const llenadora = turno.contadores
    .filter((c) => c.turnoLineaId && corridaIds.has(c.turnoLineaId))
    .reduce((a, c) => a + c.envasesLlenadora, 0)

  const envasesReales = turno.productoTerminado
    .filter((p) => p.turnoLineaId && corridaIds.has(p.turnoLineaId))
    .reduce((a, p) => {
      const pres = presentaciones.find((pr) => pr.codigo === p.presentacion)
      const cajasXPaleta = pres?.cajasXPaleta ?? 0
      const envasesXCaja = pres?.envasesXCaja ?? 0
      return a + (p.paletas * cajasXPaleta + p.cajasSueltas) * envasesXCaja
    }, 0)

  const pct = llenadora === 0 ? null : Math.round((1 - envasesReales / llenadora) * 10000) / 100
  return { pct }
}

export interface MermaSemielaboradoTurno {
  pct: number | null
  litrosConsumidos: number
  litrosProducidos: number
}

/**
 * Merma de SEMIELABORADO: litros que salieron REALMENTE de los
 * tanques — por cada lote (preparación) que tocó alguna corrida de
 * este turno, volumenInicialL - volumenL actual — contra los litros
 * que efectivamente salieron en Producto Terminado. Es la merma de
 * ANTES de la llenadora (jarabe/mezcla que no llegó a envasarse) —
 * complementa a mermaEnvasesTurno(), que mide la de DESPUÉS (llenadora
 * vs. paletizado).
 *
 * OJO: no se calcula desde el Contador (envasesLlenadora × volumenMl)
 * — ese cálculo asumía que registrar_contador() seguía descontando del
 * lote, pero eso se sacó en 20260928090000_cerrar_corrida_desde_contador_o_producto.sql
 * (el único que descuenta volumen_l hoy es Producto Terminado, ver
 * registrar_producto_terminado()). Además el tanque puede corregirse a
 * mano (Corregir) o sumar un resto de Standby — el volumen real del
 * tanque, no el contador, es la única fuente confiable de "cuánto
 * salió".
 */
export function mermaSemielaboradoTurno(turno: TurnoActivo): MermaSemielaboradoTurno {
  const loteIds = new Set(turno.lineas.map((l) => l.loteId).filter((id): id is string => id !== null))

  const litrosConsumidos = [...loteIds].reduce((a, loteId) => {
    const lote = turno.preparaciones.find((p) => p.id === loteId)
    if (!lote || lote.volumenInicialL === null) return a
    return a + (lote.volumenInicialL - (lote.volumenL ?? 0))
  }, 0)

  const litrosProducidos = turno.productoTerminado.reduce((a, p) => a + p.litrosProducidos, 0)
  const pct = litrosConsumidos === 0 ? null : Math.round((1 - litrosProducidos / litrosConsumidos) * 10000) / 100

  return { pct, litrosConsumidos, litrosProducidos }
}

export interface ResumenTurnoAnterior {
  turnoCodigo: string
  fecha: string
  horaFin: string | null
  mermaPct: number | null
  mermaSemielaboradoPct: number | null
  litrosProducidos: number
  cajasProducidas: number
}

/**
 * El último turno CERRADO de esta área (sin contar el turno en vivo
 * actual) — para mostrar su merma/litros/cajas final como referencia
 * ("cómo terminó el turno pasado") al lado de lo que va del turno en
 * curso.
 *
 * OJO: antes esto se calculaba a mano desde estadisticas_produccion()
 * (contador × volumenMl) — una fórmula DISTINTA a la que usa "turno
 * actual" (mermaSemielaboradoTurno(), por tanque). Las dos vías podían
 * dar números distintos para el MISMO turno ya cerrado, y alguna de
 * las dos terminaba pasándose de 100% de Rendimiento sin sentido
 * físico. Ahora turno_anterior_json() devuelve el turno_json()
 * completo de ese turno y acá se corre por las MISMAS funciones
 * (mermaEnvasesTurno/mermaSemielaboradoTurno) que usa el turno en
 * vivo — es imposible que vuelvan a divergir, porque es literalmente
 * el mismo código.
 */
export async function obtenerResumenTurnoAnterior(
  areaCodigo: string,
  turnoActualId: string | null,
  presentaciones: PresentacionLive[],
): Promise<ResumenTurnoAnterior | null> {
  const { data, error } = await supabase.rpc("turno_anterior_json", {
    p_area_codigo: areaCodigo,
    p_turno_actual_id: turnoActualId,
  })
  if (error || !data) return null

  const turno = mapearTurno(data as FilaTurno)
  const mermaEnvases = mermaEnvasesTurno(turno, presentaciones)
  const mermaSemielaborado = mermaSemielaboradoTurno(turno)
  const litrosProducidos = turno.productoTerminado.reduce((a, p) => a + p.litrosProducidos, 0)
  const cajasProducidas = turno.productoTerminado.reduce((a, p) => {
    const pres = presentaciones.find((pr) => pr.codigo === p.presentacion)
    const cajasXPaleta = pres?.cajasXPaleta ?? 0
    return a + (p.paletas * cajasXPaleta + p.cajasSueltas)
  }, 0)

  return {
    turnoCodigo: turno.codigo,
    fecha: turno.fecha,
    horaFin: turno.horaFin,
    mermaPct: mermaEnvases.pct,
    mermaSemielaboradoPct: mermaSemielaborado.pct,
    litrosProducidos,
    cajasProducidas,
  }
}

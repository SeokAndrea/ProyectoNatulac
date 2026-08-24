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
export async function obtenerEstadoPlantaActual(): Promise<TurnoActivo | null> {
  const { data, error } = await supabase.rpc("estado_planta_actual")
  if (error || !data) return null
  return mapearTurno(data as FilaTurno)
}

export async function obtenerTurnoDeFechaTipo(fecha: string, turnoTipo: string): Promise<TurnoActivo | null> {
  const { data, error } = await supabase.rpc("turno_de_fecha_tipo", { p_fecha: fecha, p_turno_tipo: turnoTipo })
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

export interface MermaResumenTurno {
  pct: number | null
}

/**
 * Merma de TODO el turno (todas las corridas juntas): envases de
 * Producto Terminado contra los que sumaron los contadores. Ya no
 * existe una "merma teórica" aparte (dependía de envases_desechados,
 * columna que se sacó de Contadores) — queda una sola merma, la
 * misma que se calcula por corrida en mermaCorrida() de turno.tsx.
 */
export function mermaResumenTurno(turno: TurnoActivo, presentaciones: PresentacionLive[]): MermaResumenTurno {
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

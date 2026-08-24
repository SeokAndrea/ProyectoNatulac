import { supabase } from "@/lib/supabase"
import type { AreaCodigo, GrupoCodigo, LineaCodigo, TurnoTipoCodigo } from "@/lib/catalogos"

/*
 * Dashboard de producción — construida sobre lo que ya existe (turnos
 * cerrados, contadores, producto_terminado), sin el catálogo de
 * paradas descrito en resumen-diseno-dashboard-natulac.md (todavía
 * sin construir). Cada fila es una CORRIDA (turno_lineas, ver
 * src/lib/turno.tsx) — antes era un (turno, línea), pero una línea
 * puede tener varias corridas (una por lote) en el mismo turno; los
 * cálculos de merma y horas se hacen acá, no en SQL, para poder
 * recortarlos por cualquier dimensión sin duplicar la función de
 * Supabase.
 *
 * Merma: comparando lo que efectivamente se paletizó (Producto
 * Terminado, convertido a envases) contra lo que la llenadora contó
 * — la diferencia son las pérdidas que pasan después de la llenadora
 * (paletizado, manipuleo, etc.). Ya no existe una "merma teórica"
 * aparte (dependía de envases_desechados, columna que Contadores
 * perdió al pasar a un solo valor).
 */
export interface FilaEstadistica {
  turnoId: string
  turnoCodigo: string
  fecha: string
  horaInicio: string
  horaFin: string | null
  estado: "ABIERTO" | "CERRADO"
  turnoTipo: TurnoTipoCodigo
  grupo: GrupoCodigo
  area: AreaCodigo
  supervisorUsuario: string
  supervisorNombre: string
  linea: LineaCodigo
  turnoLineaId: string
  envasesLlenadora: number
  paletas: number
  cajasSueltas: number
  cajasXPaleta: number
  envasesXCaja: number
  litrosProducidos: number
  saborNombre: string | null
}

interface FilaCruda {
  turno_id: string
  turno_codigo: string
  fecha: string
  hora_inicio: string
  hora_fin: string | null
  estado: "ABIERTO" | "CERRADO"
  turno_tipo_codigo: string
  grupo_codigo: string
  area_codigo: string
  supervisor_usuario: string
  supervisor_nombre: string
  linea_codigo: string
  turno_linea_id: string
  envases_llenadora: number
  paletas: number
  cajas_sueltas: number
  cajas_x_paleta: number
  envases_x_caja: number
  litros_producidos: number
  sabor_nombre: string | null
}

export async function obtenerEstadisticas(filtros: {
  fechaDesde?: string
  fechaHasta?: string
}): Promise<FilaEstadistica[]> {
  const { data, error } = await supabase.rpc("estadisticas_produccion", {
    p_fecha_desde: filtros.fechaDesde || null,
    p_fecha_hasta: filtros.fechaHasta || null,
  })
  if (error || !data) return []
  return (data as FilaCruda[]).map((f) => ({
    turnoId: f.turno_id,
    turnoCodigo: f.turno_codigo,
    fecha: f.fecha,
    horaInicio: f.hora_inicio,
    horaFin: f.hora_fin,
    estado: f.estado,
    turnoTipo: f.turno_tipo_codigo as TurnoTipoCodigo,
    grupo: f.grupo_codigo as GrupoCodigo,
    area: f.area_codigo as AreaCodigo,
    supervisorUsuario: f.supervisor_usuario,
    supervisorNombre: f.supervisor_nombre,
    linea: f.linea_codigo as LineaCodigo,
    turnoLineaId: f.turno_linea_id,
    envasesLlenadora: f.envases_llenadora,
    paletas: f.paletas,
    cajasSueltas: f.cajas_sueltas,
    cajasXPaleta: f.cajas_x_paleta,
    envasesXCaja: f.envases_x_caja,
    litrosProducidos: f.litros_producidos,
    saborNombre: f.sabor_nombre,
  }))
}

/** Envases realmente empacados, según Producto Terminado. */
export function envasesReales(fila: FilaEstadistica): number {
  return (fila.paletas * fila.cajasXPaleta + fila.cajasSueltas) * fila.envasesXCaja
}

/** % de diferencia entre lo que contó la llenadora y lo que terminó empacado. */
export function mermaPct(fila: FilaEstadistica): number | null {
  if (fila.envasesLlenadora === 0) return null
  return Math.round((1 - envasesReales(fila) / fila.envasesLlenadora) * 10000) / 100
}

/**
 * Horas entre inicio y fin del turno. Maneja el cruce de medianoche
 * (Turno 3, 22:30 → 07:00): si la hora de fin es "menor" que la de
 * inicio, se asume que pasó a la madrugada del día siguiente.
 *
 * Si el turno sigue ABIERTO (todavía no tiene hora_fin), se usa la
 * hora actual como aproximación — así las estadísticas van sumando
 * en vivo a medida que el supervisor carga contadores, en vez de
 * aparecer recién cuando finaliza el turno.
 */
export function horasTurno(fila: FilaEstadistica): number | null {
  const horaFin = fila.horaFin ?? (fila.estado === "ABIERTO" ? new Date().toTimeString().slice(0, 8) : null)
  if (!horaFin) return null
  const [h1, m1] = fila.horaInicio.split(":").map(Number)
  const [h2, m2] = horaFin.split(":").map(Number)
  let minutos = h2 * 60 + m2 - (h1 * 60 + m1)
  if (minutos < 0) minutos += 24 * 60
  return Math.round((minutos / 60) * 100) / 100
}

export function promedio(valores: (number | null)[]): number | null {
  const validos = valores.filter((v): v is number => v !== null)
  if (validos.length === 0) return null
  return Math.round((validos.reduce((a, b) => a + b, 0) / validos.length) * 100) / 100
}

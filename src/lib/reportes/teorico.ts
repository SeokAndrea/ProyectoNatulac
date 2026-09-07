/**
 * Fórmulas puras de Reportes — no saben qué es un lote, ni un tanque, ni
 * una corrida. Reciben números limpios, devuelven un porcentaje. Ver
 * plan-rework-3-modulos-y-merma.md, Fase 1.
 *
 * Las dos formas que hoy están repetidas a mano en panelProduccion.ts
 * (merma de envases, merma de semielaborado, y el % de meta) colapsan acá
 * — mismo redondeo exacto que el código de hoy, no se "arregla" la
 * inconsistencia de decimales entre las dos (2 decimales para merma, 1
 * para cumplimiento): cambiar eso sería cambiar comportamiento, fuera de
 * alcance de la Fase 1.
 */

/** 1 − real/esperado, como % con 2 decimales. null si esperado <= 0 (no hay nada contra qué medir). */
export function pctRendimiento(esperado: number, real: number): number | null {
  if (esperado <= 0) return null
  return Math.round((1 - real / esperado) * 10000) / 100
}

/** real/esperado, como % con 1 decimal. null si esperado === 0. */
export function pctCumplimiento(esperado: number, real: number): number | null {
  if (esperado === 0) return null
  return Math.round((real / esperado) * 1000) / 10
}

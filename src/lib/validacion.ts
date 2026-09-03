/*
 * Módulo VALIDAR (SUPERADMINISTRADOR): Daniela revisa cada corrida
 * (turno + línea + lote) de los turnos CERRADOS y marca SÍ (el valor
 * del supervisor es el bueno) o EDITAR (lo corrige). Solo lo validado
 * alimenta el dashboard de KPIs futuro. Ver plan-validar-produccion.md.
 *
 * Por ahora acá viven solo los tipos + los helpers puros; los wrappers
 * de RPC se agregan cuando exista la migración (el preview
 * /validar-demo usa un fixture).
 */
export type EstadoValidacion = "PENDIENTE" | "CONFIRMADO" | "EDITADO"

/** Números de una corrida — los del supervisor (calculados) o los que corrige Daniela. */
export interface ValoresProduccion {
  paletas: number
  cajasSueltas: number
  /** Total de cajas (paletas × cajas/paleta + sueltas). */
  cajas: number
  /** Contador de la llenadora de esa corrida. */
  envasesLlenadora: number
  /** Litros que sacó la llenadora (contador × volumen de la presentación). */
  litrosConsumidos: number
  /** Litros que quedaron como producto (cajas × litros/caja). */
  litrosProducidos: number
  mermaEnvasesPct: number | null
  mermaSemielaboradoPct: number | null
}

/** Lo que Daniela puede pisar al EDITAR — todo opcional (lo que no toca queda como el supervisor). */
export interface OverridesValidacion {
  paletas?: number
  cajasSueltas?: number
  envasesLlenadora?: number
  litrosConsumidos?: number
  lote?: string
  mermaEnvasesPct?: number
  mermaSemielaboradoPct?: number
  nota?: string
}

/** Estado de un tanque en un momento del turno (recibido al inicio / dejado al final). */
export interface TanqueEstado {
  numeroTanque: 1 | 2 | 3
  /** Rótulo legible: "Listo", "Con Restos", "Sucio", "Limpio", "En CIP", "En Preparación". */
  condicion: string
  sabor: string | null
  lote: string | null
  volumenL: number | null
}

/** Los tanques de un turno — para que Daniela cruce contra el acta en papel. */
export interface TurnoTanques {
  turnoCodigo: string
  /** Foto al INICIO (tanques_encontrados). Vacío si el supervisor nunca confirmó los 3. */
  recibidos: TanqueEstado[]
  /** Estado al FINAL del turno. */
  dejados: TanqueEstado[]
}

export interface FilaValidacion {
  turnoLineaId: string
  turnoCodigo: string
  fecha: string
  supervisorNombre: string
  areaNombre: string
  linea: string
  presentacion: string
  sabor: string | null
  lote: string | null
  estado: EstadoValidacion
  /** Lo que cargó el supervisor (siempre presente). */
  supervisor: ValoresProduccion
  /** Overrides guardados si `estado === "EDITADO"` (los campos que Daniela cambió). */
  overrides: OverridesValidacion | null
  validadoPorNombre: string | null
  validadoEn: string | null
}

/** El valor efectivo de un campo: el de Daniela si lo pisó, si no el del supervisor. */
export function efectivo<K extends keyof ValoresProduccion>(fila: FilaValidacion, campo: K): ValoresProduccion[K] {
  const ov = fila.overrides as Record<string, unknown> | null
  if (fila.estado === "EDITADO" && ov && ov[campo] != null) return ov[campo] as ValoresProduccion[K]
  return fila.supervisor[campo]
}

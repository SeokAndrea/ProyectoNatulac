import { supabase } from "@/lib/supabase"

/*
 * Módulo VALIDAR (SUPERADMINISTRADOR): se revisa cada corrida
 * (turno + línea + lote) de los turnos CERRADOS y se marca SÍ (el
 * valor del supervisor es el bueno) o EDITAR (se corrige). Solo lo
 * validado alimenta el dashboard de KPIs futuro. Ver
 * plan-validar-produccion.md y migración 20261005.
 */
type Resultado = { ok: true } | { ok: false; error: string }
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

/** El valor efectivo de un campo: el corregido si se pisó, si no el del supervisor. */
export function efectivo<K extends keyof ValoresProduccion>(fila: FilaValidacion, campo: K): ValoresProduccion[K] {
  const ov = fila.overrides as Record<string, unknown> | null
  if (fila.estado === "EDITADO" && ov && ov[campo] != null) return ov[campo] as ValoresProduccion[K]
  return fila.supervisor[campo]
}

// ------------------------------------------------------------
// RPC (solo SUPERADMINISTRADOR — el servidor lo valida igual)
// ------------------------------------------------------------
interface FilaRpc {
  turno_linea_id: string
  turno_codigo: string
  fecha: string
  supervisor_nombre: string
  area_nombre: string
  linea: string
  presentacion: string
  sabor: string | null
  lote: string | null
  supervisor: {
    paletas: number
    cajas_sueltas: number
    cajas: number
    envases_llenadora: number
    litros_producidos: number
    litros_consumidos: number
    merma_envases_pct: number | null
    merma_semielaborado_pct: number | null
  }
  estado: EstadoValidacion
  overrides: OverridesValidacion | null
  validado_por_nombre: string | null
  validado_en: string | null
}

export async function listarValidacionProduccion(
  usuario: string,
  filtros: { fechaDesde?: string; fechaHasta?: string },
): Promise<FilaValidacion[]> {
  const { data, error } = await supabase.rpc("listar_validacion_produccion", {
    p_usuario: usuario,
    p_fecha_desde: filtros.fechaDesde || null,
    p_fecha_hasta: filtros.fechaHasta || null,
  })
  if (error || !data) return []
  return (data as FilaRpc[]).map((r) => ({
    turnoLineaId: r.turno_linea_id,
    turnoCodigo: r.turno_codigo,
    fecha: r.fecha,
    supervisorNombre: r.supervisor_nombre,
    areaNombre: r.area_nombre,
    linea: r.linea,
    presentacion: r.presentacion,
    sabor: r.sabor,
    lote: r.lote,
    estado: r.estado,
    supervisor: {
      paletas: r.supervisor.paletas,
      cajasSueltas: r.supervisor.cajas_sueltas,
      cajas: r.supervisor.cajas,
      envasesLlenadora: r.supervisor.envases_llenadora,
      litrosConsumidos: r.supervisor.litros_consumidos,
      litrosProducidos: r.supervisor.litros_producidos,
      mermaEnvasesPct: r.supervisor.merma_envases_pct,
      mermaSemielaboradoPct: r.supervisor.merma_semielaborado_pct,
    },
    overrides: r.overrides,
    validadoPorNombre: r.validado_por_nombre,
    validadoEn: r.validado_en,
  }))
}

const ROTULO_CONDICION: Record<string, string> = {
  LISTO: "Listo",
  STANDBY: "Con Restos",
  SUCIO: "Sucio",
  CIP: "En CIP",
  LIMPIO: "Limpio",
  EN_PREPARACION: "En Preparación",
}

interface RawTanque {
  numeroTanque: 1 | 2 | 3
  condicion: string
  sabor: string | null
  lote: string | null
  volumenL: number | null
}

/** Los tanques recibidos / dejados de los turnos pedidos, por código. */
export async function tanquesDeTurnos(usuario: string, codigos: string[]): Promise<Record<string, TurnoTanques>> {
  if (codigos.length === 0) return {}
  const { data, error } = await supabase.rpc("tanques_de_turnos", { p_usuario: usuario, p_codigos: codigos })
  if (error || !data) return {}
  const raw = data as Record<string, { turnoCodigo: string; recibidos: RawTanque[]; dejados: RawTanque[] }>
  const map = (t: RawTanque): TanqueEstado => ({
    numeroTanque: t.numeroTanque,
    condicion: ROTULO_CONDICION[t.condicion] ?? t.condicion,
    sabor: t.sabor,
    lote: t.lote,
    volumenL: t.volumenL,
  })
  const out: Record<string, TurnoTanques> = {}
  for (const [cod, t] of Object.entries(raw)) {
    out[cod] = { turnoCodigo: cod, recibidos: (t.recibidos ?? []).map(map), dejados: (t.dejados ?? []).map(map) }
  }
  return out
}

export async function confirmarProduccion(usuario: string, turnoLineaId: string): Promise<Resultado> {
  const { error } = await supabase.rpc("confirmar_produccion", { p_usuario: usuario, p_turno_linea_id: turnoLineaId })
  return error ? { ok: false, error: error.message || "No se pudo confirmar. Intenta de nuevo." } : { ok: true }
}

export async function editarProduccionValidada(
  usuario: string,
  turnoLineaId: string,
  ov: OverridesValidacion,
): Promise<Resultado> {
  const { error } = await supabase.rpc("editar_produccion_validada", {
    p_usuario: usuario,
    p_turno_linea_id: turnoLineaId,
    p_paletas: ov.paletas ?? null,
    p_cajas_sueltas: ov.cajasSueltas ?? null,
    p_envases_llenadora: ov.envasesLlenadora ?? null,
    p_litros_consumidos: ov.litrosConsumidos ?? null,
    p_lote: ov.lote ?? null,
    p_merma_envases_pct: ov.mermaEnvasesPct ?? null,
    p_merma_semielaborado_pct: ov.mermaSemielaboradoPct ?? null,
    p_nota: ov.nota ?? null,
  })
  return error ? { ok: false, error: error.message || "No se pudo guardar la corrección. Intenta de nuevo." } : { ok: true }
}

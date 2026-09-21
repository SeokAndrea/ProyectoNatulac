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
  /** Contador 2: envases buenos (null = no se cargó). */
  envasesBuenos?: number | null
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
  envasesBuenos?: number
  litrosConsumidos?: number
  lote?: string
  mermaEnvasesPct?: number
  mermaSemielaboradoPct?: number
  nota?: string
}

/** Datos de la presentación de la corrida — sirven para recalcular al editar. */
export interface DatosPresentacion {
  cajasXPaleta: number | null
  envasesXCaja: number | null
  litrosXCaja: number | null
  volumenMl: number | null
}

/** Una parada del turno, solo lectura en Validar. */
export interface ParadaValidar {
  linea: string
  clase: "PROGRAMADA" | "NO_PROGRAMADA" | "OCIOSO"
  tipo: string
  minutos: number
  guia: number | null
  nota: string | null
  justificacion: string | null
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
  /** true = la corrida quedó sin Producto Terminado (el turno se cerró solo por el cron). El analista tiene que cargar el número real. */
  sinPt: boolean
  /** true = el turno se cerró automáticamente (cron), no lo finalizó el supervisor. */
  cierreAutomatico: boolean
  /**
   * true = hay 2+ corridas CON PT propio (cajas > 0) en el MISMO turno
   * para esta misma línea+lote+presentación — sin importar si los
   * totales coinciden. Repetir línea+lote entre turnos distintos (días
   * distintos) no cuenta: "lote" es texto libre sin fecha ni unicidad
   * global. No bloquea nada (repetir línea+lote dentro de un turno es
   * legítimo desde costura 2, ver plan-rework-3-modulos-y-merma.md
   * §2.3): es la red de seguridad que reemplaza el bloqueo duro de
   * `activar_linea` de `20261003`.
   */
  posibleDuplicado: boolean
  /** Datos de la presentación (cajas/paleta, envases/caja, litros/caja, volumen). Sin ellos no se recalcula solo. */
  datosPresentacion?: DatosPresentacion | null
  /** Lo que cargó el supervisor (siempre presente). */
  supervisor: ValoresProduccion
  /** Overrides guardados si `estado === "EDITADO"` (los campos que Daniela cambió). */
  overrides: OverridesValidacion | null
  validadoPorNombre: string | null
  validadoEn: string | null
}

const redondear1 = (n: number) => Math.round(n * 10) / 10

/**
 * Valores resultantes de aplicar las correcciones (paletas, cajas sueltas,
 * contador, contador 2, litros) sobre lo del supervisor, recalculando lo
 * derivado: cajas, litros producidos/consumidos y ambas mermas. Un % de merma
 * escrito a mano (`mermaEnvasesPct` / `mermaSemielaboradoPct`) manda sobre el
 * cálculo. Sin `datos` de la presentación no se puede recalcular y lo derivado
 * queda como lo calculó el servidor.
 */
export function derivarValores(
  base: ValoresProduccion,
  datos: DatosPresentacion | null | undefined,
  ov: OverridesValidacion | null,
): ValoresProduccion {
  const o = ov ?? {}
  const paletas = o.paletas ?? base.paletas
  const cajasSueltas = o.cajasSueltas ?? base.cajasSueltas
  const envasesLlenadora = o.envasesLlenadora ?? base.envasesLlenadora
  const envasesBuenos = o.envasesBuenos ?? base.envasesBuenos ?? null

  const cajas = datos?.cajasXPaleta != null ? paletas * datos.cajasXPaleta + cajasSueltas : base.cajas
  const litrosProducidos =
    datos?.litrosXCaja != null && cajas !== base.cajas ? Math.round(cajas * datos.litrosXCaja) : base.litrosProducidos
  const litrosConsumidos =
    o.litrosConsumidos ??
    (datos?.volumenMl != null && envasesLlenadora !== base.envasesLlenadora
      ? Math.round((envasesLlenadora * datos.volumenMl) / 1000)
      : base.litrosConsumidos)

  const mermaEnvasesPct =
    o.mermaEnvasesPct ??
    (datos?.envasesXCaja != null && envasesLlenadora > 0
      ? redondear1((1 - (cajas * datos.envasesXCaja) / envasesLlenadora) * 100)
      : base.mermaEnvasesPct)
  const mermaSemielaboradoPct =
    o.mermaSemielaboradoPct ??
    (litrosConsumidos > 0 ? redondear1((1 - litrosProducidos / litrosConsumidos) * 100) : base.mermaSemielaboradoPct)

  return {
    paletas,
    cajasSueltas,
    cajas,
    envasesLlenadora,
    envasesBuenos,
    litrosConsumidos,
    litrosProducidos,
    mermaEnvasesPct,
    mermaSemielaboradoPct,
  }
}

/** El valor efectivo de un campo: el corregido si se pisó (con lo derivado recalculado), si no el del supervisor. */
export function efectivo<K extends keyof ValoresProduccion>(fila: FilaValidacion, campo: K): ValoresProduccion[K] {
  if (fila.estado !== "EDITADO" || !fila.overrides) return fila.supervisor[campo]
  return derivarValores(fila.supervisor, fila.datosPresentacion, fila.overrides)[campo]
}

/** Δ envases: |Contador 2 − envases del Producto Terminado|. null si falta el Contador 2 o los datos. */
export function deltaEnvases(v: ValoresProduccion, datos: DatosPresentacion | null | undefined): number | null {
  if (v.envasesBuenos == null || datos?.envasesXCaja == null) return null
  return Math.abs(v.envasesBuenos - v.cajas * datos.envasesXCaja)
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
  sin_pt?: boolean
  cierre_automatico?: boolean
  datos_presentacion?: {
    cajas_x_paleta: number | null
    envases_x_caja: number | null
    litros_x_caja: number | null
    volumen_ml: number | null
  } | null
  supervisor: {
    paletas: number
    cajas_sueltas: number
    cajas: number
    envases_llenadora: number
    envases_buenos?: number | null
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
  const filas = (data as FilaRpc[]).map((r) => ({
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
    sinPt: r.sin_pt ?? false,
    cierreAutomatico: r.cierre_automatico ?? false,
    posibleDuplicado: false,
    datosPresentacion: r.datos_presentacion
      ? {
          cajasXPaleta: r.datos_presentacion.cajas_x_paleta != null ? Number(r.datos_presentacion.cajas_x_paleta) : null,
          envasesXCaja: r.datos_presentacion.envases_x_caja != null ? Number(r.datos_presentacion.envases_x_caja) : null,
          litrosXCaja: r.datos_presentacion.litros_x_caja != null ? Number(r.datos_presentacion.litros_x_caja) : null,
          volumenMl: r.datos_presentacion.volumen_ml != null ? Number(r.datos_presentacion.volumen_ml) : null,
        }
      : null,
    supervisor: {
      paletas: r.supervisor.paletas,
      cajasSueltas: r.supervisor.cajas_sueltas,
      cajas: r.supervisor.cajas,
      envasesLlenadora: r.supervisor.envases_llenadora,
      envasesBuenos: r.supervisor.envases_buenos ?? null,
      litrosConsumidos: r.supervisor.litros_consumidos,
      litrosProducidos: r.supervisor.litros_producidos,
      mermaEnvasesPct: r.supervisor.merma_envases_pct,
      mermaSemielaboradoPct: r.supervisor.merma_semielaborado_pct,
    },
    overrides: r.overrides,
    validadoPorNombre: r.validado_por_nombre,
    validadoEn: r.validado_en,
  }))
  marcarPosiblesDuplicados(filas)
  return filas
}

/**
 * Agrupa por turno+línea+lote+presentación y marca `posibleDuplicado`
 * en toda fila de un grupo con 2+ corridas con PT propio (cajas > 0)
 * — sin importar si los totales coinciden. Necesita el MISMO turno:
 * "lote" es texto libre que cada supervisor tipea a mano, sin fecha ni
 * unicidad global, así que dos turnos distintos (de días distintos)
 * pueden compartir el mismo número de lote en la misma línea sin que
 * eso signifique nada raro. Lo sospechoso de verdad — el caso real que
 * motivó este chequeo (plan-rework-auditoria.md §7: "Línea 1 · Lote
 * 0004 · 810 cajas × 2") — es la misma línea+lote+presentación
 * repetida DENTRO del mismo turno. Auditoría (auditoriaVista.ts) ya
 * queda afuera de este problema porque compara solo dentro de un
 * turno a la vez. Muta las filas en el lugar, no devuelve nada.
 */
function marcarPosiblesDuplicados(filas: FilaValidacion[]): void {
  const grupos = new Map<string, FilaValidacion[]>()
  for (const f of filas) {
    if (f.supervisor.cajas <= 0) continue
    const k = `${f.turnoCodigo}|${f.linea}|${f.lote ?? ""}|${f.presentacion}`
    const g = grupos.get(k)
    if (g) g.push(f)
    else grupos.set(k, [f])
  }
  for (const g of grupos.values()) {
    if (g.length < 2) continue
    for (const f of g) f.posibleDuplicado = true
  }
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
    p_envases_buenos: ov.envasesBuenos ?? null,
  })
  return error ? { ok: false, error: error.message || "No se pudo guardar la corrección. Intenta de nuevo." } : { ok: true }
}

/** Las paradas de los turnos pedidos, por código de turno — solo lectura, para revisarlas junto a la producción. */
export async function paradasDeTurnos(usuario: string, codigos: string[]): Promise<Record<string, ParadaValidar[]>> {
  if (codigos.length === 0) return {}
  const { data, error } = await supabase.rpc("paradas_de_turnos", { p_usuario: usuario, p_codigos: codigos })
  if (error || !data) return {}
  return data as Record<string, ParadaValidar[]>
}

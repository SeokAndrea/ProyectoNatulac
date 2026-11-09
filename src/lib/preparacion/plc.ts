import { useEffect, useState } from "react"
import type { EstadoBridge } from "@/lib/plc/bridge"
import { supabase } from "@/lib/supabase"
import type { Resultado } from "./tipos"

/*
 * Preparación con PLC (docs/superpowers/specs/2026-11-06-preparacion-plc-design.md,
 * migración 20261115990000). Dos fuentes:
 *   - lo guardado: las cargas que el bridge le reportó a la base (kits y
 *     ajustes de agua por preparación), leídas con estado_preparacion_plc;
 *   - lo en vivo: el mensaje del bridge (fase, litros, caudal), que no se guarda.
 * El supervisor registra cada carga con sabor y lote (confirmar_carga_plc) y
 * la base la convierte en el lote de siempre (iniciar_preparacion).
 * Todo detrás de un interruptor por área (areas.preparacion_plc).
 */

export type Lectura<T> = { ok: true; data: T } | { ok: false; error: string }

export type EstadoCargaPlc = "EN_CURSO" | "PENDIENTE" | "CONFIRMADA" | "DESCARTADA"

/** Un ajuste de agua de la fase 3: se cierra cuando PLC_Ajuste_Agua vuelve a 0. */
export interface AjustePlc {
  id: string
  litros: number
  iniciadoEn: string
  /** null = el ajuste sigue entrando. */
  hechoEn: string | null
  /** Ya se sumó al lote como línea de ajuste. */
  sumado: boolean
  /** Por qué no se sumó (el lote ya estaba liberado), o null. */
  noSumadoMotivo: string | null
}

/** Una preparación hecha en la HMI, tal cual la guardó la base. */
export interface CargaPlc {
  id: string
  numeroTanque: 1 | 2 | 3
  estado: EstadoCargaPlc
  /** Setpoint (agua de la fórmula) al iniciar; solo para mostrar. */
  aguaFormulaL: number | null
  /** PLC_Nro_Kits: el último valor distinto de cero (admite medios). */
  kits: number | null
  /** El PLC ya terminó con la pulpa: los kits no cambian más. */
  kitsListos: boolean
  /** Los del lote; si difieren de kits, el supervisor los corrigió. */
  kitsUsados: number | null
  iniciadaEn: string
  /** null = el PLC sigue con esta preparación. */
  terminadaEn: string | null
  ajustes: AjustePlc[]
}

/** Una línea de ajuste del lote (botón Ajustar o del PLC). */
export interface ParteAjuste {
  origen: "PLC" | "MANUAL"
  litros: number
  creadoEn: string
  detalle: string | null
}

/** De dónde salen los litros del lote: unidades × litros por unidad + agua + resto + desvase + ajustes. */
export interface DesgloseLote {
  loteId: string
  lote: string | null
  /** Tambores (kits). */
  unidades: number
  litrosPorUnidad: number | null
  /** Agua que se cargó a mano con el lote (preparaciones.agua). */
  aguaL: number
  restoL: number
  desvaseL: number
  /** volumen_inicial_l: con lo que se armó el lote más los ajustes. */
  totalL: number | null
  ajustes: ParteAjuste[]
}

export interface PlcTanqueGuardado {
  numeroTanque: 1 | 2 | 3
  /** Cargas sin registrar (EN_CURSO y PENDIENTE), la más vieja primero. */
  cola: CargaPlc[]
  /** La carga con la que se armó el lote abierto del tanque, o null. */
  cargaDelLote: CargaPlc | null
  desglose: DesgloseLote | null
}

export interface EstadoPreparacionPlc {
  habilitado: boolean
  tanques: PlcTanqueGuardado[]
}

export interface DatosConfirmarCarga {
  cargaId: string
  saborId: string
  lote: string
  /** null = los del PLC; un número = corregidos por el supervisor. */
  kits: number | null
  desvaseId: string | null
  paraVacio: boolean
  liberar: boolean
}

/** Lo que el PLC está haciendo ahora en un tanque (del bridge, no se guarda). */
export interface VistaVivaTanque {
  fase: 1 | 2 | 3 | null
  /** La válvula de entrada de agua de este tanque está abierta. */
  llenando: boolean
  aguaFormulaL: number | null
  /** Agua que entró al tanque en esta preparación (PLC_Totales_Litros). */
  litrosAgua: number | null
  caudalLMin: number | null
  /** null mientras el PLC no tiene kits (PLC_Nro_Kits en 0). */
  kits: number | null
  /** Litros del ajuste en curso (PLC_Ajuste_Agua), o null sin ajuste. */
  ajusteL: number | null
  /** Lo que entró del ajuste en curso (PLC_Actuales_Litros). */
  litrosAjuste: number | null
}

/** Todo lo del PLC para la tarjeta de un tanque. */
export interface PlcDelTanque {
  vivo: VistaVivaTanque | null
  cola: CargaPlc[]
  cargaDelLote: CargaPlc | null
  desglose: DesgloseLote | null
}

// ---- mapeo de la respuesta de la base

type Num = number | string | null | undefined

interface FilaAjuste {
  id: string
  litros: Num
  iniciado_en: string
  hecho_en: string | null
  sumado: boolean
  no_sumado_motivo: string | null
}

interface FilaCarga {
  id: string
  numero_tanque: Num
  estado: EstadoCargaPlc
  agua_formula_l: Num
  kits: Num
  kits_listos: boolean
  kits_usados: Num
  iniciada_en: string
  terminada_en: string | null
  ajustes: FilaAjuste[] | null
}

interface FilaDesglose {
  lote_id: string
  lote: string | null
  unidades: Num
  litros_por_unidad: Num
  agua_l?: Num
  resto_l: Num
  desvase_l: Num
  total_l: Num
  ajustes: { origen: "PLC" | "MANUAL"; litros: Num; creado_en: string; detalle: string | null }[] | null
}

interface FilaTanque {
  numero_tanque: Num
  cola: FilaCarga[] | null
  carga_del_lote: FilaCarga | null
  desglose: FilaDesglose | null
}

/** numeric llega como texto o número; null/vacío/no numérico = null. */
function numero(v: Num): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

const tanque = (v: Num) => (numero(v) ?? 1) as 1 | 2 | 3

function mapearCarga(f: FilaCarga): CargaPlc {
  return {
    id: f.id,
    numeroTanque: tanque(f.numero_tanque),
    estado: f.estado,
    aguaFormulaL: numero(f.agua_formula_l),
    kits: numero(f.kits),
    kitsListos: f.kits_listos === true,
    kitsUsados: numero(f.kits_usados),
    iniciadaEn: f.iniciada_en,
    terminadaEn: f.terminada_en,
    ajustes: (f.ajustes ?? []).map((a) => ({
      id: a.id,
      litros: numero(a.litros) ?? 0,
      iniciadoEn: a.iniciado_en,
      hechoEn: a.hecho_en,
      sumado: a.sumado === true,
      noSumadoMotivo: a.no_sumado_motivo,
    })),
  }
}

function mapearDesglose(f: FilaDesglose): DesgloseLote {
  return {
    loteId: f.lote_id,
    lote: f.lote,
    unidades: numero(f.unidades) ?? 0,
    litrosPorUnidad: numero(f.litros_por_unidad),
    aguaL: numero(f.agua_l) ?? 0,
    restoL: numero(f.resto_l) ?? 0,
    desvaseL: numero(f.desvase_l) ?? 0,
    totalL: numero(f.total_l),
    ajustes: (f.ajustes ?? []).map((a) => ({
      origen: a.origen,
      litros: numero(a.litros) ?? 0,
      creadoEn: a.creado_en,
      detalle: a.detalle,
    })),
  }
}

/** Lo que devuelven estado_preparacion_plc y descartar_carga_plc. */
export function mapearEstadoPlc(data: unknown): EstadoPreparacionPlc {
  const d = data as { habilitado?: boolean; tanques?: FilaTanque[] | null } | null
  if (!d || d.habilitado !== true) return { habilitado: false, tanques: [] }
  return {
    habilitado: true,
    tanques: (d.tanques ?? []).map((t) => ({
      numeroTanque: tanque(t.numero_tanque),
      cola: (t.cola ?? []).map(mapearCarga),
      cargaDelLote: t.carga_del_lote ? mapearCarga(t.carga_del_lote) : null,
      desglose: t.desglose ? mapearDesglose(t.desglose) : null,
    })),
  }
}

// ---- llamadas a la base

function mensajeError(mensaje: string | null | undefined, porDefecto: string): string {
  const m = mensaje ?? ""
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(m)) {
    return "No hay conexión con el servidor. Revisa la red e intenta de nuevo."
  }
  return m || porDefecto
}

export async function leerEstadoPlc(usuario: string, turnoId: string): Promise<Lectura<EstadoPreparacionPlc>> {
  const { data, error } = await supabase.rpc("estado_preparacion_plc", { p_usuario: usuario, p_turno_id: turnoId })
  if (error) return { ok: false, error: mensajeError(error.message, "No se pudo leer lo del PLC.") }
  return { ok: true, data: mapearEstadoPlc(data) }
}

/** Registra una carga del PLC como lote (y lo libera si se pide). Devuelve el turno_json, como iniciar_preparacion. */
export async function confirmarCargaPlc(usuario: string, turnoId: string, datos: DatosConfirmarCarga): Promise<Resultado & { data?: unknown }> {
  const { data, error } = await supabase.rpc("confirmar_carga_plc", {
    p_usuario: usuario,
    p_turno_id: turnoId,
    p_carga_id: datos.cargaId,
    p_sabor_id: datos.saborId,
    p_lote: datos.lote,
    p_kits: datos.kits,
    p_desvase_id: datos.desvaseId,
    p_para_vacio: datos.paraVacio,
    p_liberar: datos.liberar,
  })
  if (error || !data) return { ok: false, error: mensajeError(error?.message, "No se pudo registrar la carga. Intenta de nuevo.") }
  return { ok: true, data }
}

export async function descartarCargaPlc(usuario: string, turnoId: string, cargaId: string): Promise<Lectura<EstadoPreparacionPlc>> {
  const { data, error } = await supabase.rpc("descartar_carga_plc", { p_usuario: usuario, p_turno_id: turnoId, p_carga_id: cargaId })
  if (error) return { ok: false, error: mensajeError(error.message, "No se pudo descartar la carga.") }
  return { ok: true, data: mapearEstadoPlc(data) }
}

/*
 * Interruptor por área (areas.preparacion_plc). Lo cambia solo la dueña.
 */

/** ¿Está encendido en el área? Sin área, Aséptico. null mientras carga. */
export function usePreparacionPlcActivo(area: string | null): boolean | null {
  const [resultado, setResultado] = useState<{ area: string | null; valor: boolean } | null>(null)
  useEffect(() => {
    let vivo = true
    supabase.rpc("preparacion_plc_area_activo", { p_area_codigo: area }).then(({ data, error }) => {
      // Sin la migración en el servidor, la función no existe: se comporta como apagado.
      if (vivo) setResultado({ area, valor: !error && data === true })
    })
    return () => {
      vivo = false
    }
  }, [area])
  return resultado?.area === area ? resultado.valor : null
}

export async function guardarPreparacionPlc(usuario: string, area: string, activo: boolean): Promise<Resultado> {
  const { error } = await supabase.rpc("guardar_preparacion_plc", { p_usuario: usuario, p_area_codigo: area, p_activo: activo })
  return error ? { ok: false, error: error.message || "No se pudo cambiar el ajuste." } : { ok: true }
}

// ---- en vivo

/**
 * Lo que el PLC hace ahora en el tanque `numero`, o null si no hay nada que
 * mostrar: sin bridge o sin PLC, sin preparación en curso, el PLC está en
 * otro tanque, o el bridge reporta otra área. Un bridge sin el campo `area`
 * (anterior a la 1.3) es el de Aséptico. Sin área de sesión, Aséptico.
 */
export function vistaVivaTanque(estado: EstadoBridge | null, numero: 1 | 2 | 3, area: string | null): VistaVivaTanque | null {
  if (!estado || estado.conectado === false) return null
  const p = estado.preparacion
  if (!p || !p.activa || estado.tanque_activo !== numero) return null
  if ((estado.area ?? "ASEPTICO") !== (area ?? "ASEPTICO")) return null
  const ajuste = p.ajuste_l != null && p.ajuste_l > 0 ? p.ajuste_l : null
  return {
    fase: p.fase_3 ? 3 : p.fase_2 ? 2 : p.fase_1 ? 1 : null,
    llenando: !!estado.valvulas?.[String(numero)],
    aguaFormulaL: estado.setpoint_l,
    litrosAgua: estado.litros_tanque ?? estado.litros_actuales,
    caudalLMin: estado.caudal_l_min,
    kits: p.kits != null && p.kits > 0 ? p.kits : null,
    ajusteL: ajuste,
    litrosAjuste: ajuste === null ? null : estado.litros_actuales,
  }
}

/** Los kits (tambores) van de medio en medio y son más de cero: 0,5 · 1 · 1,5 … (como la base). */
export function kitsDeMedioEnMedio(kits: number): boolean {
  return Number.isFinite(kits) && kits > 0 && Number.isInteger(kits * 2)
}

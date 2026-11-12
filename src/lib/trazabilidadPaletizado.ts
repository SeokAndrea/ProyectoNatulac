import { supabase } from "@/lib/supabase"

/*
 * Trazabilidad de paletizado (hoja 1-PR-F-040 Rev.01). Cada paleta del Robot
 * Tavil guarda los datos de la hoja (migración 20261115290000). Ver
 * docs/superpowers/specs/2026-11-11-trazabilidad-paletizado-design.md.
 */

export type TurnoTipo = "TURNO_1" | "TURNO_2" | "TURNO_3"
export type TipoPaletizado = "AUTOMATICO" | "MANUAL"

export const TURNOS: { codigo: TurnoTipo; corto: string; nombre: string }[] = [
  { codigo: "TURNO_1", corto: "T1", nombre: "Turno 1" },
  { codigo: "TURNO_2", corto: "T2", nombre: "Turno 2" },
  { codigo: "TURNO_3", corto: "T3", nombre: "Turno 3" },
]

export const numeroTurno = (t: TurnoTipo | null): string => (t ? t.slice(-1) : "—")

/** Observación / desviación de la hoja (solo si es NC). */
export const OBSERVACIONES: { codigo: number; texto: string }[] = [
  { codigo: 1, texto: "Solapas despegadas" },
  { codigo: 2, texto: "Faltante de cajas en la paleta" },
  { codigo: 3, texto: "Faltante de unidades en las cajas" },
  { codigo: 4, texto: "Defectos en la paleta de madera" },
  { codigo: 5, texto: "Poliestrech rasgado" },
  { codigo: 6, texto: "Defectos en el apilamiento" },
  { codigo: 7, texto: "Otros (especificar)" },
]

/** Casillas de presentación que imprime la hoja. Las que no están en el catálogo se imprimen y nunca se marcan. */
export const PRESENTACIONES_HOJA = [
  "TBA-1000 cm3",
  "TBA-500 cm3",
  "TPA-330 cm3",
  "TPA-250 cm3",
  "TPA-200 cm3",
  "Al-340 cm3",
  "V-1000 cm3",
  "V-250 cm3",
  "C-113 g",
  "C-186 g",
] as const

export interface Paleta {
  id: string
  lineaCodigo: string
  lineaNombre: string
  fechaProduccion: string | null
  turnoTipo: TurnoTipo | null
  creadaEn: string
  numero: number | null
  ticket: string | null
  tipoPaletizado: TipoPaletizado
  cajas: number | null
  conforme: boolean
  observacionCodigos: number[]
  observacionOtros: string | null
  accionCorreccion: string | null
  lote: string | null
  saborCodigo: string | null
  saborNombre: string | null
  presentacionMl: number | null
  presentacionCodigo: string | null
  editadaEn: string | null
  editadaPor: string | null
}

export interface FilaPaleta {
  id: string
  linea_codigo: string
  linea_nombre: string
  fecha_produccion: string | null
  turno_tipo: TurnoTipo | null
  creada_en: string
  numero: number | string | null
  ticket: string | null
  tipo_paletizado: TipoPaletizado | null
  cajas: number | string | null
  conforme: boolean | null
  observacion_codigos: (number | string)[] | null
  observacion_otros: string | null
  accion_correccion: string | null
  lote: string | null
  sabor_codigo: string | null
  sabor_nombre: string | null
  presentacion_volumen_ml: number | string | null
  presentacion_codigo: string | null
  editada_en: string | null
  editada_por: string | null
}

const numeroONull = (v: number | string | null | undefined) => (v === null || v === undefined || v === "" ? null : Number(v))

export function mapearPaleta(f: FilaPaleta): Paleta {
  return {
    id: f.id,
    lineaCodigo: f.linea_codigo,
    lineaNombre: f.linea_nombre,
    fechaProduccion: f.fecha_produccion,
    turnoTipo: f.turno_tipo,
    creadaEn: f.creada_en,
    numero: numeroONull(f.numero),
    ticket: f.ticket,
    tipoPaletizado: f.tipo_paletizado === "MANUAL" ? "MANUAL" : "AUTOMATICO",
    cajas: numeroONull(f.cajas),
    conforme: f.conforme !== false,
    observacionCodigos: (f.observacion_codigos ?? []).map(Number).sort((a, b) => a - b),
    observacionOtros: f.observacion_otros,
    accionCorreccion: f.accion_correccion,
    lote: f.lote,
    saborCodigo: f.sabor_codigo,
    saborNombre: f.sabor_nombre,
    presentacionMl: numeroONull(f.presentacion_volumen_ml),
    presentacionCodigo: f.presentacion_codigo,
    editadaEn: f.editada_en,
    editadaPor: f.editada_por,
  }
}

/** Código del sabor en la hoja; sin código, el nombre (para no dejar la celda vacía). */
export const codigoSabor = (p: Pick<Paleta, "saborCodigo" | "saborNombre">) => p.saborCodigo || p.saborNombre || "—"

/** Código de la presentación en la hoja; sin código, «N ml». */
export const codigoPresentacion = (p: Pick<Paleta, "presentacionCodigo" | "presentacionMl">) =>
  p.presentacionCodigo || (p.presentacionMl !== null ? `${p.presentacionMl} ml` : "Sin presentación")

/** «1, 7 (texto)» para la hoja; vacío si no hay observación. */
export function textoObservacionCorto(p: Pick<Paleta, "observacionCodigos" | "observacionOtros">): string {
  return p.observacionCodigos.map((c) => (c === 7 ? `7 (${p.observacionOtros || "—"})` : String(c))).join(", ")
}

/** «1 Solapas despegadas; 7 Otros: texto» para la pantalla. */
export function textoObservacionLargo(p: Pick<Paleta, "observacionCodigos" | "observacionOtros">): string {
  return p.observacionCodigos
    .map((c) => (c === 7 ? `7 Otros: ${p.observacionOtros || "—"}` : `${c} ${OBSERVACIONES.find((o) => o.codigo === c)?.texto ?? ""}`))
    .join("; ")
}

/** Lo que el operador o quien corrige llena para la conformidad. */
export interface DatosConformidad {
  conforme: boolean
  observacionCodigos: number[]
  observacionOtros: string
  accionCorreccion: string
}

/**
 * Valida la conformidad como el servidor (robot_tavil_validar_conformidad):
 * NC exige al menos una observación cuando es obligatoria; el 7 pide texto.
 */
export function errorConformidad(d: DatosConformidad, obligatoria: boolean): string | null {
  if (!d.conforme && obligatoria && d.observacionCodigos.length === 0) {
    return "Marca al menos una observación (1 a 7) para una paleta no conforme."
  }
  if (d.observacionCodigos.includes(7) && !d.observacionOtros.trim()) return "Especifica el «Otros» (observación 7)."
  return null
}

/** Una hoja: una línea, un día, una presentación y un tipo de paletizado. */
export interface Hoja {
  clave: string
  lineaCodigo: string
  lineaNombre: string
  fecha: string
  presentacionCodigo: string
  presentacionHoja: string | null
  tipoPaletizado: TipoPaletizado
  paletas: Paleta[]
}

/**
 * Agrupa las paletas en hojas: por línea, presentación y tipo de paletizado
 * (la hoja original marca una sola presentación y un solo tipo). Dentro de
 * cada hoja, por hora de salida. Las hojas, por línea y por la primera paleta.
 */
export function armarHojas(paletas: Paleta[]): Hoja[] {
  const hojas = new Map<string, Hoja>()
  const ordenadas = [...paletas].sort(
    (a, b) => a.lineaCodigo.localeCompare(b.lineaCodigo) || a.creadaEn.localeCompare(b.creadaEn) || a.id.localeCompare(b.id),
  )
  for (const p of ordenadas) {
    const pres = codigoPresentacion(p)
    const clave = `${p.lineaCodigo}|${pres}|${p.tipoPaletizado}`
    let h = hojas.get(clave)
    if (!h) {
      h = {
        clave,
        lineaCodigo: p.lineaCodigo,
        lineaNombre: p.lineaNombre,
        fecha: p.fechaProduccion ?? "",
        presentacionCodigo: pres,
        presentacionHoja: PRESENTACIONES_HOJA.find((c) => c === p.presentacionCodigo) ?? null,
        tipoPaletizado: p.tipoPaletizado,
        paletas: [],
      }
      hojas.set(clave, h)
    }
    h.paletas.push(p)
  }
  return [...hojas.values()]
}

/** «2026-11-11» → «11/11/2026». */
export function fechaHoja(iso: string): string {
  const [a, m, d] = iso.split("-")
  return a && m && d ? `${d}/${m}/${a}` : iso
}

// ------------------------------------------------------------
// Lectura y corrección (tarjeta «Trazabilidad del paletizado»)
// ------------------------------------------------------------

export interface LineaFiltro {
  codigo: string
  nombre: string
}

export interface DatosTrazabilidad {
  lineas: LineaFiltro[]
  paletas: Paleta[]
}

type Resultado<T> = { ok: true; data: T } | { ok: false; error: string }

function mensajeError(m: string | undefined): string {
  if (!m || /PGRST|violates|syntax error|does not exist|column|relation|function/i.test(m)) {
    return "No se pudo completar. Intenta de nuevo; si sigue pasando, avisa a la administración."
  }
  if (/failed to fetch|networkerror|load failed/i.test(m)) return "No hay conexión con el servidor. Revisa la red e intenta de nuevo."
  return m
}

export async function listarTrazabilidad(
  usuario: string,
  fecha: string,
  turnos: TurnoTipo[] | null,
  lineas: string[] | null,
): Promise<Resultado<DatosTrazabilidad>> {
  const { data, error } = await supabase.rpc("trazabilidad_paletizado_listar", {
    p_usuario: usuario,
    p_fecha: fecha,
    p_turnos: turnos,
    p_lineas: lineas,
  })
  if (error) return { ok: false, error: mensajeError(error.message) }
  const d = (data ?? {}) as { lineas?: LineaFiltro[]; paletas?: FilaPaleta[] }
  return { ok: true, data: { lineas: d.lineas ?? [], paletas: (d.paletas ?? []).map(mapearPaleta) } }
}

export async function corregirConformidad(usuario: string, paletaId: string, d: DatosConformidad): Promise<Resultado<Paleta>> {
  const { data, error } = await supabase.rpc("trazabilidad_paletizado_corregir", {
    p_usuario: usuario,
    p_paleta_id: paletaId,
    p_conforme: d.conforme,
    p_observacion_codigos: d.conforme ? [] : d.observacionCodigos,
    p_observacion_otros: d.conforme ? null : d.observacionOtros,
    p_accion_correccion: d.conforme ? null : d.accionCorreccion,
  })
  if (error) return { ok: false, error: mensajeError(error.message) }
  return { ok: true, data: mapearPaleta(data as FilaPaleta) }
}

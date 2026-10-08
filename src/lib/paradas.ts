import { supabase } from "@/lib/supabase"

/*
 * Módulo Paradas — downtime de las líneas. Rumbo 2026-09-10 (ver
 * plan-paradas.md): el eje pasa a PROGRAMADA / NO_PROGRAMADA / OCIOSO.
 *
 *  - El supervisor registra las suyas en Registrar Paradas.
 *  - Mantenimiento registra las mecánicas en su pantalla, con hora real de
 *    inicio y fin (migración 20261070); ya no se sincroniza el Sheet.
 *
 * Persistencia: migración 20261061 (paradas_tipos, paradas y sus RPC).
 *
 * Regla de negocio (dueño, 2026-09-09): la duración la calcula el
 * programa (fin − inicio). Cada tipo trae un "tiempo guía" (duración
 * estándar); el desvío (real − guía) alimenta la eficiencia.
 */

export type ClaseParada = "PROGRAMADA" | "NO_PROGRAMADA" | "OCIOSO"
export type OrigenParada = "MANUAL" | "SHEET" | "MANTENIMIENTO"

/** Orden fijo para todos los repartos por clase. */
export const CLASES_PARADA: ClaseParada[] = ["PROGRAMADA", "NO_PROGRAMADA", "OCIOSO"]

export const NOMBRE_CLASE: Record<ClaseParada, string> = {
  PROGRAMADA: "Programada",
  NO_PROGRAMADA: "No programada",
  OCIOSO: "Tiempo ocioso",
}

/** Color semántico por clase (tokens del tema). */
export const COLOR_CLASE: Record<ClaseParada, string> = {
  PROGRAMADA: "bg-info",
  NO_PROGRAMADA: "bg-danger",
  OCIOSO: "bg-warning",
}

// ------------------------------------------------------------
// Catálogo de tipos
// ------------------------------------------------------------

/**
 * Familia del tipo — agrupa el catálogo para reportes/filtros y explica el
 * prefijo del código de planilla. PROGRAMADA es la única familia de clase
 * PROGRAMADA; el resto son NO_PROGRAMADA. Las fallas de equipo (EQUIPO,
 * EQUIPO_PROCESO) las registra Mantenimiento — ver FAMILIAS_SUPERVISOR.
 */
export type FamiliaParada =
  | "PROGRAMADA"
  | "EXTERNA"
  | "OPERACIONAL"
  | "SUMINISTRO_VAPOR"
  | "SUMINISTRO"
  | "ESTERILIZACION"
  | "PREPARACION"
  | "CODIFICACION"
  | "OCIOSO"
  | "EQUIPO"
  | "EQUIPO_PROCESO"

export const NOMBRE_FAMILIA: Record<FamiliaParada, string> = {
  PROGRAMADA: "Programada",
  EXTERNA: "Línea no programada (LNPE)",
  OPERACIONAL: "Operacional (OP)",
  SUMINISTRO_VAPOR: "Suministro de vapor",
  SUMINISTRO: "Suministro (S)",
  ESTERILIZACION: "Esterilización / proceso térmico",
  PREPARACION: "Preparación",
  CODIFICACION: "Codificación",
  OCIOSO: "Tiempo ocioso",
  EQUIPO: "Equipo de línea",
  EQUIPO_PROCESO: "Equipo de Proceso (EP)",
}

/** Una línea donde existe un tipo, con su propia secuencia de código si difiere de la normal. */
export interface LineaDeTipo {
  area: string
  /** LINEA_1 / LINEA_2 / LINEA_3 */
  linea: string
  /** null = usa la secuencia normal del tipo. */
  secuencia: number | null
  /** Presentaciones (ml) en que existe en esa línea. Vacío o ausente = todas. */
  presentaciones?: number[] | null
}

/**
 * Familias que registra el SUPERVISOR (además del tiempo ocioso): Programadas, Línea no programada (LNPE)
 * y Operacionales. Todo lo demás de No programada (equipos, Suministro, Equipo de Proceso, Domino) lo
 * registra Mantenimiento (dueño, 2026-09-21).
 */
/** +1 sin código: al completarlo hay que elegir la falla de equipo real (migración 20261090). */
export const TIPO_FALLA_SIN_ESPECIFICAR = "FALLA_SIN_ESPECIFICAR"
/** +1 que crea Líneas al parar una corrida: el tipo se elige después, en Registrar Paradas. */
export const TIPO_POR_CLASIFICAR = "POR_CLASIFICAR"

export const FAMILIAS_SUPERVISOR: FamiliaParada[] = ["PROGRAMADA", "EXTERNA", "OPERACIONAL"]
export const registraSupervisor = (t: { familia: FamiliaParada }) => FAMILIAS_SUPERVISOR.includes(t.familia)

/** Un tipo del catálogo de paradas. El vigente vive en la tabla `paradas_tipos` (ver paradasCatalogo.ts); CATALOGO_TIPOS es la semilla. */
export interface TipoParada {
  codigo: string
  nombre: string
  clase: ClaseParada
  familia: FamiliaParada
  /** Duración estándar en minutos. Solo las PROGRAMADAS la tienen; en el resto es null. */
  tiempoGuiaMin: number | null
  /** Equipo al que pertenece la falla (código del catálogo de equipos). null = no es falla de equipo. */
  equipoCodigo?: string | null
  /** false = el código NO lleva el número de línea (A3F-1, CAP-1). Por defecto sí (AHL1-1). */
  codigoConLinea?: boolean
  /** Prefijo del código de planilla de Mantenimiento SIN el número de línea (ej. "PP", "LNPE"). Ver `codigoPlanilla()`. */
  prefijoPlanilla: string
  /** Secuencial dentro de la familia (ej. el "-3" de "LNPEL1-3"). null cuando la familia no lo usa (PROGRAMADA). */
  secuenciaPlanilla: number | null
  /**
   * Líneas donde existe el tipo. Vacío o ausente = todas. Si un área tiene filas, el tipo existe SOLO en
   * esas líneas de esa área (y la secuencia de la fila manda sobre la normal); las áreas sin filas no se afectan.
   */
  lineas?: LineaDeTipo[]
}

/**
 * Código real de planilla para un tipo EN UNA LÍNEA dada: el nombre, la
 * clase y el tiempo guía son los mismos en las 3 líneas — solo cambia el
 * número de línea dentro del código (`prefijoPlanilla + "L" + número +
 * secuencia`). Ej.: TRANSFERENCIA_ENERGIA en Línea 2 → "PPEL2"; FALTA_VAPOR
 * en Línea 3 → "SCL3-1". (Dueño, 2026-09-15: "solo cambiaría el código".)
 */
export function codigoPlanilla(tipo: TipoParada, lineaCodigo: string, area?: string | null): string {
  const numero = lineaCodigo.replace(/^LINEA_T?/, "")
  const linea = tipo.codigoConLinea === false ? "" : `L${numero}`
  // La secuencia puede cambiar por línea (la Línea 2 numera distinto a la 1 en Operacional, Robot Tavil…).
  const propia = tipo.lineas?.find((l) => l.linea.replace(/^LINEA_T?/, "") === numero && (!area || l.area === area))
  const secuencia = propia?.secuencia ?? tipo.secuenciaPlanilla
  return `${tipo.prefijoPlanilla}${linea}${secuencia != null ? `-${secuencia}` : ""}`
}

/*
 * Seed del catálogo completo (planilla del dueño, 2026-09-15). Los códigos
 * de esta lista son los de LÍNEA 1 tal cual los pasó el dueño; para otras
 * líneas se reconstruyen con `codigoPlanilla()` (mismo prefijo/secuencia,
 * cambia el número). Es la semilla: si `paradas_tipos` no responde, se usa
 * esta lista (ver paradasCatalogo.ts).
 */
export const CATALOGO_TIPOS: TipoParada[] = [
  // ---- Programada (PPL# / PPEL#) ----
  { codigo: "ARRANQUE_PRODUCCION", nombre: "Arranque de Producción", clase: "PROGRAMADA", familia: "PROGRAMADA", tiempoGuiaMin: 180, prefijoPlanilla: "PP", secuenciaPlanilla: null },
  { codigo: "CAMBIO_LOTE", nombre: "Cambio de Lote", clase: "PROGRAMADA", familia: "PROGRAMADA", tiempoGuiaMin: 10, prefijoPlanilla: "PP", secuenciaPlanilla: null },
  { codigo: "CAMBIO_SABOR", nombre: "Cambio de Sabor", clase: "PROGRAMADA", familia: "PROGRAMADA", tiempoGuiaMin: 25, prefijoPlanilla: "PP", secuenciaPlanilla: null },
  { codigo: "DESCANSO_LEGAL", nombre: "Descanso Legal", clase: "PROGRAMADA", familia: "PROGRAMADA", tiempoGuiaMin: 30, prefijoPlanilla: "PP", secuenciaPlanilla: null },
  { codigo: "FINAL_PRODUCCION", nombre: "Final de Producción", clase: "PROGRAMADA", familia: "PROGRAMADA", tiempoGuiaMin: null, prefijoPlanilla: "PP", secuenciaPlanilla: null },
  { codigo: "LIMPIEZA_INTERMEDIA", nombre: "Limpieza Intermedia Programada", clase: "PROGRAMADA", familia: "PROGRAMADA", tiempoGuiaMin: 180, prefijoPlanilla: "PP", secuenciaPlanilla: null },
  { codigo: "ORDEN_LIMPIEZA_FIN_TURNO", nombre: "Orden y Limpieza del Área — Final de Turno", clase: "PROGRAMADA", familia: "PROGRAMADA", tiempoGuiaMin: 15, prefijoPlanilla: "PP", secuenciaPlanilla: null },
  { codigo: "MANTENIMIENTO_PROGRAMADO", nombre: "Mantenimiento Programado / Cambio de Presentación", clase: "PROGRAMADA", familia: "PROGRAMADA", tiempoGuiaMin: 180, prefijoPlanilla: "PP", secuenciaPlanilla: null },
  { codigo: "DESARROLLO_PRODUCTO", nombre: "Desarrollo de Producto / Insumo", clase: "PROGRAMADA", familia: "PROGRAMADA", tiempoGuiaMin: null, prefijoPlanilla: "PP", secuenciaPlanilla: null },
  { codigo: "LIBERACION_VAPOR", nombre: "Liberación de Vapor", clase: "PROGRAMADA", familia: "PROGRAMADA", tiempoGuiaMin: null, prefijoPlanilla: "PP", secuenciaPlanilla: null },
  { codigo: "TRANSFERENCIA_ENERGIA", nombre: "Transferencia de Energía Eléctrica / Preventivo", clase: "PROGRAMADA", familia: "PROGRAMADA", tiempoGuiaMin: null, prefijoPlanilla: "PPE", secuenciaPlanilla: null },

  // ---- Línea no programada / externa (LNPEL#-#) ----
  { codigo: "LINEA_NO_PROG_VENTAS", nombre: "Disponibilidad de Ventas", clase: "NO_PROGRAMADA", familia: "EXTERNA", tiempoGuiaMin: null, prefijoPlanilla: "LNPE", secuenciaPlanilla: 1 },
  { codigo: "LINEA_NO_PROG_INSUMOS_PALETAS", nombre: "Falta de Insumos/Paletas", clase: "NO_PROGRAMADA", familia: "EXTERNA", tiempoGuiaMin: null, prefijoPlanilla: "LNPE", secuenciaPlanilla: 2 },
  { codigo: "FALLA_SUMINISTRO_ELECTRICO", nombre: "Falla en Suministro Eléctrico", clase: "NO_PROGRAMADA", familia: "EXTERNA", tiempoGuiaMin: null, prefijoPlanilla: "LNPE", secuenciaPlanilla: 3 },
  { codigo: "LINEA_NO_PROG_ESPACIO_ALMACEN", nombre: "Falta de Espacio Almacenamiento", clase: "NO_PROGRAMADA", familia: "EXTERNA", tiempoGuiaMin: null, prefijoPlanilla: "LNPE", secuenciaPlanilla: 4 },
  { codigo: "FERIADO", nombre: "Feriado", clase: "NO_PROGRAMADA", familia: "EXTERNA", tiempoGuiaMin: null, prefijoPlanilla: "LNPE", secuenciaPlanilla: 5 },
  { codigo: "PRESENTACION_NO_PLANIFICADA", nombre: "Presentación No Planificada", clase: "NO_PROGRAMADA", familia: "EXTERNA", tiempoGuiaMin: null, prefijoPlanilla: "LNPE", secuenciaPlanilla: 6 },

  // ---- Operacional (OPL#-#) ----
  { codigo: "DESVASE_PRODUCTO", nombre: "Desvase de Producto", clase: "NO_PROGRAMADA", familia: "OPERACIONAL", tiempoGuiaMin: null, prefijoPlanilla: "OP", secuenciaPlanilla: 1 },
  { codigo: "INSUMOS_NO_CONFORME", nombre: "Insumos (Prueba Industrial)", clase: "NO_PROGRAMADA", familia: "OPERACIONAL", tiempoGuiaMin: null, prefijoPlanilla: "OP", secuenciaPlanilla: 2 },
  { codigo: "LOGISTICA_LINEA", nombre: "Logística de Línea", clase: "NO_PROGRAMADA", familia: "OPERACIONAL", tiempoGuiaMin: null, prefijoPlanilla: "OP", secuenciaPlanilla: 3 },
  { codigo: "PARADAS_NO_DOCUMENTADAS", nombre: "Paradas No Documentadas", clase: "NO_PROGRAMADA", familia: "OPERACIONAL", tiempoGuiaMin: null, prefijoPlanilla: "OP", secuenciaPlanilla: 4 },
  { codigo: "FALTA_DISPONIBILIDAD_INSUMO", nombre: "Falta de Disponibilidad de Insumo", clase: "NO_PROGRAMADA", familia: "OPERACIONAL", tiempoGuiaMin: null, prefijoPlanilla: "OP", secuenciaPlanilla: 5 },
  { codigo: "FALLA_FALTA_MONTACARGAS", nombre: "Falla / Falta de Montacargas", clase: "NO_PROGRAMADA", familia: "OPERACIONAL", tiempoGuiaMin: null, prefijoPlanilla: "OP", secuenciaPlanilla: 6 },
  { codigo: "FALLA_OPERACIONAL", nombre: "Falla Operacional (Operación)", clase: "NO_PROGRAMADA", familia: "OPERACIONAL", tiempoGuiaMin: null, prefijoPlanilla: "OP", secuenciaPlanilla: 7 },
  { codigo: "FALTA_OPERADOR", nombre: "Falta de operador", clase: "NO_PROGRAMADA", familia: "OPERACIONAL", tiempoGuiaMin: null, prefijoPlanilla: "OP", secuenciaPlanilla: 8 },
  { codigo: "LOGISTICA_CONDICIONADA_DISTRIBUCION", nombre: "Logística Condicionada por Distribución", clase: "NO_PROGRAMADA", familia: "OPERACIONAL", tiempoGuiaMin: null, prefijoPlanilla: "OP", secuenciaPlanilla: 9 },

  // ---- Codificación (IDL#-#) ----
  { codigo: "FALLA_CODIFICACION", nombre: "Falla en la Codificación", clase: "NO_PROGRAMADA", familia: "CODIFICACION", tiempoGuiaMin: null, prefijoPlanilla: "ID", secuenciaPlanilla: 1 },

  // ---- Suministro de vapor (SCL#-#) ----
  { codigo: "FALTA_VAPOR", nombre: "Falta de Vapor", clase: "NO_PROGRAMADA", familia: "SUMINISTRO_VAPOR", tiempoGuiaMin: null, prefijoPlanilla: "SC", secuenciaPlanilla: 1 },

  // ---- Suministro (SL#-#) ----
  { codigo: "BAJA_PRESION_AGUA_DURA", nombre: "Baja Presión de Agua Dura", clase: "NO_PROGRAMADA", familia: "SUMINISTRO", tiempoGuiaMin: null, prefijoPlanilla: "S", secuenciaPlanilla: 1 },
  { codigo: "BAJA_PRESION_AGUA_OSMOTIZADA_PRINCIPAL", nombre: "Baja Presión de Agua Osmotizada Principal", clase: "NO_PROGRAMADA", familia: "SUMINISTRO", tiempoGuiaMin: null, prefijoPlanilla: "S", secuenciaPlanilla: 2 },
  { codigo: "BAJA_PRESION_AGUA_OSMOTIZADA_SECUNDARIO", nombre: "Baja Presión de Agua Osmotizada Secundario", clase: "NO_PROGRAMADA", familia: "SUMINISTRO", tiempoGuiaMin: null, prefijoPlanilla: "S", secuenciaPlanilla: 3 },
  { codigo: "BAJA_PRESION_AIRE_COMPRIMIDO", nombre: "Baja Presión de Aire Comprimido", clase: "NO_PROGRAMADA", familia: "SUMINISTRO", tiempoGuiaMin: null, prefijoPlanilla: "S", secuenciaPlanilla: 4 },
  { codigo: "FALLA_GENERADOR_440V", nombre: "Falla en Generador 440V", clase: "NO_PROGRAMADA", familia: "SUMINISTRO", tiempoGuiaMin: null, prefijoPlanilla: "S", secuenciaPlanilla: 5 },
  { codigo: "FALLA_GENERADOR_480V", nombre: "Falla en Generador 480V", clase: "NO_PROGRAMADA", familia: "SUMINISTRO", tiempoGuiaMin: null, prefijoPlanilla: "S", secuenciaPlanilla: 6 },
  { codigo: "FALLA_SUMINISTRO_AGUA_HELADA", nombre: "Falla en Suministro de Agua Helada", clase: "NO_PROGRAMADA", familia: "SUMINISTRO", tiempoGuiaMin: null, prefijoPlanilla: "S", secuenciaPlanilla: 7 },
  { codigo: "ALARMA_440V", nombre: "Alarma 440V", clase: "NO_PROGRAMADA", familia: "SUMINISTRO", tiempoGuiaMin: null, prefijoPlanilla: "S", secuenciaPlanilla: 8 },

  // ---- Esterilización / proceso térmico (EPTL#-#) ----
  { codigo: "FALLA_NIVEL_BTD", nombre: "Falla de Nivel del BTD", clase: "NO_PROGRAMADA", familia: "ESTERILIZACION", tiempoGuiaMin: null, prefijoPlanilla: "EPT", secuenciaPlanilla: 1 },
  { codigo: "FALLA_SISTEMA_AGUA_CALIENTE", nombre: "Falla en el Sistema de Agua Caliente", clase: "NO_PROGRAMADA", familia: "ESTERILIZACION", tiempoGuiaMin: null, prefijoPlanilla: "EPT", secuenciaPlanilla: 2 },
  { codigo: "PERDIDA_ESTERILIDAD", nombre: "Pérdida de Esterilidad", clase: "NO_PROGRAMADA", familia: "ESTERILIZACION", tiempoGuiaMin: null, prefijoPlanilla: "EPT", secuenciaPlanilla: 3 },
  { codigo: "RETRASO_ARRANQUE", nombre: "Retraso en el Arranque", clase: "NO_PROGRAMADA", familia: "ESTERILIZACION", tiempoGuiaMin: null, prefijoPlanilla: "EPT", secuenciaPlanilla: 4 },
  { codigo: "RETRASO_ESTERILIZACION", nombre: "Retraso en la Esterilización", clase: "NO_PROGRAMADA", familia: "ESTERILIZACION", tiempoGuiaMin: null, prefijoPlanilla: "EPT", secuenciaPlanilla: 5 },
  { codigo: "RETRASO_LIMPIEZA", nombre: "Retraso en la Limpieza", clase: "NO_PROGRAMADA", familia: "ESTERILIZACION", tiempoGuiaMin: null, prefijoPlanilla: "EPT", secuenciaPlanilla: 6 },
  { codigo: "DESPLACE_INCORRECTO", nombre: "Desplace Incorrecto", clase: "NO_PROGRAMADA", familia: "ESTERILIZACION", tiempoGuiaMin: null, prefijoPlanilla: "EPT", secuenciaPlanilla: 7 },
  { codigo: "EMPACADURAS_DETERIORADAS", nombre: "Empacaduras Deterioradas", clase: "NO_PROGRAMADA", familia: "ESTERILIZACION", tiempoGuiaMin: null, prefijoPlanilla: "EPT", secuenciaPlanilla: 8 },
  { codigo: "LOGISTICA_CONDICIONADA", nombre: "Logística Condicionada", clase: "NO_PROGRAMADA", familia: "ESTERILIZACION", tiempoGuiaMin: null, prefijoPlanilla: "EPT", secuenciaPlanilla: 9 },

  // ---- Preparación (PL#-#) ----
  { codigo: "COLEO_PREPARACION", nombre: "Coleo de Preparación", clase: "NO_PROGRAMADA", familia: "PREPARACION", tiempoGuiaMin: null, prefijoPlanilla: "P", secuenciaPlanilla: 1 },
]

/** Solo la familia PROGRAMADA — para quien necesite ese subconjunto puntual. */
export const CATALOGO_PROGRAMADA: TipoParada[] = CATALOGO_TIPOS.filter((t) => t.clase === "PROGRAMADA")

export const tipoPorCodigo = (codigo: string) => CATALOGO_TIPOS.find((t) => t.codigo === codigo) ?? null

/** Código de planilla de una parada ya registrada (resuelve su tipo + su línea). null si no tiene tipo de catálogo (Ocioso, Mecánica). */
export function codigoDeParada(p: Pick<Parada, "tipoCodigo" | "lineaCodigo">): string | null {
  if (!p.tipoCodigo) return null
  const tipo = tipoPorCodigo(p.tipoCodigo)
  return tipo ? codigoPlanilla(tipo, p.lineaCodigo) : null
}

// ------------------------------------------------------------
// Líneas y turnos
// ------------------------------------------------------------

/** Las 3 líneas físicas (mismo criterio en todas las áreas). */
export const LINEAS_PARADAS = [
  { codigo: "LINEA_1", nombre: "Línea 1" },
  { codigo: "LINEA_2", nombre: "Línea 2" },
  { codigo: "LINEA_3", nombre: "Línea 3" },
] as const

export const nombreLineaParada = (codigo: string) =>
  LINEAS_PARADAS.find((l) => l.codigo === codigo)?.nombre ?? codigo
export const nombreTurnoParada = (tt: string) => `Turno ${tt.replace("TURNO_", "")}`

// ------------------------------------------------------------
// Una parada
// ------------------------------------------------------------

/** Una parada, con los nombres ya resueltos (forma que devolverá `listar_paradas`). */
export interface Parada {
  id: string
  clase: ClaseParada
  origen: OrigenParada
  lineaCodigo: string // 'LINEA_1' | 'LINEA_2' | 'LINEA_3'
  turnoTipo: string // 'TURNO_1' | 'TURNO_2' | 'TURNO_3'
  /** Tipo del catálogo. null solo para OCIOSO (texto libre). */
  tipoCodigo: string | null
  tipoNombre: string
  /** Heredado del tipo al momento de registrar (o cargado a mano en Ocioso). */
  tiempoGuiaMin: number | null
  /** Texto libre — obligatorio en OCIOSO, opcional en el resto. */
  nota: string | null
  /**
   * Por qué se pasó del tiempo guía — obligatoria en el formulario SOLO
   * para PROGRAMADA cuando la duración real superó `tiempoGuiaMin` (dueño,
   * 2026-09-15); separada de `nota` a propósito, que sigue siendo siempre
   * opcional. null en cualquier otro caso (incluye Ocioso y No Programada,
   * que no tienen esta obligación aunque tengan guía cargada).
   */
  justificacionDesvio: string | null
  /** ISO local 'YYYY-MM-DDTHH:MM:SS'. */
  inicio: string
  /**
   * null = parada abierta ("en curso"). SOLO ocurre en `origen:
   * "MANTENIMIENTO"` — Mantenimiento la registra con hora real de inicio y
   * la cierra después (`cerrar_parada_mantenimiento`), puede durar más de
   * un turno (migración 20261070). Las paradas manuales (Programada / No
   * Programada manual / Ocioso) se cargan con duración, no con hora de
   * inicio/fin — quedan siempre cerradas desde que se guardan, `fin` nunca
   * es null para `origen: "MANUAL"`.
   */
  fin: string | null
  supervisorNombre: string | null
  /**
   * +1 todavía sin minutos (migración 20261090). Se guarda con inicio = fin,
   * así que en todos los reportes cuenta 1 vez y 0 min hasta completarla.
   * No es lo mismo que "en curso" (fin null).
   */
  pendiente?: boolean
}

export const paradaAbierta = (p: Parada) => p.fin === null

// ------------------------------------------------------------
// Duración y desvío
// ------------------------------------------------------------

/** Duración en minutos: `fin − inicio` (o `ahora − inicio` si está abierta). */
export function duracionMin(p: Pick<Parada, "inicio" | "fin">, ahora: Date = new Date()): number {
  const ini = new Date(p.inicio).getTime()
  const fin = p.fin ? new Date(p.fin).getTime() : ahora.getTime()
  return Math.max(0, Math.round((fin - ini) / 60000))
}

/**
 * Minutos por clase de las paradas de UNA línea, contando una sola vez el
 * tiempo que se solapa: si el supervisor y Mantenimiento registran la
 * misma falla, no se suma dos veces. El tramo compartido se lo queda la
 * parada que empezó primero. `desdeMs`: lo anterior a ese instante no
 * cuenta (ver eficienciaDelTurno, que mide desde que arrancó la línea).
 *
 * Ojo: la parada del supervisor se guarda con fin = hora en que la
 * registró e inicio = fin − minutos. Si la registra mucho después, su
 * tramo no coincide en el reloj con el de Mantenimiento y no se detecta.
 */
export function minutosPorClaseSinSolape(
  paradas: Pick<Parada, "inicio" | "fin" | "clase">[],
  ahora: Date = new Date(),
  desdeMs = -Infinity,
): Record<ClaseParada, number> {
  const tramos = paradas
    .map((p) => ({
      ini: Math.max(new Date(p.inicio).getTime(), desdeMs),
      fin: p.fin ? new Date(p.fin).getTime() : ahora.getTime(),
      clase: p.clase,
    }))
    .filter((t) => t.fin > t.ini)
    .sort((a, b) => a.ini - b.ini || b.fin - a.fin)

  const ms: Record<ClaseParada, number> = { PROGRAMADA: 0, NO_PROGRAMADA: 0, OCIOSO: 0 }
  let cubiertoHasta = -Infinity
  for (const t of tramos) {
    const desde = Math.max(t.ini, cubiertoHasta)
    if (t.fin > desde) ms[t.clase] += t.fin - desde
    cubiertoHasta = Math.max(cubiertoHasta, t.fin)
  }
  return {
    PROGRAMADA: Math.round(ms.PROGRAMADA / 60000),
    NO_PROGRAMADA: Math.round(ms.NO_PROGRAMADA / 60000),
    OCIOSO: Math.round(ms.OCIOSO / 60000),
  }
}

/**
 * Desvío contra el tiempo guía: `duración real − tiempo guía`.
 * Positivo = se pasó; negativo = más corta. null si el tipo no tiene guía.
 */
export function desvioMin(p: Parada, ahora?: Date): number | null {
  if (p.tiempoGuiaMin == null) return null
  return duracionMin(p, ahora) - p.tiempoGuiaMin
}

export function fmtDuracion(min: number): string {
  if (min < 1) return "< 1 min"
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/** "+18 min" / "−5 min" / "en guía". */
export function fmtDesvio(min: number): string {
  if (min === 0) return "en guía"
  const signo = min > 0 ? "+" : "-"
  return `${signo}${fmtDuracion(Math.abs(min))}`
}

// ------------------------------------------------------------
// Agregaciones (compartidas por el Panel de Paradas y el de Producción)
// ------------------------------------------------------------

export interface ResumenClase {
  clase: ClaseParada
  etiqueta: string
  veces: number
  minutos: number
}
/** Reparto del tiempo perdido entre Programada / No programada / Ocioso (orden fijo). */
export function resumenPorClase(paradas: Parada[], ahora?: Date): ResumenClase[] {
  return CLASES_PARADA.map((clase) => {
    const dela = paradas.filter((p) => p.clase === clase)
    return {
      clase,
      etiqueta: NOMBRE_CLASE[clase],
      veces: dela.length,
      minutos: dela.reduce((a, p) => a + duracionMin(p, ahora), 0),
    }
  })
}

export interface ResumenLineaParada {
  linea: string
  veces: number
  minutos: number
  /** minutos por clase, para el desglose de cada línea. */
  porClase: Record<ClaseParada, number>
}
export function minutosPorLinea(paradas: Parada[], ahora?: Date): ResumenLineaParada[] {
  const codigos = [...new Set([...LINEAS_PARADAS.map((l) => l.codigo), ...paradas.map((p) => p.lineaCodigo)])]
  return codigos
    .map((linea) => {
      const propias = paradas.filter((p) => p.lineaCodigo === linea)
      // Sin solape: la misma falla cargada por supervisor y Mantenimiento cuenta una vez.
      const porClase = minutosPorClaseSinSolape(propias, ahora)
      return { linea, veces: propias.length, minutos: porClase.PROGRAMADA + porClase.NO_PROGRAMADA + porClase.OCIOSO, porClase }
    })
    .sort((a, b) => a.linea.localeCompare(b.linea))
}

export interface GrupoTipo {
  codigo: string
  nombre: string
  clase: ClaseParada
  veces: number
  minutos: number
  /** suma del tiempo guía de las paradas de este tipo que SÍ tienen guía. */
  guiaMin: number
  /** minutos − guiaMin, contando solo las que tienen guía. null si ninguna la tiene. */
  desvioMin: number | null
  /** Solo cuando el agrupado distingue línea (porTipoYLinea) — undefined en porTipo()/porTipoPorFrecuencia(). */
  lineaCodigo?: string
}
/** Minutos + frecuencia + desvío por TIPO — "qué tipo pesa más y cuánto se pasa de su guía". */
export function porTipo(paradas: Parada[], ahora?: Date): GrupoTipo[] {
  const m = new Map<string, GrupoTipo & { _conGuia: number }>()
  for (const p of paradas) {
    const clave = p.tipoCodigo ?? `LIBRE:${p.tipoNombre}`
    const g = m.get(clave) ?? {
      codigo: clave,
      nombre: p.tipoNombre,
      clase: p.clase,
      veces: 0,
      minutos: 0,
      guiaMin: 0,
      desvioMin: null,
      _conGuia: 0,
    }
    const min = duracionMin(p, ahora)
    g.veces += 1
    g.minutos += min
    if (p.tiempoGuiaMin != null) {
      g.guiaMin += p.tiempoGuiaMin
      g._conGuia += min
    }
    m.set(clave, g)
  }
  return [...m.values()]
    .map(({ _conGuia, ...g }) => ({
      ...g,
      desvioMin: g.guiaMin > 0 || _conGuia > 0 ? _conGuia - g.guiaMin : null,
    }))
    .sort((a, b) => b.minutos - a.minutos || b.veces - a.veces)
}

/** Mismo agrupado de porTipo(), pero ordenado por CANTIDAD de veces en vez de minutos — "Top Paradas por Frecuencia". */
export function porTipoPorFrecuencia(paradas: Parada[], ahora?: Date): GrupoTipo[] {
  return porTipo(paradas, ahora).sort((a, b) => b.veces - a.veces || b.minutos - a.minutos)
}

/**
 * Como porTipo(), pero agrupa por TIPO + LÍNEA (no solo tipo) — para los
 * rankings que mezclan las 3 líneas (Top Paradas por Frecuencia/Tiempo del
 * Panel): el mismo tipo puede repetirse una vez por línea, y cada fila
 * sabe de cuál línea es (`lineaCodigo`).
 */
export function porTipoYLinea(paradas: Parada[], ahora?: Date): GrupoTipo[] {
  const m = new Map<string, GrupoTipo & { _conGuia: number }>()
  for (const p of paradas) {
    const clave = `${p.lineaCodigo}::${p.tipoCodigo ?? `LIBRE:${p.tipoNombre}`}`
    const g = m.get(clave) ?? {
      codigo: clave,
      nombre: p.tipoNombre,
      clase: p.clase,
      lineaCodigo: p.lineaCodigo,
      veces: 0,
      minutos: 0,
      guiaMin: 0,
      desvioMin: null,
      _conGuia: 0,
    }
    const min = duracionMin(p, ahora)
    g.veces += 1
    g.minutos += min
    if (p.tiempoGuiaMin != null) {
      g.guiaMin += p.tiempoGuiaMin
      g._conGuia += min
    }
    m.set(clave, g)
  }
  return [...m.values()]
    .map(({ _conGuia, ...g }) => ({
      ...g,
      desvioMin: g.guiaMin > 0 || _conGuia > 0 ? _conGuia - g.guiaMin : null,
    }))
    .sort((a, b) => b.minutos - a.minutos || b.veces - a.veces)
}

/** Mismo agrupado de porTipoYLinea(), ordenado por CANTIDAD de veces — "Top Paradas por Frecuencia". */
export function porTipoYLineaPorFrecuencia(paradas: Parada[], ahora?: Date): GrupoTipo[] {
  return porTipoYLinea(paradas, ahora).sort((a, b) => b.veces - a.veces || b.minutos - a.minutos)
}

/**
 * De un ranking de porTipoYLinea() / porTipoYLineaPorFrecuencia() (ya
 * ordenado), se queda solo con la PRIMERA fila de cada línea — "Top
 * Paradas" del Panel de Paradas: una por línea (máximo 3), no las 5
 * primeras de la planta, que podían ser todas de la misma línea. Mantiene
 * el orden del ranking que recibe.
 */
export function primeraDeCadaLinea(ranking: GrupoTipo[]): GrupoTipo[] {
  const vistas = new Set<string>()
  return ranking.filter((g) => {
    const linea = g.lineaCodigo ?? ""
    if (vistas.has(linea)) return false
    vistas.add(linea)
    return true
  })
}

export interface PuntoDiaParada {
  dia: string // 'YYYY-MM-DD'
  minutos: number
  veces: number
}
export function agruparPorDia(paradas: Parada[], ahora?: Date): PuntoDiaParada[] {
  const m = new Map<string, PuntoDiaParada>()
  for (const p of paradas) {
    const dia = p.inicio.slice(0, 10)
    const g = m.get(dia) ?? { dia, minutos: 0, veces: 0 }
    g.minutos += duracionMin(p, ahora)
    g.veces += 1
    m.set(dia, g)
  }
  return [...m.values()].sort((a, b) => a.dia.localeCompare(b.dia))
}

// ------------------------------------------------------------
// Capa de datos
// ------------------------------------------------------------

export interface FiltrosParadas {
  desde: string // 'YYYY-MM-DD'
  hasta: string
  linea?: string
  clase?: ClaseParada
  /** Solo las paradas de este turno (ignora desde/hasta). */
  turnoId?: string
  /** Área de la consulta por fechas: 'ASEPTICO' / 'PRUEBAS'. Sin área: las de producción, nunca las de Pruebas. */
  area?: string | null
}

interface FilaParada {
  id: string
  clase: ClaseParada
  origen: OrigenParada
  linea_codigo: string
  turno_tipo: string
  tipo_codigo: string | null
  tipo_nombre: string
  tiempo_guia_min: number | null
  nota: string | null
  justificacion_desvio: string | null
  inicio: string
  fin: string | null
  supervisor_nombre: string | null
  pendiente?: boolean | null
}

/** Lee `listar_paradas` (migración 20261061). Devuelve [] si la lectura falla. */
export async function listarParadas(filtros: FiltrosParadas): Promise<Parada[]> {
  const { data, error } = await supabase.rpc("listar_paradas", {
    p_desde: filtros.desde,
    p_hasta: filtros.hasta,
    p_linea: filtros.linea ?? null,
    p_clase: filtros.clase ?? null,
    p_turno_id: filtros.turnoId ?? null,
    p_area: filtros.area ?? null,
  })
  if (error || !data) return []
  return (data as FilaParada[]).map((f) => ({
    id: f.id,
    clase: f.clase,
    origen: f.origen,
    lineaCodigo: f.linea_codigo,
    turnoTipo: f.turno_tipo,
    tipoCodigo: f.tipo_codigo,
    tipoNombre: f.tipo_nombre,
    tiempoGuiaMin: f.tiempo_guia_min != null ? Number(f.tiempo_guia_min) : null,
    nota: f.nota,
    justificacionDesvio: f.justificacion_desvio,
    inicio: f.inicio,
    fin: f.fin,
    supervisorNombre: f.supervisor_nombre,
    pendiente: f.pendiente === true,
  }))
}

export interface DatosRegistroParada {
  turnoId: string
  lineaCodigo: string
  /** null = Ocioso de texto libre (la nota es obligatoria). */
  tipoCodigo: string | null
  minutos: number
  nota: string | null
  justificacionDesvio: string | null
}

/** Guarda una parada ya cerrada en el turno (`registrar_parada`). El servidor calcula inicio/fin. */
export async function registrarParada(
  usuario: string,
  datos: DatosRegistroParada,
  pagina: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc("registrar_parada", {
    p_usuario: usuario,
    p_turno_id: datos.turnoId,
    p_linea_codigo: datos.lineaCodigo,
    p_tipo_codigo: datos.tipoCodigo,
    p_minutos: datos.minutos,
    p_nota: datos.nota,
    p_justificacion_desvio: datos.justificacionDesvio,
    p_pagina: pagina,
  })
  if (error) return { ok: false, error: error.message || "No se pudo guardar la parada. Intenta de nuevo." }
  return { ok: true }
}

// ------------------------------------------------------------
// Paradas de Mantenimiento (migración 20261070)
// ------------------------------------------------------------

type Resultado = { ok: true } | { ok: false; error: string }

export interface DatosParadaMantenimiento {
  lineaCodigo: string
  tipoCodigo: string
  /** Hora de planta, 'YYYY-MM-DDTHH:MM:SS'. */
  inicio: string
  /** null = en curso. */
  fin: string | null
  nota: string | null
}

/** Registra una parada de Mantenimiento (sin fin queda en curso). Solo el área de Mantenimiento; el servidor lo valida. */
export async function registrarParadaMantenimiento(usuario: string, datos: DatosParadaMantenimiento, pagina: string): Promise<Resultado> {
  const { error } = await supabase.rpc("registrar_parada_mantenimiento", {
    p_usuario: usuario,
    p_linea_codigo: datos.lineaCodigo,
    p_tipo_codigo: datos.tipoCodigo,
    p_inicio: datos.inicio,
    p_fin: datos.fin,
    p_nota: datos.nota,
    p_pagina: pagina,
  })
  return error ? { ok: false, error: error.message || "No se pudo guardar la parada. Intenta de nuevo." } : { ok: true }
}

/** Cierra una parada en curso (fin = ahora). */
export async function cerrarParadaMantenimiento(usuario: string, paradaId: string, pagina: string): Promise<Resultado> {
  const { error } = await supabase.rpc("cerrar_parada_mantenimiento", { p_usuario: usuario, p_parada_id: paradaId, p_pagina: pagina })
  return error ? { ok: false, error: error.message || "No se pudo cerrar la parada. Intenta de nuevo." } : { ok: true }
}

/** Elimina una parada cargada por error (queda en Auditoría). */
export async function eliminarParadaMantenimiento(usuario: string, paradaId: string, pagina: string): Promise<Resultado> {
  const { error } = await supabase.rpc("eliminar_parada_mantenimiento", { p_usuario: usuario, p_parada_id: paradaId, p_pagina: pagina })
  return error ? { ok: false, error: error.message || "No se pudo eliminar la parada. Intenta de nuevo." } : { ok: true }
}

// ------------------------------------------------------------
// Registrar Paradas, pantalla única (migración 20261090)
// ------------------------------------------------------------

export interface DatosAnotarParada {
  lineaCodigo: string
  /** null = tiempo ocioso de texto libre (la nota es obligatoria). */
  tipoCodigo: string | null
  /** Hora de planta 'YYYY-MM-DDTHH:MM:SS'. null = +1 pendiente (sin minutos). */
  inicio: string | null
  /** null con inicio = en curso. */
  fin: string | null
  nota: string | null
}

/** +1 pendiente (sin inicio) o parada con horas reales (en curso si no trae fin). */
export async function anotarParada(usuario: string, datos: DatosAnotarParada, pagina: string): Promise<Resultado> {
  const { error } = await supabase.rpc("anotar_parada", {
    p_usuario: usuario,
    p_linea_codigo: datos.lineaCodigo,
    p_tipo_codigo: datos.tipoCodigo,
    p_inicio: datos.inicio,
    p_fin: datos.fin,
    p_nota: datos.nota,
    p_pagina: pagina,
  })
  return error ? { ok: false, error: error.message || "No se pudo guardar la parada. Intenta de nuevo." } : { ok: true }
}

export interface DatosCompletarParada {
  /** Minutos que duró. Se ignora si vienen inicio y fin. */
  minutos: number | null
  inicio: string | null
  fin: string | null
  /** Solo para "Falla sin especificar" o "Parada por clasificar": el tipo real. */
  tipoCodigo: string | null
  /** Obligatoria si es Programada y pasó su tiempo guía. */
  justificacion: string | null
}

/** Pone cuánto duró una parada pendiente (y su tipo real, si hacía falta). */
export async function completarParada(usuario: string, paradaId: string, datos: DatosCompletarParada, pagina: string): Promise<Resultado> {
  const { error } = await supabase.rpc("completar_parada", {
    p_usuario: usuario,
    p_parada_id: paradaId,
    p_minutos: datos.minutos,
    p_inicio: datos.inicio,
    p_fin: datos.fin,
    p_tipo_codigo: datos.tipoCodigo,
    p_justificacion: datos.justificacion,
    p_pagina: pagina,
  })
  return error ? { ok: false, error: error.message || "No se pudo completar la parada. Intenta de nuevo." } : { ok: true }
}

/** Elimina cualquier parada cargada por error (queda en Auditoría). */
export async function eliminarParada(usuario: string, paradaId: string, pagina: string): Promise<Resultado> {
  const { error } = await supabase.rpc("eliminar_parada", { p_usuario: usuario, p_parada_id: paradaId, p_pagina: pagina })
  return error ? { ok: false, error: error.message || "No se pudo eliminar la parada. Intenta de nuevo." } : { ok: true }
}

/** Tipos que se completan eligiendo otro tipo: cuál filtro de catálogo ofrecer, o null si no hace falta. */
export function tipoACompletar(tipoCodigo: string | null): "EQUIPO" | "TODOS" | null {
  if (tipoCodigo === TIPO_FALLA_SIN_ESPECIFICAR) return "EQUIPO"
  if (tipoCodigo === TIPO_POR_CLASIFICAR) return "TODOS"
  return null
}

/*
 * Verificación de las fórmulas de Reportes con datos reales.
 *
 * Las fórmulas viven en src/lib/reportes/index.ts (+realidad*.ts +
 * teorico.ts). Acá NO se reimplementan: este módulo arma las porciones de
 * Preparación/Producción/Producto Terminado a partir de las filas de un
 * CSV y llama a esas MISMAS funciones. Sirve para dos cosas:
 *
 *   1. desglosarCalculosDesdeCsv(): mostrar los números crudos detrás de
 *      cada merma/meta en el Panel de Producción, solo cuando el turno es
 *      del Área de Pruebas.
 *   2. agruparCasos() + evaluarCaso(): el test src/lib/reportes/pruebas.test.ts
 *      lee el CSV, corre cada caso por estas funciones y lo compara
 *      contra los valores cargados a mano en las columnas esp_*.
 *
 * Extraído de src/lib/calculosPruebas.ts (Fase 1) — mismo comportamiento,
 * ahora arma 4 arreglos por separado (preparaciones, corridas, contadores,
 * productoTerminado) en vez de un TurnoActivo único, con los nombres
 * renombrados del plan (turnoLineaId → corridaId, volumenL* → los nombres
 * nuevos de PreparacionRegistro).
 *
 * El formato del CSV está documentado en
 * src/lib/__fixtures__/casos-calculo.csv (sin cambios).
 */
import type { LineaCodigo } from "@/lib/catalogos"
import type { PresentacionLive } from "@/lib/catalogosLive"
import type { Corrida, ContadorRegistro } from "@/lib/produccion/tipos"
import type { PreparacionRegistro } from "@/lib/preparacion/tipos"
import type { ProductoTerminadoRegistro } from "@/lib/productoTerminado"
import { desglosarCalculos, type DesgloseCalculos } from "./index"

/* ==================================================================
 * 1. CSV — una fila por corrida, agrupadas por caso
 * ================================================================== */

const COLUMNAS_CSV = [
  "caso",
  "turno_estado",
  "hora_inicio",
  "hora_fin",
  "tanque",
  "sabor",
  "lote",
  "litros_iniciales",
  "litros_finales",
  "lote_cerrado",
  "linea",
  "presentacion_ml",
  "envases_x_caja",
  "cajas_x_paleta",
  "velocidad_envases_hora",
  "corrida_activa",
  "contador_envases",
  "pt_paletas",
  "pt_cajas_sueltas",
  "pt_litros",
  "esp_merma_envase_corrida_pct",
  "esp_merma_envase_turno_pct",
  "esp_rendimiento_turno_pct",
  "esp_cajas_esperadas",
  "esp_cajas_reales",
  "esp_cumplimiento_turno_pct",
] as const

export interface FilaCaso {
  caso: string
  turnoEstado: string
  horaInicio: string
  horaFin: string
  tanque: string
  sabor: string
  lote: string
  litrosIniciales: number | null
  litrosFinales: number | null
  loteCerrado: boolean
  linea: string
  presentacionMl: number
  envasesXCaja: number
  cajasXPaleta: number
  velocidadEnvasesHora: number
  corridaActiva: boolean
  contadorEnvases: number
  ptPaletas: number
  ptCajasSueltas: number
  ptLitros: number
  espMermaEnvaseCorridaPct: number | null
  espMermaEnvaseTurnoPct: number | null
  espRendimientoTurnoPct: number | null
  espCajasEsperadas: number | null
  espCajasReales: number | null
  espCumplimientoTurnoPct: number | null
}

export interface CasoPrueba {
  nombre: string
  turnoId: string
  horaInicio: string
  estado: "ABIERTO" | "CERRADO"
  horaFin: string | null
  preparaciones: PreparacionRegistro[]
  corridas: Corrida[]
  contadores: ContadorRegistro[]
  productoTerminado: ProductoTerminadoRegistro[]
  presentaciones: PresentacionLive[]
  esperado: {
    mermaEnvaseTurnoPct: number | null
    rendimientoTurnoPct: number | null
    cumplimientoTurnoPct: number | null
    porCorrida: Array<{
      corridaId: string
      mermaEnvasePct: number | null
      cajasEsperadas: number | null
      cajasReales: number | null
    }>
  }
}

export interface ResultadoCaso {
  nombre: string
  desglose: DesgloseCalculos
  esperado: CasoPrueba["esperado"]
}

function parseCsv(texto: string): Array<Record<string, string>> {
  const lineas = texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"))
  if (lineas.length < 2) return []

  const encabezado = lineas[0].split(",").map((h) => h.trim())
  const faltantes = COLUMNAS_CSV.filter((c) => !encabezado.includes(c))
  if (faltantes.length > 0) {
    throw new Error(`El CSV no tiene estas columnas: ${faltantes.join(", ")}`)
  }

  return lineas.slice(1).map((linea) => {
    const celdas = linea.split(",").map((c) => c.trim())
    const fila: Record<string, string> = {}
    encabezado.forEach((h, i) => (fila[h] = celdas[i] ?? ""))
    return fila
  })
}

function num(v: string): number {
  const n = Number(v.trim())
  if (!Number.isFinite(n)) throw new Error(`valor numérico inválido: "${v}"`)
  return n
}
function numOpt(v: string): number | null {
  return v.trim() === "" ? null : num(v)
}
function bool(v: string): boolean {
  const s = v.trim().toLowerCase()
  return s === "si" || s === "sí" || s === "true" || s === "1" || s === "x"
}

export function filasCasoDe(texto: string): FilaCaso[] {
  return parseCsv(texto).map((r, i) => {
    try {
      return {
        caso: r.caso.trim(),
        turnoEstado: r.turno_estado.trim(),
        horaInicio: r.hora_inicio.trim(),
        horaFin: r.hora_fin.trim(),
        tanque: r.tanque.trim(),
        sabor: r.sabor.trim(),
        lote: r.lote.trim(),
        litrosIniciales: numOpt(r.litros_iniciales),
        litrosFinales: numOpt(r.litros_finales),
        loteCerrado: bool(r.lote_cerrado),
        linea: r.linea.trim(),
        presentacionMl: num(r.presentacion_ml),
        envasesXCaja: num(r.envases_x_caja),
        cajasXPaleta: num(r.cajas_x_paleta),
        velocidadEnvasesHora: num(r.velocidad_envases_hora),
        corridaActiva: bool(r.corrida_activa),
        contadorEnvases: num(r.contador_envases),
        ptPaletas: num(r.pt_paletas),
        ptCajasSueltas: num(r.pt_cajas_sueltas),
        ptLitros: num(r.pt_litros),
        espMermaEnvaseCorridaPct: numOpt(r.esp_merma_envase_corrida_pct),
        espMermaEnvaseTurnoPct: numOpt(r.esp_merma_envase_turno_pct),
        espRendimientoTurnoPct: numOpt(r.esp_rendimiento_turno_pct),
        espCajasEsperadas: numOpt(r.esp_cajas_esperadas),
        espCajasReales: numOpt(r.esp_cajas_reales),
        espCumplimientoTurnoPct: numOpt(r.esp_cumplimiento_turno_pct),
      }
    } catch (e) {
      throw new Error(`Fila ${i + 1} del CSV (${r.caso}): ${(e as Error).message}`)
    }
  })
}

function normalizarHora(h: string): string {
  const partes = h.trim().split(":")
  while (partes.length < 3) partes.push("00")
  return partes
    .slice(0, 3)
    .map((p) => p.padStart(2, "0"))
    .join(":")
}

function primerNoNulo(filas: FilaCaso[], get: (f: FilaCaso) => number | null): number | null {
  for (const f of filas) {
    const v = get(f)
    if (v !== null) return v
  }
  return null
}

function construirCaso(nombre: string, filas: FilaCaso[]): CasoPrueba {
  const primera = filas[0]

  const presentacionesMap = new Map<string, PresentacionLive>()
  const preparacionesMap = new Map<string, PreparacionRegistro>()
  const corridas: Corrida[] = []
  const contadores: ContadorRegistro[] = []
  const productoTerminado: ProductoTerminadoRegistro[] = []

  filas.forEach((f, i) => {
    const corridaId = `${nombre}::corrida-${i + 1}`
    const presCodigo = String(f.presentacionMl)
    const loteId = f.lote ? `${nombre}::lote-${f.lote}` : null
    const lineaCod = f.linea as LineaCodigo

    if (!presentacionesMap.has(presCodigo)) {
      presentacionesMap.set(presCodigo, {
        id: presCodigo,
        codigo: presCodigo,
        nombre: `${f.presentacionMl} ml`,
        volumenMl: f.presentacionMl,
        cajasXCamada: 0,
        cantCamada: 0,
        cajasXPaleta: f.cajasXPaleta,
        litrosXCaja: 0,
        envasesXCaja: f.envasesXCaja,
        activo: true,
      })
    }

    if (loteId && !preparacionesMap.has(loteId)) {
      preparacionesMap.set(loteId, {
        id: loteId,
        // El CSV modela un turno completo; sus lotes nacen en ese turno.
        turnoId: nombre,
        numeroTanque: (Number(f.tanque) || 1) as 1 | 2 | 3,
        saborId: null,
        saborNombre: f.sabor || null,
        lote: f.lote || null,
        volumenActualL: f.litrosFinales,
        volumenPreparadoL: f.litrosIniciales,
        // Nació en este turno → su inicio es el volumen inicial preparado.
        volumenAlIniciarTurnoL: f.litrosIniciales,
        tambores: 0,
        agua: null,
        azucar: null,
        acidoCitrico: null,
        creadoEn: "",
        liberadoEn: "",
        cerradoEn: f.loteCerrado ? "2026-01-01T12:00:00Z" : null,
      })
    }

    corridas.push({
      id: corridaId,
      linea: lineaCod,
      presentacion: presCodigo,
      envasesHora: f.velocidadEnvasesHora,
      saborId: null,
      saborNombre: f.sabor || null,
      lote: f.lote || null,
      loteId,
      activa: f.corridaActiva,
      activadaEn: "",
      pausadaEn: null,
      loteTerminado: null,
      finalizadaEn: null,
      esperandoCierre: false,
      entregadaEn: null,
      confirmadoInicioEn: null,
    })

    contadores.push({
      id: `${corridaId}::contador`,
      linea: lineaCod,
      corridaId,
      envasesLlenadora: f.contadorEnvases,
      envasesBuenos: null,
      justificacion: "",
      parcial: false,
      creadoEn: "",
    })

    productoTerminado.push({
      id: `${corridaId}::pt`,
      linea: lineaCod,
      corridaId,
      saborId: null,
      saborNombre: f.sabor || null,
      presentacion: presCodigo,
      paletas: f.ptPaletas,
      cajasSueltas: f.ptCajasSueltas,
      litrosProducidos: f.ptLitros,
      tieneParciales: false,
      parciales: [],
      creadoEn: "",
      registradoPorNombre: null,
    })
  })

  return {
    nombre,
    turnoId: nombre,
    horaInicio: normalizarHora(primera.horaInicio),
    estado: primera.turnoEstado.toUpperCase() === "ABIERTO" ? "ABIERTO" : "CERRADO",
    horaFin: primera.horaFin ? normalizarHora(primera.horaFin) : null,
    preparaciones: [...preparacionesMap.values()],
    corridas,
    contadores,
    productoTerminado,
    presentaciones: [...presentacionesMap.values()],
    esperado: {
      mermaEnvaseTurnoPct: primerNoNulo(filas, (f) => f.espMermaEnvaseTurnoPct),
      rendimientoTurnoPct: primerNoNulo(filas, (f) => f.espRendimientoTurnoPct),
      cumplimientoTurnoPct: primerNoNulo(filas, (f) => f.espCumplimientoTurnoPct),
      porCorrida: filas.map((f, i) => ({
        corridaId: `${nombre}::corrida-${i + 1}`,
        mermaEnvasePct: f.espMermaEnvaseCorridaPct,
        cajasEsperadas: f.espCajasEsperadas,
        cajasReales: f.espCajasReales,
      })),
    },
  }
}

/** Agrupa las filas del CSV por su columna `caso`, respetando el orden de aparición. */
export function agruparCasos(filas: FilaCaso[]): CasoPrueba[] {
  const orden: string[] = []
  const porNombre = new Map<string, FilaCaso[]>()
  for (const f of filas) {
    let bucket = porNombre.get(f.caso)
    if (!bucket) {
      bucket = []
      porNombre.set(f.caso, bucket)
      orden.push(f.caso)
    }
    bucket.push(f)
  }
  return orden.map((nombre) => construirCaso(nombre, porNombre.get(nombre) as FilaCaso[]))
}

/** Corre un caso por las fórmulas reales de reportes/index.ts y lo deja listo para comparar contra sus columnas esp_*. */
export function evaluarCaso(caso: CasoPrueba): ResultadoCaso {
  return {
    nombre: caso.nombre,
    desglose: desglosarCalculos(
      caso.turnoId,
      caso.horaInicio,
      caso.estado,
      caso.horaFin,
      caso.preparaciones,
      caso.corridas,
      caso.productoTerminado,
      caso.contadores,
      caso.presentaciones,
    ),
    esperado: caso.esperado,
  }
}

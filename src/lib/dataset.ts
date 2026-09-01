/*
 * Dataset de producción para análisis / modelo predictivo.
 *
 * Grano: UNA fila por corrida (= un registro de Producto Terminado),
 * igual que estadisticas_produccion (ver src/lib/estadisticas.ts). Se
 * arma en el navegador desde las FilaEstadistica que ya trae "Resumen
 * de Planta" en el Panel, más un mapa sabor -> familia.
 *
 * El CSV se regenera entero en cada exportación con el rango de fechas
 * elegido: no se "acumula" un archivo en el servidor, pero como cubre
 * todo el histórico pedido, sirve como dataset siempre actualizado.
 *
 * Columnas que HOY salen vacías, y qué falta para llenarlas:
 *   - cant_paradas: el catálogo de paradas todavía no existe
 *     (ver resumen-diseno-dashboard-natulac.md).
 *   - litros_consumidos_tanque y merma_semielaborado_pct: necesitan
 *     volumen_inicial_l y volumen_l del lote (preparaciones), que
 *     estadisticas_produccion no devuelve. Se llenan cuando ese RPC
 *     exponga esos dos campos (una migración de Supabase).
 *
 * litros_envasados = envases_llenadora × presentacion_ml ÷ 1000 — los
 * litros que pasaron por la llenadora. NO es lo mismo que
 * litros_consumidos_tanque (que incluiría lo que salió del tanque y no
 * llegó a envasarse); por eso van en columnas separadas.
 */
import {
  envasesReales,
  horasTurno,
  litrosConsumidos,
  mermaPct,
  type FilaEstadistica,
} from "@/lib/estadisticas"

/** Orden y nombres de las columnas del dataset. La fuente de verdad del formato. */
export const COLUMNAS_DATASET = [
  "fecha_jornada",
  "fecha_fin",
  "anio",
  "mes",
  "dia_semana",
  "turno_codigo",
  "turno_tipo",
  "grupo",
  "area",
  "supervisor",
  "supervisor_usuario",
  "estado",
  "hora_inicio",
  "hora_fin",
  "tiempo_produccion_h",
  "cant_paradas",
  "linea",
  "sabor",
  "familia",
  "presentacion_ml",
  "paletas",
  "cajas_sueltas",
  "cajas",
  "envases_llenadora",
  "envases_producto_terminado",
  "litros_producidos",
  "litros_envasados",
  "litros_consumidos_tanque",
  "merma_envase_pct",
  "merma_semielaborado_pct",
] as const

export type ColumnaDataset = (typeof COLUMNAS_DATASET)[number]

/** Número a texto plano (decimales con punto), o "" si no hay dato. */
function num(v: number | null | undefined, decimales = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return ""
  const factor = 10 ** decimales
  return (Math.round(v * factor) / factor).toString()
}

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"]

/** "YYYY-MM-DD" + N días, en UTC para no arrastrar zona horaria. */
function fechaMasDias(fechaISO: string, dias: number): string {
  const [y, m, d] = fechaISO.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + dias)
  return dt.toISOString().slice(0, 10)
}

/** El turno cruzó medianoche (Turno 3, 22:30 → 07:00): la hora de fin es menor que la de inicio. */
function cruzaMedianoche(horaInicio: string, horaFin: string): boolean {
  const [h1, m1] = horaInicio.split(":").map(Number)
  const [h2, m2] = horaFin.split(":").map(Number)
  return h2 * 60 + m2 < h1 * 60 + m1
}

function diaSemana(fechaISO: string): string {
  const [y, m, d] = fechaISO.split("-").map(Number)
  return DIAS_SEMANA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}

/** Escapa una celda para CSV solo si hace falta (coma, comilla o salto de línea). */
function celda(valor: string): string {
  return /[",\r\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor
}

/** Una fila del dataset a partir de una FilaEstadistica (+ familia del sabor si se conoce). */
export function filaDataset(
  f: FilaEstadistica,
  familiaPorSabor?: Map<string, string>,
): Record<ColumnaDataset, string> {
  const cajas = f.paletas * f.cajasXPaleta + f.cajasSueltas
  const [anio, mes] = f.fecha.split("-")
  return {
    fecha_jornada: f.fecha,
    fecha_fin: f.horaFin ? fechaMasDias(f.fecha, cruzaMedianoche(f.horaInicio, f.horaFin) ? 1 : 0) : "",
    anio,
    mes,
    dia_semana: diaSemana(f.fecha),
    turno_codigo: f.turnoCodigo,
    turno_tipo: f.turnoTipo,
    grupo: f.grupo,
    area: f.area,
    supervisor: f.supervisorNombre,
    supervisor_usuario: f.supervisorUsuario,
    estado: f.estado,
    hora_inicio: f.horaInicio,
    hora_fin: f.horaFin ?? "",
    tiempo_produccion_h: num(horasTurno(f)),
    cant_paradas: "",
    linea: f.linea,
    sabor: f.saborNombre ?? "",
    familia: (f.saborNombre && familiaPorSabor?.get(f.saborNombre)) || "",
    presentacion_ml: num(f.volumenMl, 0),
    paletas: num(f.paletas, 0),
    cajas_sueltas: num(f.cajasSueltas, 0),
    cajas: num(cajas, 0),
    envases_llenadora: num(f.envasesLlenadora, 0),
    envases_producto_terminado: num(envasesReales(f), 0),
    litros_producidos: num(f.litrosProducidos),
    litros_envasados: num(litrosConsumidos(f)),
    litros_consumidos_tanque: "",
    merma_envase_pct: num(mermaPct(f)),
    merma_semielaborado_pct: "",
  }
}

/** CSV completo con encabezado. Separador coma, saltos CRLF, decimales con punto. */
export function datasetACsv(filas: FilaEstadistica[], familiaPorSabor?: Map<string, string>): string {
  const lineas: string[] = [COLUMNAS_DATASET.join(",")]
  for (const f of filas) {
    const fila = filaDataset(f, familiaPorSabor)
    lineas.push(COLUMNAS_DATASET.map((c) => celda(fila[c])).join(","))
  }
  return lineas.join("\r\n")
}

/** Dispara la descarga del CSV en el navegador (BOM para que Excel respete los acentos). */
export function descargarCsv(nombreArchivo: string, contenido: string): void {
  const blob = new Blob(["﻿", contenido], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = nombreArchivo
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

import { supabase } from "@/lib/supabase"
import type { PresentacionLive, VelocidadLive } from "@/lib/catalogosLive"
import { eficienciaDelTurno, oeeDePeriodo, type OeePeriodo, type ResultadoEficiencia } from "@/lib/eficiencia"
import { listarParadas } from "@/lib/paradas"
import { mapearContador, mapearCorrida } from "@/lib/produccion/mapear"
import type { FilaContador, FilaCorrida } from "@/lib/produccion/tipos"
import { horasTranscurridasTurno } from "@/lib/reportes"
import { restarDias } from "@/lib/tiempoPlanta"

/*
 * OEE de cada línea en un PERÍODO (Ayer / 7 días / Este mes) para el Panel
 * de Paradas. Mismo cálculo que el Panel de Producción y el Acta
 * (eficienciaDelTurno, src/lib/eficiencia.ts), turno por turno, y después
 * se juntan con oeeDePeriodo(). Por cada día × tipo de turno se piden
 * turnos_de_fecha_tipo (todos: en 12x12 hay dos T2, migración 20261106; ya
 * traen corridas y contadores, es turno_json) y, si el turno existe, sus paradas con listar_paradas
 * filtrando por turno — igual que el Panel de Producción, así las de
 * Mantenimiento vienen recortadas a la ventana del turno. "Este mes" son
 * hasta ~120 consultas: se hacen de a CONSULTAS_A_LA_VEZ.
 */

const TIPOS_TURNO = ["TURNO_1", "TURNO_2", "TURNO_3", "12X12"] as const
const CONSULTAS_A_LA_VEZ = 8

interface FilaTurnoOee {
  id: string
  fecha: string
  hora_inicio: string
  hora_fin: string | null
  estado: "ABIERTO" | "CERRADO"
  turno_tipo_codigo: string
  esquema?: string
  lineas: FilaCorrida[]
  contadores: FilaContador[]
}

export interface FiltroOeePeriodo {
  desde: string // 'YYYY-MM-DD'
  hasta: string
  /** Un tipo puntual, o "TODOS" (incluye el 12x12). */
  turnoTipo: string
  /** Mismo criterio que turno_de_fecha_tipo: 'ASEPTICO' / 'PRUEBAS', o null = producción (nunca Pruebas). */
  area: string | null
  /** Códigos de línea del catálogo del área (LINEA_1… o LINEA_T1…). */
  lineas: string[]
  presentaciones: PresentacionLive[]
  velocidades: VelocidadLive[]
}

/** "LINEA_T2" / "LINEA_2" → "LINEA_2": la clave de las 3 líneas del Panel de Paradas (LINEAS_PARADAS). */
const lineaGenerica = (codigo: string) => `LINEA_${codigo.replace(/^LINEA_T?/, "")}`

/** Corre `tareas` de a `n` a la vez, manteniendo el orden de los resultados. */
async function enTandas<T>(tareas: (() => Promise<T>)[], n: number): Promise<T[]> {
  const resultados: T[] = new Array(tareas.length)
  let siguiente = 0
  async function trabajador() {
    while (siguiente < tareas.length) {
      const i = siguiente++
      resultados[i] = await tareas[i]()
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, tareas.length) }, trabajador))
  return resultados
}

async function turnosDe(fecha: string, turnoTipo: string, area: string | null): Promise<FilaTurnoOee[]> {
  const params = { p_fecha: fecha, p_turno_tipo: turnoTipo, p_area_codigo: area }
  const { data, error } = await supabase.rpc("turnos_de_fecha_tipo", params)
  if (!error && Array.isArray(data)) return data as FilaTurnoOee[]
  // Sin la migración 20261106 todavía: uno solo.
  const uno = await supabase.rpc("turno_de_fecha_tipo", params)
  return uno.error || !uno.data ? [] : [uno.data as FilaTurnoOee]
}

/** OEE por línea (clave LINEA_1/2/3) del período. Una línea sin producción en el período no aparece. */
export async function cargarOeePeriodo(f: FiltroOeePeriodo): Promise<Map<string, OeePeriodo>> {
  const dias: string[] = []
  for (let d = f.desde; d <= f.hasta; d = restarDias(d, -1)) dias.push(d)
  const tipos = f.turnoTipo === "TODOS" ? TIPOS_TURNO : [f.turnoTipo]

  const busquedas = dias.flatMap((dia) => tipos.map((tipo) => () => turnosDe(dia, tipo, f.area)))
  const encontrados = (await enTandas(busquedas, CONSULTAS_A_LA_VEZ)).flat()
  const turnos = [...new Map(encontrados.map((t) => [t.id, t])).values()]

  const ahora = new Date()
  const porTurno = await enTandas(
    turnos.map((t) => async () => {
      const paradas = await listarParadas({ desde: t.fecha, hasta: t.fecha, turnoId: t.id })
      return eficienciaDelTurno({
        turnoTipo: t.turno_tipo_codigo,
        esquema: t.esquema,
        horaInicio: t.hora_inicio,
        estado: t.estado,
        horasTranscurridas: horasTranscurridasTurno(t.hora_inicio, t.estado, t.hora_fin),
        corridas: t.lineas.map(mapearCorrida),
        contadores: t.contadores.map(mapearContador),
        presentaciones: f.presentaciones,
        velocidades: f.velocidades,
        paradas,
        lineas: f.lineas,
        ahora,
      })
    }),
    CONSULTAS_A_LA_VEZ,
  )

  const porLinea = new Map<string, ResultadoEficiencia[]>()
  for (const ef of porTurno) {
    for (const [codigo, r] of ef.porLinea) {
      const clave = lineaGenerica(codigo)
      porLinea.set(clave, [...(porLinea.get(clave) ?? []), r])
    }
  }
  return new Map([...porLinea].map(([clave, resultados]) => [clave, oeeDePeriodo(resultados)]))
}

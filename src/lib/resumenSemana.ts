import type { PresentacionLive } from "@/lib/catalogosLive"
import type { Parada } from "@/lib/paradas"
import {
  cargarResumenDia,
  cargarValidacionesTurno,
  itemsDelDia,
  itemsDelDiaConTurnos,
  type ItemDia,
} from "@/lib/resumenDia"
import {
  cajasPorGrupo,
  cargarResumenDiario,
  conCajasDe,
  lineasDelDia,
  paradasQueMasQuitaron,
  repartirCorrecciones,
  type FilaCajasDia,
  type FilaPorTurno,
  type GrupoDelDia,
  type LineaDelDia,
  type ParadaDelDia,
  type TurnoDelDia,
} from "@/lib/resumenDiario"
import { restarDias } from "@/lib/tiempoPlanta"

/*
 * Resumen Diario, vista Semana (Alexander, 2026-11-17): lunes a domingo, por
 * jornada (7:00 a 7:00, turnos.fecha), sin actas, novedades ni mensaje de
 * WhatsApp. Cada día se arma con las MISMAS funciones del día (correcciones
 * de la analista incluidas) y luego se suma: así la semana da lo mismo que
 * la suma de los días. Ver src/lib/resumenDiario.ts.
 */

export const DIAS_CORTOS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const

/** Lunes (YYYY-MM-DD) de la semana de esa jornada. */
export function lunesDeSemana(fecha: string): string {
  const [a, m, d] = fecha.split("-").map(Number)
  const diaSemana = new Date(Date.UTC(a, m - 1, d)).getUTCDay() // 0 = domingo
  return restarDias(fecha, (diaSemana + 6) % 7)
}

/** Los 7 días de la semana que empieza ese lunes. */
export const diasDeSemana = (lunes: string): string[] => DIAS_CORTOS.map((_, i) => restarDias(lunes, -i))

/** "10/11 – 16/11" */
export function textoSemana(lunes: string): string {
  const dm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`
  return `${dm(lunes)} – ${dm(restarDias(lunes, -6))}`
}

/** Un día ya armado como en la vista Día. */
export interface DiaDeSemana {
  fecha: string
  etiqueta: (typeof DIAS_CORTOS)[number]
  /** Los turnos del día con sus cajas corregidas; la etiqueta lleva el día ("Lun T1"). */
  turnos: TurnoDelDia[]
  /** Cajas por turno, sabor y línea, ya con las correcciones de la analista. */
  porTurno: FilaPorTurno[]
  items: ItemDia[]
  paradas: Parada[]
  nitrogenoConsumo: number | null
}

/** Un día de la semana en la tabla «Días de la semana». */
export interface ResumenDeDia {
  fecha: string
  etiqueta: string
  cajas: number
  /** Ítems del día sin validar por la analista (PENDIENTE). */
  sinValidar: number
  /** Ítems del día (sabor + presentación) con producción. */
  items: number
  nitrogenoConsumo: number | null
  /** Día que todavía no llegó: no se pidió. */
  futuro: boolean
}

export interface DatosSemana {
  lunes: string
  dias: DiaDeSemana[]
  /** Días que no se pudieron cargar (con su error). */
  errores: string[]
}

/** Carga cada día de la semana hasta `hoy` (los futuros quedan vacíos) con las funciones del día. */
export async function cargarResumenSemana(usuario: string, area: string, lunes: string, hoy: string): Promise<DatosSemana> {
  const fechas = diasDeSemana(lunes)
  const errores: string[] = []
  const dias = await Promise.all(
    fechas.map(async (fecha, i): Promise<DiaDeSemana> => {
      const etiqueta = DIAS_CORTOS[i]
      const vacio: DiaDeSemana = { fecha, etiqueta, turnos: [], porTurno: [], items: [], paradas: [], nitrogenoConsumo: null }
      if (fecha > hoy) return vacio
      const [dia, diario, valTurno] = await Promise.all([
        cargarResumenDia(usuario, area, fecha),
        cargarResumenDiario(usuario, area, fecha),
        cargarValidacionesTurno(usuario, area, fecha),
      ])
      if ("error" in dia || "error" in diario) {
        errores.push(`${etiqueta} ${fecha.slice(8, 10)}: ${"error" in dia ? dia.error : "error" in diario ? diario.error : ""}`)
        return vacio
      }
      // Igual que la vista Día (ResumenDia.tsx): el día sale de los turnos con sus correcciones.
      const conTurnos = "error" in valTurno ? null : itemsDelDiaConTurnos(diario.porTurno, valTurno, dia.validaciones)
      const items = conTurnos?.dia ?? itemsDelDia(dia.filas, dia.validaciones)
      const porTurno = repartirCorrecciones(diario.porTurno, conTurnos?.turnos ?? [])
      const turnos = conCajasDe(diario.turnos, porTurno).map((t) => ({ ...t, etiqueta: `${etiqueta} ${t.etiqueta}` }))
      return { fecha, etiqueta, turnos, porTurno, items, paradas: diario.paradas, nitrogenoConsumo: diario.nitrogenoConsumo }
    }),
  )
  return { lunes, dias, errores }
}

/** Cajas por sabor y presentación con una columna por día y el total de la semana (número oficial). */
export function cajasPorSaborYDia(dias: DiaDeSemana[]): FilaCajasDia[] {
  const m = new Map<string, FilaCajasDia>()
  dias.forEach((d, i) => {
    for (const it of d.items) {
      const clave = `${it.saborNombre}|${it.volumenMl}`
      const fila = m.get(clave) ?? {
        saborNombre: it.saborNombre,
        volumenMl: it.volumenMl,
        porTurno: dias.map(() => 0),
        oficial: 0,
        supervisores: 0,
        corregida: false,
      }
      fila.porTurno[i] += it.cajasOficiales
      fila.oficial += it.cajasOficiales
      fila.supervisores += it.cajasSupervisor
      fila.corregida ||= it.estado === "EDITADO" && it.cajasOficiales !== it.cajasSupervisor
      m.set(clave, fila)
    }
  })
  // Como el día: por sabor (alfabético) y de la presentación más grande a la más chica.
  return [...m.values()].sort((a, b) => a.saborNombre.localeCompare(b.saborNombre, "es") || b.volumenMl - a.volumenMl)
}

export const lineasDeSemana = (
  lineas: { codigo: string; nombre: string }[],
  dias: DiaDeSemana[],
  presentaciones: PresentacionLive[],
): LineaDelDia[] =>
  lineasDelDia(
    lineas,
    dias.flatMap((d) => d.turnos),
    dias.flatMap((d) => d.porTurno),
    dias.flatMap((d) => d.paradas),
    presentaciones,
  )

export const paradasDeSemana = (dias: DiaDeSemana[]): ParadaDelDia[] => paradasQueMasQuitaron(dias.flatMap((d) => d.paradas), 8)

export const gruposDeSemana = (dias: DiaDeSemana[]): GrupoDelDia[] => cajasPorGrupo(dias.flatMap((d) => d.turnos))

/** Una fila por día: cajas oficiales, cuántos ítems faltan validar y el nitrógeno consumido. */
export function resumenPorDia(dias: DiaDeSemana[], hoy: string): ResumenDeDia[] {
  return dias.map((d) => ({
    fecha: d.fecha,
    etiqueta: `${d.etiqueta} ${d.fecha.slice(8, 10)}/${d.fecha.slice(5, 7)}`,
    cajas: d.items.reduce((a, i) => a + i.cajasOficiales, 0),
    sinValidar: d.items.filter((i) => i.estado === "PENDIENTE").length,
    items: d.items.length,
    nitrogenoConsumo: d.nitrogenoConsumo,
    futuro: d.fecha > hoy,
  }))
}

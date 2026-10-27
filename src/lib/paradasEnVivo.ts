import { useEffect, useState } from "react"
import { duracionMin, esDeMantenimiento, esParadaLNPE, fmtDuracion, listarParadas, type Parada } from "@/lib/paradas"
import { aplicarParadasALineas } from "@/lib/produccion/ajustes"
import { actualizarDesdeSheet, SHEET_MANTENIMIENTO_ACTIVO, ultimaActualizacionSheet } from "@/lib/sheetMantenimiento"
import { fechaPlanta, restarDias } from "@/lib/tiempoPlanta"

/*
 * PARADA EN VIVO — qué muestra la cinta de una línea en los paneles
 * (Panel de Paradas y Panel de Producción). Dueña, 2026-10-12:
 *
 *   * Una línea se ve parada si tiene una parada ABIERTA (sin fin): la de
 *     Líneas ("Parada", corrida pausada), una abierta desde el Modo Paradas
 *     o una en curso de Mantenimiento. Desde la migración 20261111590000
 *     esas últimas también pausan la corrida a los 15 min (lo aplica la
 *     base; cargar() le da el empujón cada minuto).
 *   * Margen de 15 min: las paradas Operacionales cortas (4-5 min) no se
 *     muestran, y el supervisor tiene ese tiempo para registrarla. Antes de
 *     los 15 min la cinta sigue corriendo con un aviso chico; después, la
 *     escena de parada. La de Mantenimiento abierta no espera el margen: es
 *     deliberada (rework de paradas, 2026-10-26).
 *   * Mantenimiento manda: si tiene una abierta en la línea (Responsable
 *     Mantenimiento), se muestra esa (son las que más duran).
 *   * Los minutos de la cinta cuentan desde el inicio del turno en curso;
 *     el margen mira lo que lleva abierta en total.
 *   * Lo que se carga tarde, ya con inicio y fin, es historia: cuenta en los
 *     reportes, no en la cinta.
 */

/** Minutos que una parada abierta tiene que durar para que la cinta salga parada. */
export const MARGEN_PARADA_MIN = 15

/** Cada cuánto se vuelven a leer las paradas abiertas. */
const REFRESCO_MS = 60 * 1000
/** Cada cuánto, como mucho, se trae el Sheet de Mantenimiento solo. */
const SYNC_SHEET_MS = 5 * 60 * 1000
/** Días hacia atrás donde buscar paradas abiertas (una puede durar semanas: una línea programada que no puede arrancar; el tope al abrirla es 30 días). */
const DIAS_ATRAS = 30

export interface ParadaEnVivo {
  minutos: number
  /** Viene de Mantenimiento (su Sheet o su pantalla), no del supervisor. */
  deMantenimiento: boolean
  /** Nombre del tipo, si es una parada registrada (null = la pausa de Líneas). */
  tipoNombre: string | null
  /** Ya pasó el margen: la cinta se muestra parada. */
  visible: boolean
  /** Línea No Programada (LNPE): la línea no estaba planificada; se muestra con su descripción. */
  lineaNoProgramada: boolean
  /** Descripción que escribió quien la registró. */
  nota: string | null
}

/**
 * Si la parada sigue en curso: sin fin, o una LNPE cargada hasta el final del
 * turno, que todavía no terminó (dueña, 2026-10-14).
 */
export const sigueEnVivo = (p: Parada, ahora: Date) =>
  p.fin === null || (esParadaLNPE(p) && new Date(p.inicio) <= ahora && new Date(p.fin) > ahora)

/** "LINEA_T2" (Pruebas) y "LINEA_2" (Aséptico, paradas) son la misma línea física: se comparan por número. */
const numeroLinea = (codigo: string) => codigo.replace(/^LINEA_T?/, "")

/**
 * La parada en curso de una línea, o null si no hay. `pausadaEn` es la
 * corrida pausada desde Líneas. Con varias abiertas: primero la de
 * Mantenimiento; entre iguales, la que lleva más tiempo.
 */
export function paradaEnVivo(
  lineaCodigo: string,
  abiertas: Parada[],
  pausadaEn: string | null,
  ahora: Date,
  desdeTurno: Date | null = null,
): ParadaEnVivo | null {
  const n = numeroLinea(lineaCodigo)
  // Los minutos que se muestran son los del turno en curso (el total va en el reporte); el margen mira lo que lleva abierta.
  const minutosDelTurno = (inicio: string) =>
    Math.max(0, Math.round((ahora.getTime() - Math.max(new Date(inicio).getTime(), desdeTurno?.getTime() ?? 0)) / 60000))
  const candidatas: ParadaEnVivo[] = abiertas
    .filter((p) => sigueEnVivo(p, ahora) && numeroLinea(p.lineaCodigo) === n)
    .map((p) => {
      const total = duracionMin(p, ahora)
      const minutos = minutosDelTurno(p.inicio)
      const lnp = esParadaLNPE(p)
      const mtto = esDeMantenimiento(p) && !lnp
      // La LNPE se ve de entrada: no es una falla que haya que darle tiempo al supervisor para registrar.
      // La de Mantenimiento tampoco espera: es deliberada (la abrió Mantenimiento con la línea corriendo).
      return {
        minutos,
        deMantenimiento: mtto,
        tipoNombre: p.tipoNombre,
        visible: lnp || mtto || total >= MARGEN_PARADA_MIN,
        lineaNoProgramada: lnp,
        nota: p.nota,
      }
    })
  if (pausadaEn) {
    const total = Math.max(0, Math.round((ahora.getTime() - new Date(pausadaEn).getTime()) / 60000))
    const minutos = minutosDelTurno(pausadaEn)
    candidatas.push({ minutos, deMantenimiento: false, tipoNombre: null, visible: total >= MARGEN_PARADA_MIN, lineaNoProgramada: false, nota: null })
  }
  if (candidatas.length === 0) return null
  // La LNPE explica por qué la línea no produce: va primero.
  return candidatas.sort(
    (a, b) => Number(b.lineaNoProgramada) - Number(a.lineaNoProgramada) || Number(b.deMantenimiento) - Number(a.deMantenimiento) || b.minutos - a.minutos,
  )[0]
}

/** Texto corto para la cinta: "Línea no programada · Feriado", "Mantenimiento · 42 min", "Parada · 23 min" o "Parada hace 6 min". */
export function textoParadaEnVivo(p: ParadaEnVivo): string {
  if (p.lineaNoProgramada) return `Línea no programada · ${p.tipoNombre}`
  if (!p.visible) return `Parada hace ${p.minutos} min`
  return `${p.deMantenimiento ? "Mantenimiento" : "Parada"} · ${fmtDuracion(p.minutos)}`
}

let ultimoIntentoSync = 0

/**
 * Trae el Sheet de Mantenimiento si nadie lo hizo en los últimos 5 min (lo
 * mira en la base, así varias pantallas abiertas no lo piden a la vez). La
 * usan los paneles y Líneas (dueña, 2026-10-25: que entre solo). Sin conexión
 * o sin permiso no hace nada.
 */
export async function sincronizarSheetSiHaceFalta(usuario: string | null): Promise<boolean> {
  if (!SHEET_MANTENIMIENTO_ACTIVO || !usuario || Date.now() - ultimoIntentoSync < SYNC_SHEET_MS) return false
  ultimoIntentoSync = Date.now()
  try {
    const ultima = await ultimaActualizacionSheet()
    if (ultima && Date.now() - new Date(ultima).getTime() < SYNC_SHEET_MS) return false
    return (await actualizarDesdeSheet(usuario)).ok
  } catch {
    return false
  }
}

/**
 * Paradas abiertas del área, releídas cada minuto. Con `sincronizarComo`
 * (usuario con permiso para el Sheet), además trae el Sheet de
 * Mantenimiento cada 5 min si nadie lo hizo antes: así sus paradas en
 * curso llegan solas a los paneles.
 */
export function useParadasAbiertas(area: string | null, sincronizarComo: string | null, habilitado = true): Parada[] {
  const [abiertas, setAbiertas] = useState<Parada[]>([])

  useEffect(() => {
    if (!habilitado) return
    let vivo = true

    async function cargar() {
      await sincronizarSheetSiHaceFalta(sincronizarComo)
      // Las abiertas de 15 min o más ponen su línea en Parada (migración 20261111590000): los paneles quedan abiertos todo el día.
      await aplicarParadasALineas(area)
      const hoy = fechaPlanta()
      const paradas = await listarParadas({ desde: restarDias(hoy, DIAS_ATRAS), hasta: hoy, area })
      if (vivo) setAbiertas(paradas.filter((p) => sigueEnVivo(p, new Date())))
    }

    cargar()
    const id = setInterval(cargar, REFRESCO_MS)
    return () => {
      vivo = false
      clearInterval(id)
    }
  }, [area, sincronizarComo, habilitado])

  return habilitado ? abiertas : []
}

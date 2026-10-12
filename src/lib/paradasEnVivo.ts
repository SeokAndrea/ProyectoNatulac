import { useEffect, useState } from "react"
import { duracionMin, fmtDuracion, listarParadas, type Parada } from "@/lib/paradas"
import { actualizarDesdeSheet, ultimaActualizacionSheet } from "@/lib/sheetMantenimiento"
import { fechaPlanta, restarDias } from "@/lib/tiempoPlanta"

/*
 * PARADA EN VIVO — qué muestra la cinta de una línea en los paneles
 * (Panel de Paradas y Panel de Producción). Dueña, 2026-10-12:
 *
 *   * Una línea se ve parada si tiene una parada ABIERTA (sin fin): la de
 *     Líneas ("Parada", corrida pausada), una de Registrar Paradas con hora
 *     de inicio, o una en curso de Mantenimiento (su Sheet).
 *   * Margen de 15 min: las paradas cortas (4-5 min) no se muestran, y el
 *     supervisor tiene ese tiempo para registrarla. Antes de los 15 min la
 *     cinta sigue corriendo con un aviso chico; después, la escena de parada.
 *   * Mantenimiento manda: si tiene una abierta en la línea, se muestra esa
 *     (son las que más duran).
 *   * Lo que se carga tarde, ya con inicio y fin, es historia: cuenta en los
 *     reportes, no en la cinta.
 */

/** Minutos que una parada abierta tiene que durar para que la cinta salga parada. */
export const MARGEN_PARADA_MIN = 15

/** Cada cuánto se vuelven a leer las paradas abiertas. */
const REFRESCO_MS = 60 * 1000
/** Cada cuánto, como mucho, se trae el Sheet de Mantenimiento solo. */
const SYNC_SHEET_MS = 5 * 60 * 1000
/** Días hacia atrás donde buscar paradas abiertas (una de Mantenimiento puede durar más de un turno). */
const DIAS_ATRAS = 7

export interface ParadaEnVivo {
  minutos: number
  /** Viene de Mantenimiento (su Sheet o su pantalla), no del supervisor. */
  deMantenimiento: boolean
  /** Nombre del tipo, si es una parada registrada (null = la pausa de Líneas). */
  tipoNombre: string | null
  /** Ya pasó el margen: la cinta se muestra parada. */
  visible: boolean
}

/** "LINEA_T2" (Pruebas) y "LINEA_2" (Aséptico, paradas) son la misma línea física: se comparan por número. */
const numeroLinea = (codigo: string) => codigo.replace(/^LINEA_T?/, "")

/**
 * La parada en curso de una línea, o null si no hay. `pausadaEn` es la
 * corrida pausada desde Líneas. Con varias abiertas: primero la de
 * Mantenimiento; entre iguales, la que lleva más tiempo.
 */
export function paradaEnVivo(lineaCodigo: string, abiertas: Parada[], pausadaEn: string | null, ahora: Date): ParadaEnVivo | null {
  const n = numeroLinea(lineaCodigo)
  const candidatas: ParadaEnVivo[] = abiertas
    .filter((p) => p.fin === null && numeroLinea(p.lineaCodigo) === n)
    .map((p) => {
      const minutos = duracionMin(p, ahora)
      return { minutos, deMantenimiento: p.origen !== "MANUAL", tipoNombre: p.tipoNombre, visible: minutos >= MARGEN_PARADA_MIN }
    })
  if (pausadaEn) {
    const minutos = Math.max(0, Math.round((ahora.getTime() - new Date(pausadaEn).getTime()) / 60000))
    candidatas.push({ minutos, deMantenimiento: false, tipoNombre: null, visible: minutos >= MARGEN_PARADA_MIN })
  }
  if (candidatas.length === 0) return null
  return candidatas.sort((a, b) => Number(b.deMantenimiento) - Number(a.deMantenimiento) || b.minutos - a.minutos)[0]
}

/** Texto corto para la cinta: "Mantenimiento · 42 min", "Parada · 23 min" o "Parada hace 6 min". */
export function textoParadaEnVivo(p: ParadaEnVivo): string {
  if (!p.visible) return `Parada hace ${p.minutos} min`
  return `${p.deMantenimiento ? "Mantenimiento" : "Parada"} · ${fmtDuracion(p.minutos)}`
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
    let ultimoIntentoSync = 0

    async function sincronizarSiHaceFalta() {
      if (!sincronizarComo || Date.now() - ultimoIntentoSync < SYNC_SHEET_MS) return
      ultimoIntentoSync = Date.now()
      const ultima = await ultimaActualizacionSheet()
      if (ultima && Date.now() - new Date(ultima).getTime() < SYNC_SHEET_MS) return
      await actualizarDesdeSheet(sincronizarComo)
    }

    async function cargar() {
      await sincronizarSiHaceFalta()
      const hoy = fechaPlanta()
      const paradas = await listarParadas({ desde: restarDias(hoy, DIAS_ATRAS), hasta: hoy, area })
      if (vivo) setAbiertas(paradas.filter((p) => p.fin === null))
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

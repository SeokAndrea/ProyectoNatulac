import type { DatosActivarLinea, DatosCambiarLinea, DatosCipLinea, Resultado } from "@/lib/produccion/tipos"

/** Parar una línea eligiendo el tipo de parada del catálogo (la parada queda en curso). */
export interface DatosParar {
  tipoCodigo: string
  tipoNombre: string
  nota: string
  /** Si la línea paró antes de apretar el botón: cuántos minutos antes. 0 = ahora. */
  minutosAntes: number
}

/** Parada en curso que tiene en pausa a la línea: se muestra en la tarjeta y en el Panel de Paradas. */
export interface ParadaActualLinea {
  tipoNombre: string
  /** ISO. */
  inicio: string
  nota: string | null
}

/** Las mutaciones de Producción que usa la tarjeta de una línea (ver LineasEstadoPlanta, que las arma desde useProduccion). */
export interface AccionesLinea {
  activar: (datos: DatosActivarLinea) => Promise<Resultado>
  pausar: (corridaId: string, motivo?: string) => Promise<Resultado>
  /**
   * Parada con tipo del catálogo, en curso hasta Continuar. Opcional: por ahora solo la usa la
   * demo (/paradas-demo); sin ella, la tarjeta usa `pausar` (el +1 "por clasificar").
   */
  parar?: (corridaId: string, datos: DatosParar) => Promise<Resultado>
  /** `minutos`: duración corregida a mano de la parada en curso (si no, se cierra con la hora actual). */
  continuar: (corridaId: string, minutos?: number) => Promise<Resultado>
  detener: (corridaId: string, motivo: string) => Promise<Resultado>
  continuarSiguienteLote: (corridaId: string, numeroTanque?: number) => Promise<Resultado>
  seguirMismoLote: (corridaId: string) => Promise<Resultado>
  confirmarEstado: (corridaId: string) => Promise<Resultado>
  cambiarCondicion: (datos: DatosCambiarLinea) => Promise<Resultado>
  ponerEnCip: (datos: DatosCipLinea) => Promise<Resultado>
  terminarCip: (linea: string) => Promise<Resultado>
  continuarCorridaDetenida: (corridaId: string) => Promise<Resultado>
  terminarLinea: (corridaId: string) => Promise<Resultado>
}

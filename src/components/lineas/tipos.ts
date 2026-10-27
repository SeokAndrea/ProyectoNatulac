import type { DatosActivarLinea, DatosCambiarLinea, DatosCipLinea, DatosPausarLinea, Resultado } from "@/lib/produccion/tipos"

/** Las mutaciones de Producción que usa la tarjeta de una línea (ver LineasEstadoPlanta, que las arma desde useProduccion). */
export interface AccionesLinea {
  activar: (datos: DatosActivarLinea) => Promise<Resultado>
  pausar: (corridaId: string, datos: DatosPausarLinea) => Promise<Resultado>
  continuar: (corridaId: string, justificacion?: string | null, minutos?: number | null) => Promise<Resultado>
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

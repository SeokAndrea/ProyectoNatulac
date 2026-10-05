import type { PresentacionCodigo } from "@/lib/catalogos"
import type { Corrida, Resultado } from "@/lib/produccion/tipos"

/*
 * productoRetenido/cajasRetenidas NO están acá: el módulo Producto
 * Terminado (src/lib/productoTerminado.ts) ya no los expone — se
 * dropearon en la base, ver plan-rework-3-modulos-y-merma.md §2.9.
 */
export interface DatosRegistrarProducto {
  corridaId: string
  linea: Corrida["linea"]
  saborId: string | null
  presentacion: PresentacionCodigo
  paletas: number
  cajasSueltas: number
}

export interface DatosRegistrarContador {
  corridaId: string
  linea: Corrida["linea"]
  envasesLlenadora: number
  /** Contador 2 (envases buenos), obligatorio — ver ContadorRegistro.envasesBuenos en src/lib/produccion/tipos.ts. */
  envasesBuenos?: number | null
  justificacion: string
}

/** Lo que la página de Producto Terminado puede hacer con una corrida (ver ProductoTerminado.tsx, que las arma desde los 3 módulos). */
export interface AccionesPT {
  registrarProducto: (datos: DatosRegistrarProducto) => Promise<Resultado>
  registrarContador: (datos: DatosRegistrarContador) => Promise<Resultado>
  entregarCorrida: (corridaId: string) => Promise<Resultado>
  terminarSabor: (corridaId: string) => Promise<Resultado>
  medirTanque: (numeroTanque: 1 | 2 | 3, volumenReal: number) => Promise<Resultado>
}

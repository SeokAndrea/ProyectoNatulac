import type {
  DatosCambiarTanque,
  DatosIniciarPreparacion,
  ModoTransferencia,
  MotivoTransferencia,
  Resultado,
} from "@/lib/preparacion/tipos"

type Tanque = 1 | 2 | 3

/** Las mutaciones de Preparación que usa la tarjeta de un tanque (ver EstadoPlantaTabs, que las arma desde usePreparacion). */
export interface AccionesTanque {
  cambiarCondicion: (datos: DatosCambiarTanque) => Promise<Resultado>
  confirmarEstado: (numeroTanque: Tanque, momento: "INICIO" | "FIN") => Promise<Resultado>
  iniciarPreparacion: (datos: DatosIniciarPreparacion) => Promise<Resultado>
  liberarLote: (loteId: string) => Promise<Resultado>
  ajustar: (loteId: string, litros: number, detalle: string | null) => Promise<Resultado>
  fijarVolumenLote: (loteId: string, volumenReal: number) => Promise<Resultado>
  transferir: (origen: Tanque, destino: Tanque, modo: ModoTransferencia, motivo: MotivoTransferencia) => Promise<Resultado>
  desvasar: (numeroTanque: Tanque) => Promise<Resultado>
  medirTanque: (numeroTanque: Tanque, volumenReal: number) => Promise<Resultado>
  capturarRestoOrigen: (origen: Tanque, litrosResto: number) => Promise<Resultado>
}

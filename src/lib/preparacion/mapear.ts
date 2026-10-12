/**
 * Mapeo de las filas crudas que devuelve turno_json() a los tipos del
 * módulo Preparación. Extraído de mapearTurno() en src/lib/turno.ts —
 * mismo comportamiento, con los renombres de PreparacionRegistro
 * aplicados acá (ver tipos.ts).
 */
import { saborSinFamiliaOculta } from "@/lib/turno"
import type {
  AjusteVolumenRegistro,
  DesvaseLoteRegistro,
  FilaAjusteVolumen,
  FilaDesvaseLote,
  FilaPreparacion,
  FilaSalidaVacio,
  FilaTanque,
  FilaTransferencia,
  PreparacionRegistro,
  SalidaVacioRegistro,
  TanqueRecepcion,
  TransferenciaRegistro,
} from "./tipos"

export function mapearTanque(fila: FilaTanque): TanqueRecepcion {
  return {
    numeroTanque: fila.numero_tanque as 1 | 2 | 3,
    saborId: fila.sabor_id,
    saborNombre: saborSinFamiliaOculta(fila.sabor_nombre),
    condicion: fila.condicion,
    volumenL: fila.volumen_l,
    volumenInicialL: fila.volumen_inicial_l,
    lote: fila.lote,
    activadaEn: fila.activada_en,
    ultimoSaborId: fila.ultimo_sabor_id,
    ultimoSaborNombre: saborSinFamiliaOculta(fila.ultimo_sabor_nombre),
    ultimoLote: fila.ultimo_lote,
    confirmadoInicioEn: fila.confirmado_inicio_en,
    confirmadoFinEn: fila.confirmado_fin_en,
    cipIniciadoEn: fila.cip_iniciado_en,
    cipFinalizadoEn: fila.cip_finalizado_en,
    paraVacio: fila.para_vacio ?? false,
  }
}

export function mapearPreparacion(fila: FilaPreparacion): PreparacionRegistro {
  return {
    id: fila.id,
    turnoId: fila.turno_id ?? null,
    numeroTanque: fila.numero_tanque as 1 | 2 | 3,
    saborId: fila.sabor_id,
    saborNombre: saborSinFamiliaOculta(fila.sabor_nombre),
    lote: fila.lote,
    volumenActualL: fila.volumen_l,
    volumenPreparadoL: fila.volumen_inicial_l,
    volumenAlIniciarTurnoL: fila.volumen_l_inicio ?? fila.volumen_inicial_l,
    tambores: fila.tambores,
    agua: fila.agua,
    azucar: fila.azucar,
    acidoCitrico: fila.acido_citrico,
    creadoEn: fila.creado_en,
    liberadoEn: fila.liberado_en,
    cerradoEn: fila.cerrado_en,
    paraVacio: fila.para_vacio ?? false,
  }
}

/**
 * Para la merma, una salida a Vacío es como un desvase: litros que el lote
 * entregó afuera. Se suman a la lista de desvases que va a Reportes (es su
 * único uso), así cada pantalla que calcula merma las resta sin cambios.
 */
export function salidasComoDesvases(salidas: SalidaVacioRegistro[]): DesvaseLoteRegistro[] {
  return salidas.map((s) => ({ id: s.id, litros: s.litros, loteIdOrigen: s.loteId, creadoEn: s.creadoEn }))
}

export function mapearSalidaVacio(fila: FilaSalidaVacio): SalidaVacioRegistro {
  return {
    id: fila.id,
    numeroTanque: fila.numero_tanque as 1 | 2 | 3,
    loteId: fila.lote_id,
    lote: fila.lote,
    saborNombre: saborSinFamiliaOculta(fila.sabor_nombre),
    litros: Number(fila.litros),
    deLoteVacio: fila.de_lote_vacio,
    usuarioNombre: fila.usuario_nombre,
    creadoEn: fila.creado_en,
  }
}

export function mapearTransferencia(fila: FilaTransferencia): TransferenciaRegistro {
  return {
    id: fila.id,
    litros: fila.litros,
    modo: fila.modo,
    loteIdOrigen: fila.lote_id_origen,
    loteIdDestino: fila.lote_id_destino,
    creadoEn: fila.creado_en,
  }
}

export function mapearDesvaseLote(fila: FilaDesvaseLote): DesvaseLoteRegistro {
  return {
    id: fila.id,
    litros: fila.litros,
    loteIdOrigen: fila.lote_id_origen,
    creadoEn: fila.creado_en,
  }
}

export function mapearAjusteVolumen(fila: FilaAjusteVolumen): AjusteVolumenRegistro {
  return {
    id: fila.id,
    loteId: fila.lote_id,
    numeroTanque: fila.numero_tanque,
    lote: fila.lote,
    saborNombre: saborSinFamiliaOculta(fila.sabor_nombre),
    litros: fila.litros,
    detalle: fila.detalle,
    usuarioNombre: fila.usuario_nombre,
    creadoEn: fila.creado_en,
  }
}

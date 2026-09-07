/**
 * Mapeo de las filas crudas que devuelve turno_json() a los tipos del
 * módulo Preparación. Extraído de mapearTurno() en src/lib/turno.tsx —
 * mismo comportamiento, con los renombres de PreparacionRegistro
 * aplicados acá (ver tipos.ts).
 */
import { saborSinFamiliaOculta } from "@/lib/turno"
import type { FilaPreparacion, FilaTanque, PreparacionRegistro, TanqueRecepcion } from "./tipos"

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
  }
}

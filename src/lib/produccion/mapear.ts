/**
 * Mapeo de las filas crudas que devuelve turno_json() a los tipos del
 * módulo Producción. Extraído de mapearTurno() en src/lib/turno.tsx —
 * mismo comportamiento, con el renombre Corrida/corridaId aplicado.
 */
import type { LineaCodigo, PresentacionCodigo } from "@/lib/catalogos"
import { saborSinFamiliaOculta } from "@/lib/turno"
import type { Corrida, ContadorRegistro, FilaContador, FilaCorrida, FilaLineaEstado, LineaEstado } from "./tipos"

export function mapearCorrida(fila: FilaCorrida): Corrida {
  return {
    id: fila.id,
    linea: fila.linea_codigo as LineaCodigo,
    presentacion: String(fila.presentacion_volumen_ml ?? "") as PresentacionCodigo,
    envasesHora: fila.envases_hora ?? 0,
    saborId: fila.sabor_id,
    saborNombre: saborSinFamiliaOculta(fila.sabor_nombre),
    lote: fila.lote,
    loteId: fila.lote_id,
    activa: fila.activa,
    activadaEn: fila.activada_en,
    pausadaEn: fila.pausada_en,
    loteTerminado: fila.lote_terminado_en,
    finalizadaEn: fila.finalizada_en,
    esperandoCierre: !fila.activa && fila.finalizada_en === null,
    entregadaEn: fila.entregada_en,
    confirmadoInicioEn: fila.confirmado_inicio_en,
  }
}

export function mapearLineaEstado(fila: FilaLineaEstado): LineaEstado {
  return {
    linea: fila.linea_codigo as LineaCodigo,
    condicion: fila.condicion,
    activadaEn: fila.activada_en,
    cipIniciadoEn: fila.cip_iniciado_en,
    cipFinalizadoEn: fila.cip_finalizado_en,
    observacion: fila.observacion ?? null,
  }
}

export function mapearContador(fila: FilaContador): ContadorRegistro {
  return {
    id: fila.id,
    linea: fila.linea_codigo as LineaCodigo,
    corridaId: fila.turno_linea_id,
    envasesLlenadora: fila.envases_llenadora,
    envasesBuenos: fila.envases_buenos ?? null,
    justificacion: fila.justificacion ?? "",
    parcial: fila.parcial ?? false,
    creadoEn: fila.creado_en,
  }
}

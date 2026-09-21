/**
 * Tipos del módulo Preparación — dueño de los tanques y los lotes
 * (`recepcion_tanques`, `preparaciones`, `preparaciones_ajuste*`).
 *
 * Ver plan-rework-3-modulos-y-merma.md, Fase 1. Extraído de src/lib/turno.tsx
 * como primer paso de la separación en 3 módulos de dominio — mismo
 * comportamiento que hoy, con los renombres de "Revisión de nombres" ya
 * aplicados a PreparacionRegistro (antes volumenL/volumenInicialL/volumenLInicio).
 *
 * cambiarCondicionTanque y reactivarLote NO están acá — se retiran en la
 * Fase 2 del plan (bug confirmado / atajo sin guardrails), no vale la pena
 * migrarlas para borrarlas enseguida.
 */

/**
 * TODO (Fase 2 del plan): SUCIO y STANDBY se fusionan en un solo valor
 * ("Con Restos", 0 o más litros) una vez que la migración correspondiente
 * esté aplicada. Hasta entonces este tipo refleja el enum real de la base
 * tal cual está hoy (6 valores) — no se adelanta la fusión en el código
 * antes de que exista en la base, para no desincronizar los dos.
 */
export type CondicionTanque = "LISTO" | "SUCIO" | "EN_PREPARACION" | "STANDBY" | "CIP" | "LIMPIO"

export type ModoTransferencia = "LIQUIDO" | "LOTE"

/** Por qué se transfiere — lista fija, ver migración 20261016090000. */
export type MotivoTransferencia = "CONSOLIDAR_RESTOS" | "ENRUTAR_MANIFOLD"

export type Resultado = { ok: true } | { ok: false; error: string }

export interface TanqueRecepcion {
  numeroTanque: 1 | 2 | 3
  saborId: string | null
  saborNombre: string | null
  condicion: CondicionTanque
  volumenL: number | null
  /**
   * Volumen con el que se armó el lote actual (fijo desde que se crea, no
   * se descuenta) — el % de TEXTO del tanque (TanqueVisual) sale de acá
   * ("100% del lote"), pero el líquido dibujado sigue siendo siempre
   * respecto a la capacidad física del tanque (TANK_CAPACITY).
   */
  volumenInicialL: number | null
  lote: string | null
  activadaEn: string
  ultimoSaborId: string | null
  ultimoSaborNombre: string | null
  ultimoLote: string | null
  /** null = falta revisar (Confirmar o Editar) al abrir/cerrar turno. */
  confirmadoInicioEn: string | null
  confirmadoFinEn: string | null
  /** Se marcan al entrar a CIP / al salir de CIP hacia LIMPIO. */
  cipIniciadoEn: string | null
  cipFinalizadoEn: string | null
}

/**
 * Preparación = LOTE: mezcla de un tanque (tambores de concentrado +
 * agua/azúcar/ácido cítrico + volumen), creada de una sola vez con
 * iniciarPreparacion. Cada preparación es su propio lote, independiente de
 * las demás — nunca se suman entre sí. "liberadoEn" queda null hasta que se
 * libera (ver liberarLote) — recién ahí el tanque queda LISTO y una corrida
 * lo puede tomar. "cerradoEn" queda null mientras el lote sigue en uso.
 */
export interface PreparacionRegistro {
  id: string
  /** Turno en el que se creó este lote. Si coincide con el turno que se está viendo, el lote NACIÓ acá (su inicio es volumenPreparadoL). */
  turnoId: string | null
  numeroTanque: 1 | 2 | 3
  saborId: string | null
  saborNombre: string | null
  lote: string | null
  /** Volumen actual del lote (antes volumenL). */
  volumenActualL: number | null
  /** Volumen con el que se armó este lote — junto con volumenActualL, permite calcular cuánto salió realmente del tanque (antes volumenInicialL). */
  volumenPreparadoL: number | null
  /** volumen del lote al INICIO de este turno: volumenPreparadoL si nació acá, o el volumen congelado al cierre del último turno anterior que lo tenía. Denominador del modelo repartido por turno (antes volumenLInicio). */
  volumenAlIniciarTurnoL: number | null
  tambores: number
  agua: number | null
  azucar: number | null
  acidoCitrico: number | null
  creadoEn: string
  liberadoEn: string | null
  cerradoEn: string | null
}

/**
 * Un movimiento de líquido entre lotes dentro del mismo turno
 * (transferir_tanque) — para restarlo del tramo del lote que lo
 * entrega y sumarlo al que lo absorbe (ver realidadPreparacion.ts).
 * Nombre distinto de `Desvase`/`FilaDesvase` (más abajo en src/lib/desvases.ts,
 * que es el selector de "usar un desvase guardado" en Preparación —
 * otro shape, no mezclar).
 */
export interface TransferenciaRegistro {
  id: string
  litros: number
  modo: ModoTransferencia | null
  /** Lote que entrega — sus litros transferidos no cuentan como pérdida en SU tramo. */
  loteIdOrigen: string | null
  /** Lote que absorbe. Si nació de ESTA transferencia (modo LIMPIO) ya está en su volumenPreparadoL — no sumar de nuevo. */
  loteIdDestino: string | null
  creadoEn: string
}

/** Un desvase (a pipa) hecho DESDE un lote — solo el lado que entrega: consumirlo después siempre crea un lote nuevo, que ya nace con el monto incluido. */
export interface DesvaseLoteRegistro {
  id: string
  litros: number
  loteIdOrigen: string | null
  creadoEn: string
}

/** Un ajuste de volumen (sumar agua/jugo antes de liberar, botón "Ajustar") — ver ajustar_preparacion() y el Acta de Entrega (§1.7). */
export interface AjusteVolumenRegistro {
  id: string
  loteId: string | null
  numeroTanque: 1 | 2 | 3 | null
  lote: string | null
  saborNombre: string | null
  litros: number
  detalle: string | null
  usuarioNombre: string | null
  creadoEn: string
}

export interface DatosIniciarPreparacion {
  numeroTanque: 1 | 2 | 3
  saborId: string | null
  lote: string
  tambores: number
  agua: number | null
  azucar: number | null
  acidoCitrico: number | null
  /** Un desvase guardado (en pipa) a sumar — ver desvasarTanque — null si no hay o no se eligió ninguno. */
  desvaseId: string | null
}

/**
 * TODO (Fase 2 del plan): este tipo entero se retira junto con
 * cambiarCondicionTanque — ver ajustes.ts.
 */
export interface DatosCambiarTanque {
  numeroTanque: 1 | 2 | 3
  condicion: CondicionTanque
  saborId: string | null
  volumenL: number | null
  lote: string | null
  /** Solo para condicion "EN_PREPARACION" con datos: crea la preparación abierta (el volumen sale de tambores × volumen del sabor). */
  tambores?: number | null
  /** Si viene, además de guardar los datos marca el tanque como revisado para ese momento del turno. */
  momento?: "INICIO" | "FIN"
}

// ------------------------------------------------------------
// Formas crudas que devuelve turno_json() — mismo shape que
// src/lib/turno.tsx (FilaTanque / FilaPreparacion), no exportadas de ahí,
// así que se redeclaran acá para este módulo.
// ------------------------------------------------------------

export interface FilaTanque {
  numero_tanque: number
  sabor_id: string | null
  sabor_nombre: string | null
  condicion: CondicionTanque
  volumen_l: number | null
  volumen_inicial_l: number | null
  lote: string | null
  activada_en: string
  ultimo_sabor_id: string | null
  ultimo_sabor_nombre: string | null
  ultimo_lote: string | null
  confirmado_inicio_en: string | null
  confirmado_fin_en: string | null
  cip_iniciado_en: string | null
  cip_finalizado_en: string | null
}

export interface FilaPreparacion {
  id: string
  turno_id: string | null
  numero_tanque: number
  sabor_id: string | null
  sabor_nombre: string | null
  lote: string | null
  volumen_l: number | null
  volumen_inicial_l: number | null
  volumen_l_inicio: number | null
  tambores: number
  agua: number | null
  azucar: number | null
  acido_citrico: number | null
  creado_en: string
  liberado_en: string | null
  cerrado_en: string | null
}

export interface FilaTransferencia {
  id: string
  litros: number
  modo: ModoTransferencia | null
  lote_id_origen: string | null
  lote_id_destino: string | null
  creado_en: string
}

export interface FilaDesvaseLote {
  id: string
  litros: number
  lote_id_origen: string | null
  creado_en: string
}

export interface FilaAjusteVolumen {
  id: string
  lote_id: string | null
  numero_tanque: 1 | 2 | 3 | null
  lote: string | null
  sabor_nombre: string | null
  litros: number
  detalle: string | null
  usuario_nombre: string | null
  creado_en: string
}

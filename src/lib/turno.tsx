import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import type { GrupoCodigo, LineaCodigo, PresentacionCodigo, TurnoTipoCodigo } from "@/lib/catalogos"
import { useAuth } from "@/lib/auth"
import { useCatalogosLive, litrosHoraDeLive, type PresentacionLive } from "@/lib/catalogosLive"
import { supabase } from "@/lib/supabase"

/**
 * Una corrida de línea: presentación + velocidad + el lote que
 * consume (loteId, referencia a un PreparacionRegistro). Ya NO es "una
 * fila fija por línea" — puede haber varias por línea en el mismo
 * turno (una por lote), y las que ya terminaron quedan en la lista
 * con activa=false, en vez de borrarse: cada corrida es su propio
 * tramo, nunca se pisan entre sí. Se activa/cambia/finaliza en
 * cualquier momento desde Preparación (src/pages/apps/Preparacion.tsx)
 * y la(s) corrida(s) activa(s) se heredan solas de turno a turno.
 */
export interface LineaEnTurno {
  id: string
  linea: LineaCodigo
  presentacion: PresentacionCodigo
  envasesHora: number
  saborId: string | null
  saborNombre: string | null
  lote: string | null
  /** Lote (preparación) del que está tomando esta corrida, si corresponde. */
  loteId: string | null
  activa: boolean
  activadaEn: string
  /** Parada reversible (se puede Continuar) — la corrida sigue activa=true mientras está pausada. */
  pausadaEn: string | null
  /**
   * El lote que alimentaba esta corrida se cerró (el supervisor inició
   * una preparación nueva sobre el mismo tanque) — la corrida sigue
   * activa=true, pero en Líneas se le ofrecen 2 opciones: Terminó
   * Sabor o Continuar al siguiente lote (ver continuarSiguienteLote).
   */
  loteTerminado: string | null
  finalizadaEn: string | null
  /** Terminó Sabor ya se apretó (activa=false) pero todavía no se registró su contador — no está realmente cerrada. */
  esperandoCierre: boolean
  /** El supervisor ya cerró SU parte con "¿Va a continuar en el siguiente turno?" — la corrida sigue activa=true igual. */
  entregadaEn: string | null
}

export type CondicionTanque = "LISTO" | "SUCIO" | "VACIO" | "EN_PREPARACION" | "STANDBY"

/**
 * Estado de uno de los 3 tanques de materia prima. Es estado continuo
 * que se cambia en cualquier momento desde Recepción/Preparación y se
 * hereda de turno a turno. EN_PREPARACION = "no liberado" (se está
 * mezclando, todavía no se puede usar); LISTO = "liberado" (ya se
 * puede tomar para una corrida). Sabor y volumen solo tienen sentido
 * cuando condicion = "LISTO" o "STANDBY" — se copian ahí desde el
 * lote al liberarlo (ver liberarLote); mientras está EN_PREPARACION
 * esos campos quedan en null porque todavía no es oficial.
 * STANDBY = el lote que tenía adentro ya se cerró solo (el volumen
 * llegó a 0 por Producto Terminado, ver registrar_producto_terminado)
 * pero quedó un resto que no es exactamente 0 — sabor/lote/volumen se
 * mantienen para que el supervisor decida a mano (Corregir) si lo
 * guarda o lo marca Sucio. "ultimoSabor/ultimoLote" quedan guardados
 * cuando el tanque pasa a SUCIO, para poder mostrarlos sin que el
 * supervisor los reescriba.
 */
export interface TanqueRecepcion {
  numeroTanque: 1 | 2 | 3
  saborId: string | null
  saborNombre: string | null
  condicion: CondicionTanque
  volumenL: number | null
  lote: string | null
  activadaEn: string
  ultimoSaborId: string | null
  ultimoSaborNombre: string | null
  ultimoLote: string | null
  /** null = falta revisar (Confirmar o Editar) al abrir/cerrar turno — ver confirmarEstadoTanque(). */
  confirmadoInicioEn: string | null
  confirmadoFinEn: string | null
}

/**
 * Preparación = LOTE: mezcla de un tanque (tambores de concentrado +
 * agua/azúcar/ácido cítrico + volumen), creada de una sola vez con
 * iniciarPreparacion. Cada preparación es su propio lote,
 * independiente de las demás — NUNCA se suman entre sí (si el tanque
 * ya se usó y se vuelve a preparar, es un lote nuevo, no una
 * ampliación del anterior). "liberadoEn" queda null hasta que se
 * libera (ver liberarLote) — recién ahí el tanque queda LISTO y una
 * corrida lo puede tomar. "cerradoEn" queda null mientras el lote
 * sigue en uso; se completa al finalizarlo (ver finalizarLote).
 */
export interface PreparacionRegistro {
  id: string
  numeroTanque: 1 | 2 | 3
  saborId: string | null
  saborNombre: string | null
  lote: string | null
  volumenL: number | null
  tambores: number
  agua: number | null
  azucar: number | null
  acidoCitrico: number | null
  creadoEn: string
  liberadoEn: string | null
  cerradoEn: string | null
}

/**
 * Contador: un solo valor por registro (envases que salieron de la
 * llenadora), ligado a la corrida (turnoLineaId) que lo generó. La
 * merma ya no se calcula acá — sale de comparar esto contra el
 * Producto Terminado de esa MISMA corrida (ver mermaPorCorrida más
 * abajo), porque puede que uno de los dos todavía no esté cargado.
 */
export interface ContadorRegistro {
  id: string
  linea: LineaCodigo
  turnoLineaId: string | null
  envasesLlenadora: number
  justificacion: string
  creadoEn: string
}

/**
 * Producto Terminado: conteo físico de paletas + "restos" (cajas
 * sueltas) de UNA corrida — ligado a turnoLineaId, no a la línea
 * suelta. Sigue siendo upsert (se corrige mientras la corrida sigue
 * activa), pero una corrida nueva (lote nuevo) genera un registro
 * nuevo en vez de pisar el de la corrida anterior.
 */
export interface ProductoTerminadoRegistro {
  id: string
  linea: LineaCodigo
  turnoLineaId: string | null
  saborId: string | null
  saborNombre: string | null
  presentacion: PresentacionCodigo
  paletas: number
  cajasSueltas: number
  litrosProducidos: number
  creadoEn: string
}

export interface TurnoActivo {
  id: string
  codigo: string
  fecha: string
  horaInicio: string
  estado: "ABIERTO" | "CERRADO"
  fechaFin: string | null
  horaFin: string | null
  turnoTipo: TurnoTipoCodigo
  grupo: GrupoCodigo
  supervisorUsuario: string
  supervisorNombre: string
  /** Todas las corridas tocadas en este turno (activas y finalizadas durante él) — filtrar por .activa para "en uso ahora". */
  lineas: LineaEnTurno[]
  tanques: TanqueRecepcion[]
  contadores: ContadorRegistro[]
  productoTerminado: ProductoTerminadoRegistro[]
  preparaciones: PreparacionRegistro[]
}

export interface DatosNuevoTurno {
  turnoTipo: TurnoTipoCodigo
  grupo: GrupoCodigo
}

export interface DatosActivarLinea {
  linea: LineaCodigo
  presentacion: PresentacionCodigo
  envasesHora: number
  /** Tanque LISTO (liberado) del que va a tomar esta corrida — sabor y lote se derivan de ahí. */
  numeroTanque: 1 | 2 | 3
}

export interface DatosCambiarTanque {
  numeroTanque: 1 | 2 | 3
  condicion: CondicionTanque
  saborId: string | null
  volumenL: number | null
  lote: string | null
  /** Si viene, además de guardar los datos marca el tanque como revisado para ese momento del turno. */
  momento?: "INICIO" | "FIN"
}

interface DatosNuevoContador {
  turnoLineaId: string
  linea: LineaCodigo
  envasesLlenadora: number
  justificacion: string
}

interface DatosProductoTerminado {
  turnoLineaId: string
  linea: LineaCodigo
  saborId: string | null
  presentacion: PresentacionCodigo
  paletas: number
  cajasSueltas: number
}

export interface DatosIniciarPreparacion {
  numeroTanque: 1 | 2 | 3
  saborId: string | null
  lote: string
  tambores: number
  agua: number | null
  azucar: number | null
  acidoCitrico: number | null
}

type Resultado = { ok: true } | { ok: false; error: string }

interface TurnoContextValue {
  turnoActivo: TurnoActivo | null
  /** true mientras se busca si el usuario tiene un turno abierto en Supabase. */
  cargando: boolean
  iniciarTurno: (datos: DatosNuevoTurno) => Promise<Resultado>
  finalizarTurno: () => Promise<void>
  registrarContador: (datos: DatosNuevoContador) => Promise<Resultado>
  actualizarJustificacionContador: (contadorId: string, justificacion: string) => Promise<Resultado>
  registrarProductoTerminado: (datos: DatosProductoTerminado) => Promise<Resultado>
  iniciarPreparacion: (datos: DatosIniciarPreparacion) => Promise<Resultado>
  liberarLote: (loteId: string) => Promise<Resultado>
  activarLinea: (datos: DatosActivarLinea) => Promise<Resultado>
  pausarLinea: (turnoLineaId: string) => Promise<Resultado>
  continuarLinea: (turnoLineaId: string) => Promise<Resultado>
  terminarSaborLinea: (turnoLineaId: string) => Promise<Resultado>
  continuarSiguienteLote: (turnoLineaId: string) => Promise<Resultado>
  entregarCorrida: (turnoLineaId: string) => Promise<Resultado>
  finalizarLote: (loteId: string) => Promise<Resultado>
  cambiarCondicionTanque: (datos: DatosCambiarTanque) => Promise<Resultado>
  confirmarEstadoTanque: (numeroTanque: 1 | 2 | 3, momento: "INICIO" | "FIN") => Promise<Resultado>
}

const LIMITE_MERMA = 0.03

const TurnoContext = createContext<TurnoContextValue | null>(null)

/*
 * Todo esto vive en las tablas "turnos", "turno_lineas",
 * "recepcion_tanques", "preparaciones" (= lotes), "contadores" y
 * "producto_terminado" de Supabase — ver
 * supabase/migrations/20260909090000_lotes_y_corridas.sql (y las
 * anteriores para el resto del esquema). Como esas tablas tienen RLS
 * activado y sin políticas, todo pasa por funciones RPC (mismo patrón
 * que src/lib/personal.ts). turno_json()/turno_activo_de() devuelven
 * el turno como un solo objeto JSON (turno + líneas + tanques +
 * contadores + producto terminado + preparaciones juntos).
 */
interface FilaLinea {
  id: string
  linea_codigo: string
  presentacion_volumen_ml: number | null
  envases_hora: number | null
  litros_hora: number | null
  sabor_id: string | null
  sabor_nombre: string | null
  lote: string | null
  lote_id: string | null
  activa: boolean
  activada_en: string
  pausada_en: string | null
  lote_terminado_en: string | null
  entregada_en: string | null
  finalizada_en: string | null
}

interface FilaTanque {
  numero_tanque: number
  sabor_id: string | null
  sabor_nombre: string | null
  condicion: CondicionTanque
  volumen_l: number | null
  lote: string | null
  activada_en: string
  ultimo_sabor_id: string | null
  ultimo_sabor_nombre: string | null
  ultimo_lote: string | null
  confirmado_inicio_en: string | null
  confirmado_fin_en: string | null
}

interface FilaContador {
  id: string
  linea_codigo: string
  turno_linea_id: string | null
  envases_llenadora: number
  justificacion: string | null
  creado_en: string
}

interface FilaProductoTerminado {
  id: string
  linea_codigo: string
  turno_linea_id: string | null
  sabor_id: string | null
  sabor_nombre: string | null
  presentacion_volumen_ml: number
  paletas: number
  cajas_sueltas: number
  litros_producidos: number
  creado_en: string
}

interface FilaPreparacion {
  id: string
  numero_tanque: number
  sabor_id: string | null
  sabor_nombre: string | null
  lote: string | null
  volumen_l: number | null
  tambores: number
  agua: number | null
  azucar: number | null
  acido_citrico: number | null
  creado_en: string
  liberado_en: string | null
  cerrado_en: string | null
}

export interface FilaTurno {
  id: string
  codigo: string
  fecha: string
  hora_inicio: string
  estado: "ABIERTO" | "CERRADO"
  fecha_fin: string | null
  hora_fin: string | null
  turno_tipo_codigo: string
  grupo_codigo: string
  supervisor_usuario: string
  supervisor_nombre: string
  lineas: FilaLinea[]
  tanques: FilaTanque[]
  contadores: FilaContador[]
  producto_terminado: FilaProductoTerminado[]
  preparaciones: FilaPreparacion[]
}

/*
 * Fecha/hora LOCAL del navegador, en vez de dejar que Postgres use
 * current_date/current_time (esas corren en el reloj del servidor,
 * UTC — daban un desfase de varias horas contra la hora real de la
 * planta). Se calculan acá y se mandan como parámetro a
 * iniciar_turno/finalizar_turno.
 */
function fechaLocal(d: Date) {
  const anio = d.getFullYear()
  const mes = String(d.getMonth() + 1).padStart(2, "0")
  const dia = String(d.getDate()).padStart(2, "0")
  return `${anio}-${mes}-${dia}`
}

function horaLocal(d: Date) {
  const horas = String(d.getHours()).padStart(2, "0")
  const minutos = String(d.getMinutes()).padStart(2, "0")
  const segundos = String(d.getSeconds()).padStart(2, "0")
  return `${horas}:${minutos}:${segundos}`
}

export function mapearTurno(fila: FilaTurno): TurnoActivo {
  return {
    id: fila.id,
    codigo: fila.codigo,
    fecha: fila.fecha,
    horaInicio: fila.hora_inicio,
    estado: fila.estado,
    fechaFin: fila.fecha_fin,
    horaFin: fila.hora_fin,
    turnoTipo: fila.turno_tipo_codigo as TurnoTipoCodigo,
    grupo: fila.grupo_codigo as GrupoCodigo,
    supervisorUsuario: fila.supervisor_usuario,
    supervisorNombre: fila.supervisor_nombre,
    lineas: fila.lineas.map((l) => ({
      id: l.id,
      linea: l.linea_codigo as LineaCodigo,
      presentacion: String(l.presentacion_volumen_ml ?? ""),
      envasesHora: l.envases_hora ?? 0,
      saborId: l.sabor_id,
      saborNombre: l.sabor_nombre,
      lote: l.lote,
      loteId: l.lote_id,
      activa: l.activa,
      activadaEn: l.activada_en,
      pausadaEn: l.pausada_en,
      loteTerminado: l.lote_terminado_en,
      finalizadaEn: l.finalizada_en,
      esperandoCierre: !l.activa && l.finalizada_en === null,
      entregadaEn: l.entregada_en,
    })),
    tanques: fila.tanques.map((t) => ({
      numeroTanque: t.numero_tanque as 1 | 2 | 3,
      saborId: t.sabor_id,
      saborNombre: t.sabor_nombre,
      condicion: t.condicion,
      volumenL: t.volumen_l,
      lote: t.lote,
      activadaEn: t.activada_en,
      ultimoSaborId: t.ultimo_sabor_id,
      ultimoSaborNombre: t.ultimo_sabor_nombre,
      ultimoLote: t.ultimo_lote,
      confirmadoInicioEn: t.confirmado_inicio_en,
      confirmadoFinEn: t.confirmado_fin_en,
    })),
    contadores: fila.contadores.map((c) => ({
      id: c.id,
      linea: c.linea_codigo as LineaCodigo,
      turnoLineaId: c.turno_linea_id,
      envasesLlenadora: c.envases_llenadora,
      justificacion: c.justificacion ?? "",
      creadoEn: c.creado_en,
    })),
    productoTerminado: fila.producto_terminado.map((p) => ({
      id: p.id,
      linea: p.linea_codigo as LineaCodigo,
      turnoLineaId: p.turno_linea_id,
      saborId: p.sabor_id,
      saborNombre: p.sabor_nombre,
      presentacion: String(p.presentacion_volumen_ml),
      paletas: p.paletas,
      cajasSueltas: p.cajas_sueltas,
      litrosProducidos: p.litros_producidos,
      creadoEn: p.creado_en,
    })),
    preparaciones: fila.preparaciones.map((p) => ({
      id: p.id,
      numeroTanque: p.numero_tanque as 1 | 2 | 3,
      saborId: p.sabor_id,
      saborNombre: p.sabor_nombre,
      lote: p.lote,
      volumenL: p.volumen_l,
      tambores: p.tambores,
      agua: p.agua,
      azucar: p.azucar,
      acidoCitrico: p.acido_citrico,
      creadoEn: p.creado_en,
      liberadoEn: p.liberado_en,
      cerradoEn: p.cerrado_en,
    })),
  }
}

/**
 * Merma de una corrida puntual: envases de Producto Terminado de esa
 * corrida (paletas/cajas sueltas convertidas con la presentación)
 * contra los envases que sumaron sus contadores. null si todavía
 * falta uno de los dos datos — no hay nada que comparar.
 */
export function mermaCorrida(
  turnoLineaId: string,
  turno: Pick<TurnoActivo, "contadores" | "productoTerminado">,
  presentaciones: PresentacionLive[],
): { envasesLlenadora: number; envasesProductoTerminado: number; pct: number } | null {
  const llenadora = turno.contadores
    .filter((c) => c.turnoLineaId === turnoLineaId)
    .reduce((a, c) => a + c.envasesLlenadora, 0)
  const pt = turno.productoTerminado.find((p) => p.turnoLineaId === turnoLineaId)
  if (llenadora === 0 || !pt) return null

  const pres = presentaciones.find((p) => p.codigo === pt.presentacion)
  const envasesXCaja = pres?.envasesXCaja ?? 0
  const cajasXPaleta = pres?.cajasXPaleta ?? 0
  const envasesPt = (pt.paletas * cajasXPaleta + pt.cajasSueltas) * envasesXCaja

  return {
    envasesLlenadora: llenadora,
    envasesProductoTerminado: envasesPt,
    pct: Math.round((1 - envasesPt / llenadora) * 10000) / 100,
  }
}

export function TurnoProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const { velocidades } = useCatalogosLive()
  const usuario = session?.username ?? null

  const [turnoActivo, setTurnoActivo] = useState<TurnoActivo | null>(null)
  const [cargando, setCargando] = useState(true)

  async function recargar(u: string) {
    setCargando(true)
    const { data, error } = await supabase.rpc("turno_activo_de", { p_usuario: u })
    setTurnoActivo(!error && data ? mapearTurno(data as FilaTurno) : null)
    setCargando(false)
  }

  // Si cambia el usuario logueado (login/logout, o cambio de cuenta),
  // recargar el turno de ESE usuario en vez de arrastrar el anterior.
  useEffect(() => {
    if (!usuario) {
      setTurnoActivo(null)
      setCargando(false)
      return
    }
    recargar(usuario)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario])

  async function iniciarTurno(datos: DatosNuevoTurno): Promise<Resultado> {
    if (!usuario || !session?.area) {
      return { ok: false, error: "No se pudo identificar el área del usuario." }
    }

    const ahora = new Date()
    const { data, error } = await supabase.rpc("iniciar_turno", {
      p_usuario: usuario,
      p_area_codigo: session.area,
      p_turno_tipo_codigo: datos.turnoTipo,
      p_grupo_codigo: datos.grupo,
      p_fecha: fechaLocal(ahora),
      p_hora_inicio: horaLocal(ahora),
    })

    if (error || !data) {
      return { ok: false, error: "No se pudo iniciar el turno. Intenta de nuevo." }
    }

    setTurnoActivo(mapearTurno(data as FilaTurno))
    return { ok: true }
  }

  async function activarLinea(datos: DatosActivarLinea): Promise<Resultado> {
    if (!turnoActivo || !usuario) {
      return { ok: false, error: "No hay un turno en curso." }
    }

    const { data, error } = await supabase.rpc("activar_linea", {
      p_usuario: usuario,
      p_turno_id: turnoActivo.id,
      p_linea_codigo: datos.linea,
      p_presentacion_volumen_ml: Number(datos.presentacion),
      p_envases_hora: datos.envasesHora,
      p_litros_hora: litrosHoraDeLive(velocidades, datos.linea, datos.presentacion, datos.envasesHora),
      p_numero_tanque: datos.numeroTanque,
    })

    if (error || !data) {
      return { ok: false, error: error?.message ?? "No se pudo activar la línea. Intenta de nuevo." }
    }

    setTurnoActivo(mapearTurno(data as FilaTurno))
    return { ok: true }
  }

  async function pausarLinea(turnoLineaId: string): Promise<Resultado> {
    if (!turnoActivo || !usuario) {
      return { ok: false, error: "No hay un turno en curso." }
    }

    const { data, error } = await supabase.rpc("pausar_linea", {
      p_usuario: usuario,
      p_turno_id: turnoActivo.id,
      p_turno_linea_id: turnoLineaId,
    })

    if (error || !data) {
      return { ok: false, error: "No se pudo pausar la línea. Intenta de nuevo." }
    }

    setTurnoActivo(mapearTurno(data as FilaTurno))
    return { ok: true }
  }

  async function continuarLinea(turnoLineaId: string): Promise<Resultado> {
    if (!turnoActivo || !usuario) {
      return { ok: false, error: "No hay un turno en curso." }
    }

    const { data, error } = await supabase.rpc("continuar_linea", {
      p_usuario: usuario,
      p_turno_id: turnoActivo.id,
      p_turno_linea_id: turnoLineaId,
    })

    if (error || !data) {
      return { ok: false, error: "No se pudo continuar la línea. Intenta de nuevo." }
    }

    setTurnoActivo(mapearTurno(data as FilaTurno))
    return { ok: true }
  }

  async function terminarSaborLinea(turnoLineaId: string): Promise<Resultado> {
    if (!turnoActivo || !usuario) {
      return { ok: false, error: "No hay un turno en curso." }
    }

    const { data, error } = await supabase.rpc("terminar_sabor_linea", {
      p_usuario: usuario,
      p_turno_id: turnoActivo.id,
      p_turno_linea_id: turnoLineaId,
    })

    if (error || !data) {
      return { ok: false, error: "No se pudo terminar el sabor. Intenta de nuevo." }
    }

    setTurnoActivo(mapearTurno(data as FilaTurno))
    return { ok: true }
  }

  async function continuarSiguienteLote(turnoLineaId: string): Promise<Resultado> {
    if (!turnoActivo || !usuario) {
      return { ok: false, error: "No hay un turno en curso." }
    }

    const { data, error } = await supabase.rpc("continuar_siguiente_lote", {
      p_usuario: usuario,
      p_turno_id: turnoActivo.id,
      p_turno_linea_id: turnoLineaId,
    })

    if (error || !data) {
      return { ok: false, error: error?.message ?? "No se pudo continuar al siguiente lote. Intenta de nuevo." }
    }

    setTurnoActivo(mapearTurno(data as FilaTurno))
    return { ok: true }
  }

  async function entregarCorrida(turnoLineaId: string): Promise<Resultado> {
    if (!turnoActivo || !usuario) {
      return { ok: false, error: "No hay un turno en curso." }
    }

    const { data, error } = await supabase.rpc("entregar_corrida", {
      p_usuario: usuario,
      p_turno_id: turnoActivo.id,
      p_turno_linea_id: turnoLineaId,
    })

    if (error || !data) {
      return { ok: false, error: error?.message ?? "No se pudo entregar la corrida. Intenta de nuevo." }
    }

    setTurnoActivo(mapearTurno(data as FilaTurno))
    return { ok: true }
  }

  async function finalizarLote(loteId: string): Promise<Resultado> {
    if (!turnoActivo || !usuario) {
      return { ok: false, error: "No hay un turno en curso." }
    }

    const { data, error } = await supabase.rpc("finalizar_lote", {
      p_usuario: usuario,
      p_lote_id: loteId,
    })

    if (error || !data) {
      return { ok: false, error: "No se pudo finalizar el lote. Intenta de nuevo." }
    }

    setTurnoActivo(mapearTurno(data as FilaTurno))
    return { ok: true }
  }

  async function cambiarCondicionTanque(datos: DatosCambiarTanque): Promise<Resultado> {
    if (!turnoActivo || !usuario) {
      return { ok: false, error: "No hay un turno en curso." }
    }

    const { data, error } = await supabase.rpc("cambiar_condicion_tanque", {
      p_usuario: usuario,
      p_turno_id: turnoActivo.id,
      p_numero_tanque: datos.numeroTanque,
      p_condicion: datos.condicion,
      p_sabor_id: datos.saborId,
      p_volumen_l: datos.volumenL,
      p_lote: datos.lote,
      p_momento: datos.momento ?? null,
    })

    if (error || !data) {
      return { ok: false, error: "No se pudo cambiar el tanque. Intenta de nuevo." }
    }

    setTurnoActivo(mapearTurno(data as FilaTurno))
    return { ok: true }
  }

  async function confirmarEstadoTanque(numeroTanque: 1 | 2 | 3, momento: "INICIO" | "FIN"): Promise<Resultado> {
    if (!turnoActivo || !usuario) {
      return { ok: false, error: "No hay un turno en curso." }
    }

    const { data, error } = await supabase.rpc("confirmar_estado_tanque", {
      p_usuario: usuario,
      p_turno_id: turnoActivo.id,
      p_numero_tanque: numeroTanque,
      p_momento: momento,
    })

    if (error || !data) {
      return { ok: false, error: "No se pudo confirmar el estado del tanque. Intenta de nuevo." }
    }

    setTurnoActivo(mapearTurno(data as FilaTurno))
    return { ok: true }
  }

  async function finalizarTurno() {
    if (!turnoActivo) return
    const ahora = new Date()
    await supabase.rpc("finalizar_turno", {
      p_turno_id: turnoActivo.id,
      p_fecha_fin: fechaLocal(ahora),
      p_hora_fin: horaLocal(ahora),
    })
    setTurnoActivo(null)
  }

  async function registrarContador(datos: DatosNuevoContador): Promise<Resultado> {
    if (!turnoActivo || !usuario) {
      return { ok: false, error: "No hay un turno en curso." }
    }

    const { data, error } = await supabase.rpc("registrar_contador", {
      p_turno_id: turnoActivo.id,
      p_turno_linea_id: datos.turnoLineaId,
      p_linea_codigo: datos.linea,
      p_envases_llenadora: datos.envasesLlenadora,
      p_justificacion: datos.justificacion,
      p_usuario: usuario,
    })

    if (error || !data) {
      return { ok: false, error: error?.message ?? "No se pudo registrar el contador. Intenta de nuevo." }
    }

    setTurnoActivo(mapearTurno(data as FilaTurno))
    return { ok: true }
  }

  async function actualizarJustificacionContador(contadorId: string, justificacion: string): Promise<Resultado> {
    const { error } = await supabase.rpc("actualizar_justificacion_contador", {
      p_contador_id: contadorId,
      p_justificacion: justificacion,
    })

    if (error) {
      return { ok: false, error: "No se pudo guardar la justificación. Intenta de nuevo." }
    }

    setTurnoActivo((actual) =>
      actual
        ? {
            ...actual,
            contadores: actual.contadores.map((c) => (c.id === contadorId ? { ...c, justificacion } : c)),
          }
        : actual,
    )
    return { ok: true }
  }

  async function registrarProductoTerminado(datos: DatosProductoTerminado): Promise<Resultado> {
    if (!turnoActivo || !usuario) {
      return { ok: false, error: "No hay un turno en curso." }
    }

    const { data, error } = await supabase.rpc("registrar_producto_terminado", {
      p_turno_id: turnoActivo.id,
      p_turno_linea_id: datos.turnoLineaId,
      p_linea_codigo: datos.linea,
      p_sabor_id: datos.saborId,
      p_volumen_ml: Number(datos.presentacion),
      p_paletas: datos.paletas,
      p_cajas_sueltas: datos.cajasSueltas,
      p_usuario: usuario,
    })

    if (error || !data) {
      return { ok: false, error: "No se pudo registrar Producto Terminado. Intenta de nuevo." }
    }

    setTurnoActivo(mapearTurno(data as FilaTurno))
    return { ok: true }
  }

  async function iniciarPreparacion(datos: DatosIniciarPreparacion): Promise<Resultado> {
    if (!turnoActivo || !usuario) {
      return { ok: false, error: "No hay un turno en curso." }
    }

    const { data, error } = await supabase.rpc("iniciar_preparacion", {
      p_usuario: usuario,
      p_turno_id: turnoActivo.id,
      p_numero_tanque: datos.numeroTanque,
      p_sabor_id: datos.saborId,
      p_lote: datos.lote,
      p_tambores: datos.tambores,
      p_agua: datos.agua,
      p_azucar: datos.azucar,
      p_acido_citrico: datos.acidoCitrico,
    })

    if (error || !data) {
      return { ok: false, error: "No se pudo iniciar la preparación. Intenta de nuevo." }
    }

    setTurnoActivo(mapearTurno(data as FilaTurno))
    return { ok: true }
  }

  async function liberarLote(loteId: string): Promise<Resultado> {
    if (!turnoActivo || !usuario) {
      return { ok: false, error: "No hay un turno en curso." }
    }

    const { data, error } = await supabase.rpc("liberar_lote", {
      p_usuario: usuario,
      p_turno_id: turnoActivo.id,
      p_lote_id: loteId,
    })

    if (error || !data) {
      return { ok: false, error: "No se pudo liberar el lote. Intenta de nuevo." }
    }

    setTurnoActivo(mapearTurno(data as FilaTurno))
    return { ok: true }
  }

  return (
    <TurnoContext.Provider
      value={{
        turnoActivo,
        cargando,
        iniciarTurno,
        finalizarTurno,
        registrarContador,
        actualizarJustificacionContador,
        registrarProductoTerminado,
        iniciarPreparacion,
        liberarLote,
        activarLinea,
        pausarLinea,
        continuarLinea,
        terminarSaborLinea,
        continuarSiguienteLote,
        entregarCorrida,
        finalizarLote,
        cambiarCondicionTanque,
        confirmarEstadoTanque,
      }}
    >
      {children}
    </TurnoContext.Provider>
  )
}

export function useTurno() {
  const ctx = useContext(TurnoContext)
  if (!ctx) throw new Error("useTurno debe usarse dentro de TurnoProvider")
  return ctx
}

export { LIMITE_MERMA }

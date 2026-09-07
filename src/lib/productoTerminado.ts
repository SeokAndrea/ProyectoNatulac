/**
 * Módulo Producto Terminado — dueño de `producto_terminado` (y, hasta que
 * la Fase 2 elimine las entregas parciales, `producto_terminado_parciales`).
 * Ver plan-rework-3-modulos-y-merma.md, Fase 1.
 *
 * Un solo archivo: a diferencia de Preparación y Producción, acá hay una
 * sola mutación real (registrarProductoTerminado) — no hay nada que
 * separar en núcleo/ajustes.
 *
 * Extraído de src/lib/turno.tsx, mismo comportamiento — con dos
 * excepciones deliberadas, no premature-behavior-change sino terminar de
 * limpiar algo que ya estaba muerto en la práctica:
 *
 * 1. `productoRetenido`/`cajasRetenidas` NO se exponen acá. Confirmado
 *    (plan, §2.9): el frontend ya los manda siempre false/null, ningún
 *    botón real los cambia — se sacan las columnas de base en la Fase 2,
 *    acá simplemente no se les da lugar en el tipo nuevo.
 * 2. `parcial`/`EntregaParcial` SÍ se mantienen — a diferencia del punto
 *    anterior, las entregas parciales están activamente en uso hoy. Se
 *    eliminan recién en la Fase 2 (Contexto del plan: "un solo total al
 *    final del lote") cuando la base deje de soportarlas — sacarlas acá
 *    antes sería cambiar comportamiento sin haber tocado la base.
 */
import { useCallback, useEffect, useState } from "react"
import type { LineaCodigo, PresentacionCodigo } from "@/lib/catalogos"
import { saborSinFamiliaOculta } from "@/lib/turno"
import { useSesionTurno } from "@/lib/sesionTurno"
import { supabase } from "@/lib/supabase"

export type Resultado = { ok: true } | { ok: false; error: string }

export interface EntregaParcial {
  id: string
  paletas: number
  cajasSueltas: number
  litros: number
  usuarioNombre: string | null
  creadoEn: string
}

/**
 * Producto Terminado: conteo físico de paletas + cajas sueltas de UNA
 * corrida — ligado a corridaId (módulo Producción), no a la línea suelta.
 * TODO (Fase 2): pasa a ser un total único por lote, sin parciales.
 */
export interface ProductoTerminadoRegistro {
  id: string
  linea: LineaCodigo
  corridaId: string | null
  saborId: string | null
  saborNombre: string | null
  presentacion: PresentacionCodigo
  /** Total acumulado de la corrida (suma de las entregas parciales + la carga final). */
  paletas: number
  cajasSueltas: number
  litrosProducidos: number
  /** true si la corrida usó "entrega parcial" — TODO (Fase 2): se elimina, un solo total. */
  tieneParciales: boolean
  parciales: EntregaParcial[]
  creadoEn: string
  registradoPorNombre: string | null
}

export interface DatosProductoTerminado {
  corridaId: string
  linea: LineaCodigo
  saborId: string | null
  presentacion: PresentacionCodigo
  paletas: number
  cajasSueltas: number
  /** true = entrega parcial: paletas/cajas son un incremento que se SUMA. TODO (Fase 2): se elimina. */
  parcial?: boolean
}

// ------------------------------------------------------------
// Forma cruda de turno_json() — redeclarada acá, mismo patrón que los
// otros módulos.
// ------------------------------------------------------------

export interface FilaProductoTerminado {
  id: string
  linea_codigo: string
  turno_linea_id: string | null
  sabor_id: string | null
  sabor_nombre: string | null
  presentacion_volumen_ml: number
  paletas: number
  cajas_sueltas: number
  litros_producidos: number
  tiene_parciales: boolean
  parciales: Array<{
    id: string
    paletas: number
    cajas_sueltas: number
    litros: number
    usuario_nombre: string | null
    creado_en: string
  }>
  creado_en: string
  registrado_por_nombre: string | null
}

interface FilaTurnoProductoTerminado {
  producto_terminado: FilaProductoTerminado[]
}

// ------------------------------------------------------------
// Mapeo
// ------------------------------------------------------------

export function mapearProductoTerminado(fila: FilaProductoTerminado): ProductoTerminadoRegistro {
  return {
    id: fila.id,
    linea: fila.linea_codigo as LineaCodigo,
    corridaId: fila.turno_linea_id,
    saborId: fila.sabor_id,
    saborNombre: saborSinFamiliaOculta(fila.sabor_nombre),
    presentacion: String(fila.presentacion_volumen_ml) as PresentacionCodigo,
    paletas: fila.paletas,
    cajasSueltas: fila.cajas_sueltas,
    litrosProducidos: fila.litros_producidos,
    tieneParciales: fila.tiene_parciales ?? false,
    parciales: (fila.parciales ?? []).map((p) => ({
      id: p.id,
      paletas: p.paletas,
      cajasSueltas: p.cajas_sueltas,
      litros: p.litros,
      usuarioNombre: p.usuario_nombre,
      creadoEn: p.creado_en,
    })),
    creadoEn: fila.creado_en,
    registradoPorNombre: fila.registrado_por_nombre,
  }
}

// ------------------------------------------------------------
// Mutación — función suelta, mismo patrón que los otros módulos.
// productoRetenido/cajasRetenidas se mandan fijos (false/null): ver nota
// de cabecera, ya están muertos en la práctica.
// ------------------------------------------------------------

export async function registrarProductoTerminado(
  usuario: string,
  turnoId: string,
  datos: DatosProductoTerminado,
): Promise<Resultado & { data?: unknown }> {
  const { data, error } = await supabase.rpc("registrar_producto_terminado", {
    p_turno_id: turnoId,
    p_turno_linea_id: datos.corridaId,
    p_linea_codigo: datos.linea,
    p_sabor_id: datos.saborId,
    p_volumen_ml: Number(datos.presentacion),
    p_paletas: datos.paletas,
    p_cajas_sueltas: datos.cajasSueltas,
    p_usuario: usuario,
    p_producto_retenido: false,
    p_cajas_retenidas: null,
    p_parcial: datos.parcial ?? false,
    p_pagina: "Producto Terminado y Contador",
  })

  if (error || !data) {
    return { ok: false, error: "No se pudo registrar Producto Terminado. Intenta de nuevo." }
  }
  return { ok: true, data }
}

// ------------------------------------------------------------
// useProductoTerminado() — mismo patrón (Opción C) que los otros dos
// módulos: no depende del TurnoProvider viejo, busca su propia porción
// de datos.
// ------------------------------------------------------------

export interface UseProductoTerminadoResultado {
  registros: ProductoTerminadoRegistro[]
  cargando: boolean
  recargar: () => Promise<void>
  registrarProductoTerminado: (datos: DatosProductoTerminado) => Promise<Resultado>
}

/**
 * @param turnoIdElegido `undefined` = turno propio del usuario logueado;
 * string = ese turno puntual; `null` = explícitamente ninguno (no cae al
 * turno propio). Mismo mecanismo que usePreparacion() — ver esa nota
 * para el detalle completo.
 */
export function useProductoTerminado(turnoIdElegido?: string | null): UseProductoTerminadoResultado {
  const sesion = useSesionTurno()
  const turnoId = turnoIdElegido === undefined ? sesion.turnoId : turnoIdElegido
  const usuario = sesion.usuario

  const [registros, setRegistros] = useState<ProductoTerminadoRegistro[]>([])
  const [cargando, setCargando] = useState(true)

  function tomarDatos(fila: FilaTurnoProductoTerminado | null) {
    setRegistros(fila ? fila.producto_terminado.map(mapearProductoTerminado) : [])
  }

  const recargar = useCallback(async () => {
    if (!turnoId) {
      tomarDatos(null)
      setCargando(false)
      return
    }
    setCargando(true)
    const { data, error } = await supabase.rpc("turno_json", { p_turno_id: turnoId })
    tomarDatos(!error && data ? (data as FilaTurnoProductoTerminado) : null)
    setCargando(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnoId])

  useEffect(() => {
    recargar()
  }, [recargar])

  async function registrarPT(datos: DatosProductoTerminado): Promise<Resultado> {
    if (!turnoId || !usuario) return { ok: false, error: "No hay un turno en curso." }
    const resultado = await registrarProductoTerminado(usuario, turnoId, datos)
    if (resultado.ok) tomarDatos(resultado.data as FilaTurnoProductoTerminado)
    return resultado
  }

  return { registros, cargando, recargar, registrarProductoTerminado: registrarPT }
}

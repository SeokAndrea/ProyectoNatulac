/**
 * Novedades del turno: bitácora corta con hora ("8:42 falla el fluido
 * eléctrico", "lote 5 envasandose"...) que el supervisor va anotando a lo
 * largo del turno — alimenta la sección "2.3 Novedades del turno" del
 * Acta de Entrega (ver src/lib/actaPdf.ts). Mismo patrón (Opción C) que
 * src/lib/productoTerminado.ts: un solo archivo, busca su propia porción
 * de turno_json() por turnoId.
 */
import { useCallback, useEffect, useState } from "react"
import { useSesionTurno } from "@/lib/sesionTurno"
import { supabase } from "@/lib/supabase"

export type Resultado = { ok: true } | { ok: false; error: string }

export interface NovedadTurno {
  id: string
  texto: string
  creadoEn: string
  creadoPorNombre: string | null
}

// ------------------------------------------------------------
// Forma cruda de turno_json() — redeclarada acá, mismo patrón que los
// otros módulos.
// ------------------------------------------------------------

export interface FilaNovedadTurno {
  id: string
  texto: string
  creado_en: string
  creado_por_nombre: string | null
}

interface FilaTurnoNovedades {
  novedades: FilaNovedadTurno[]
}

export function mapearNovedadTurno(fila: FilaNovedadTurno): NovedadTurno {
  return {
    id: fila.id,
    texto: fila.texto,
    creadoEn: fila.creado_en,
    creadoPorNombre: fila.creado_por_nombre,
  }
}

// ------------------------------------------------------------
// Mutación — función suelta, mismo patrón que los otros módulos.
// ------------------------------------------------------------

export async function registrarNovedadTurno(
  usuario: string,
  turnoId: string,
  texto: string,
): Promise<Resultado & { data?: unknown }> {
  const { data, error } = await supabase.rpc("registrar_novedad_turno", {
    p_usuario: usuario,
    p_turno_id: turnoId,
    p_texto: texto,
  })

  if (error || !data) {
    return { ok: false, error: error?.message ?? "No se pudo guardar la novedad. Intenta de nuevo." }
  }
  return { ok: true, data }
}

// ------------------------------------------------------------
// useNovedadesTurno()
// ------------------------------------------------------------

export interface UseNovedadesTurnoResultado {
  novedades: NovedadTurno[]
  cargando: boolean
  recargar: () => Promise<void>
  registrarNovedad: (texto: string) => Promise<Resultado>
}

/**
 * @param turnoIdElegido `undefined` = turno propio del usuario logueado;
 * string = ese turno puntual; `null` = explícitamente ninguno. Mismo
 * mecanismo que usePreparacion()/useProductoTerminado().
 */
export function useNovedadesTurno(turnoIdElegido?: string | null): UseNovedadesTurnoResultado {
  const sesion = useSesionTurno()
  const turnoId = turnoIdElegido === undefined ? sesion.turnoId : turnoIdElegido
  const usuario = sesion.usuario

  const [novedades, setNovedades] = useState<NovedadTurno[]>([])
  const [cargando, setCargando] = useState(true)

  function tomarDatos(fila: FilaTurnoNovedades | null) {
    setNovedades(fila ? fila.novedades.map(mapearNovedadTurno) : [])
  }

  const recargar = useCallback(async () => {
    if (!turnoId) {
      tomarDatos(null)
      setCargando(false)
      return
    }
    setCargando(true)
    const { data, error } = await supabase.rpc("turno_json", { p_turno_id: turnoId })
    tomarDatos(!error && data ? (data as FilaTurnoNovedades) : null)
    setCargando(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnoId])

  useEffect(() => {
    recargar()
  }, [recargar])

  async function registrarNovedad(texto: string): Promise<Resultado> {
    if (!turnoId || !usuario) return { ok: false, error: "No hay un turno en curso." }
    const resultado = await registrarNovedadTurno(usuario, turnoId, texto)
    if (resultado.ok) tomarDatos(resultado.data as FilaTurnoNovedades)
    return resultado
  }

  return { novedades, cargando, recargar, registrarNovedad }
}

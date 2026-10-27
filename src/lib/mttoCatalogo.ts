import { useCallback, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

/*
 * Catálogo PROPIO de Mantenimiento (migración 20261112590000): sus equipos y
 * sus subsistemas con el código del Sheet. Es otro vocabulario que el de
 * Producción (Equipo + Falla). Nada se borra, solo se desactiva; lo editan
 * Mantenimiento y la dueña (el servidor lo valida).
 */

export interface EquipoMtto {
  codigo: string
  nombre: string
  /** Equipo de Producción al que suele corresponder: solo preselecciona. */
  equipoProduccionCodigo: string | null
  activo: boolean
}

export interface SubsistemaMtto {
  id: string
  equipoCodigo: string
  codigo: string
  nombre: string
  activo: boolean
}

/** Marca que se guarda cuando Mantenimiento elige «Sin subsistema». */
export const SIN_SUBSISTEMA = "SIN_SUBSISTEMA"

type Resultado = { ok: true } | { ok: false; error: string }

interface FilaEquipo {
  codigo: string
  nombre: string
  equipo_produccion_codigo: string | null
  activo: boolean
}
interface FilaSubsistema {
  id: string
  equipo_codigo: string
  codigo: string
  nombre: string
  activo: boolean
}

export const mapearEquipoMtto = (f: FilaEquipo): EquipoMtto => ({
  codigo: f.codigo,
  nombre: f.nombre,
  equipoProduccionCodigo: f.equipo_produccion_codigo ?? null,
  activo: f.activo,
})
export const mapearSubsistemaMtto = (f: FilaSubsistema): SubsistemaMtto => ({
  id: f.id,
  equipoCodigo: f.equipo_codigo,
  codigo: f.codigo,
  nombre: f.nombre,
  activo: f.activo,
})

/**
 * Equipo de Mantenimiento que se preselecciona para el equipo de Producción de
 * la parada (el que Mantenimiento dejó en su catálogo). null si no hay uno solo.
 */
export function equipoMttoSugerido(equipos: EquipoMtto[], equipoProduccionCodigo: string | null | undefined): string | null {
  if (!equipoProduccionCodigo) return null
  const posibles = equipos.filter((e) => e.activo && e.equipoProduccionCodigo === equipoProduccionCodigo)
  return posibles.length === 1 ? posibles[0].codigo : null
}

export async function listarEquiposMtto(): Promise<EquipoMtto[]> {
  const { data, error } = await supabase.rpc("listar_mtto_equipos")
  if (error || !Array.isArray(data)) return []
  return (data as FilaEquipo[]).map(mapearEquipoMtto)
}

export async function listarSubsistemasMtto(equipo: string | null = null): Promise<SubsistemaMtto[]> {
  const { data, error } = await supabase.rpc("listar_mtto_subsistemas", { p_equipo: equipo })
  if (error || !Array.isArray(data)) return []
  return (data as FilaSubsistema[]).map(mapearSubsistemaMtto)
}

/** Equipos y subsistemas de Mantenimiento (todos, activos e inactivos); `recargar` después de editar. */
export function useCatalogoMtto(): { equipos: EquipoMtto[]; subsistemas: SubsistemaMtto[]; cargando: boolean; recargar: () => Promise<void> } {
  const [equipos, setEquipos] = useState<EquipoMtto[]>([])
  const [subsistemas, setSubsistemas] = useState<SubsistemaMtto[]>([])
  const [cargando, setCargando] = useState(true)
  const recargar = useCallback(async () => {
    const [e, s] = await Promise.all([listarEquiposMtto(), listarSubsistemasMtto()])
    setEquipos(e)
    setSubsistemas(s)
    setCargando(false)
  }, [])
  useEffect(() => {
    void recargar()
  }, [recargar])
  return { equipos, subsistemas, cargando, recargar }
}

export async function guardarEquipoMtto(
  usuario: string,
  datos: { codigo: string; nombre: string; equipoProduccionCodigo: string | null; activo: boolean },
): Promise<Resultado> {
  const { error } = await supabase.rpc("guardar_mtto_equipo", {
    p_usuario: usuario,
    p_codigo: datos.codigo,
    p_nombre: datos.nombre,
    p_equipo_produccion_codigo: datos.equipoProduccionCodigo,
    p_activo: datos.activo,
  })
  return error ? { ok: false, error: error.message || "No se pudo guardar el equipo." } : { ok: true }
}

export async function guardarSubsistemaMtto(
  usuario: string,
  datos: { equipoCodigo: string; codigo: string; nombre: string; activo: boolean },
): Promise<Resultado> {
  const { error } = await supabase.rpc("guardar_mtto_subsistema", {
    p_usuario: usuario,
    p_equipo_codigo: datos.equipoCodigo,
    p_codigo: datos.codigo,
    p_nombre: datos.nombre,
    p_activo: datos.activo,
  })
  return error ? { ok: false, error: error.message || "No se pudo guardar el código." } : { ok: true }
}

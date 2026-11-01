import { supabase } from "@/lib/supabase"
import type { Permiso } from "@/lib/permisos"
import type { RolCodigo } from "@/lib/catalogos"

/*
 * Estructura de Personal: áreas, puestos y la matriz de permisos por
 * puesto. Vive en la base (listar_estructura, guardar_area,
 * guardar_puesto, guardar_permisos_puestos — migración 20261114390000);
 * acá solo se llaman y se pasa de snake_case a camelCase.
 */
export type Nivel = 1 | 2 | 3 | 4

export const NIVELES: { nivel: Nivel; nombre: string }[] = [
  { nivel: 1, nombre: "Jefatura" },
  { nivel: 2, nombre: "Coordinación" },
  { nivel: 3, nombre: "Operación" },
  { nivel: 4, nombre: "Apoyo" },
]

export type TemaPermiso = "TURNOS" | "PARADAS" | "MANTENIMIENTO" | "DATOS" | "PERSONAS" | "ADMINISTRACION"

export interface AreaEstructura {
  codigo: string
  nombre: string
  tipo: "PRODUCCION" | "APOYO"
  activo: boolean
  orden: number
  personas: number
}

export interface PuestoEstructura {
  id: string
  codigo: string
  nombre: string
  areaCodigo: string | null
  nivel: Nivel | null
  activo: boolean
  todosLosPermisos: boolean
  personas: number
  permisos: Permiso[]
}

export interface PermisoEstructura {
  codigo: Permiso
  nombre: string
  tema: TemaPermiso
}

export interface Estructura {
  areas: AreaEstructura[]
  puestos: PuestoEstructura[]
  permisos: PermisoEstructura[]
}

interface EstructuraCruda {
  areas?: AreaEstructura[]
  puestos?: {
    id: string
    codigo: string
    nombre: string
    area_codigo: string | null
    nivel: number | null
    activo: boolean
    todos_los_permisos: boolean
    personas: number
    permisos: string[] | null
  }[]
  permisos?: PermisoEstructura[]
}

/** null = no se pudo leer (sin permiso, sin conexión o la base todavía sin la función). */
export async function listarEstructura(usuario: string): Promise<Estructura | null> {
  const { data, error } = await supabase.rpc("listar_estructura", { p_usuario: usuario })
  if (error || !data) return null
  const crudo = data as EstructuraCruda
  return {
    areas: (crudo.areas ?? []).map((a) => ({
      codigo: a.codigo,
      nombre: a.nombre,
      tipo: a.tipo,
      activo: a.activo,
      orden: a.orden,
      personas: a.personas,
    })),
    puestos: (crudo.puestos ?? []).map((p) => ({
      id: p.id,
      codigo: p.codigo,
      nombre: p.nombre,
      areaCodigo: p.area_codigo,
      nivel: p.nivel as Nivel | null,
      activo: p.activo,
      todosLosPermisos: p.todos_los_permisos,
      personas: p.personas,
      permisos: (p.permisos ?? []) as Permiso[],
    })),
    permisos: crudo.permisos ?? [],
  }
}

type Resultado = { ok: true } | { ok: false; error: string }

export async function guardarArea(
  usuario: string,
  datos: { codigo: string; nombre: string; tipo: "PRODUCCION" | "APOYO"; activo: boolean },
  pagina: string,
): Promise<Resultado> {
  const { error } = await supabase.rpc("guardar_area", {
    p_usuario: usuario,
    p_codigo: datos.codigo,
    p_nombre: datos.nombre,
    p_tipo: datos.tipo,
    p_activo: datos.activo,
    p_pagina: pagina,
  })
  if (error) return { ok: false, error: error.message || "No se pudo guardar el área." }
  return { ok: true }
}

/** id null = puesto nuevo. Al editar, areaCodigo se manda tal cual salió de la lista. */
export async function guardarPuesto(
  usuario: string,
  datos: { id: string | null; areaCodigo: string | null; nombre: string; nivel: Nivel; activo: boolean },
  pagina: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc("guardar_puesto", {
    p_usuario: usuario,
    p_id: datos.id,
    p_area_codigo: datos.areaCodigo,
    p_nombre: datos.nombre,
    p_nivel: datos.nivel,
    p_activo: datos.activo,
    p_pagina: pagina,
  })
  if (error) return { ok: false, error: error.message || "No se pudo guardar el puesto." }
  return { ok: true, id: data as string }
}

export interface CambioMatriz {
  puestoId: string
  permiso: Permiso
  activo: boolean
}

/** Todo o nada: si un cambio no vale, la base no aplica ninguno. */
export async function guardarPermisosPuestos(
  usuario: string,
  cambios: CambioMatriz[],
  pagina: string,
): Promise<{ ok: true; aplicados: number } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc("guardar_permisos_puestos", {
    p_usuario: usuario,
    p_cambios: cambios.map((c) => ({ puesto_id: c.puestoId, permiso: c.permiso, activo: c.activo })),
    p_pagina: pagina,
  })
  if (error) return { ok: false, error: error.message || "No se pudieron guardar los permisos." }
  return { ok: true, aplicados: Number(data ?? 0) }
}

/** Lo que cambió entre la matriz original y la editada (puestoId → permisos marcados). */
export function diferenciasMatriz(original: PuestoEstructura[], editada: Map<string, Set<Permiso>>): CambioMatriz[] {
  const cambios: CambioMatriz[] = []
  for (const puesto of original) {
    const nuevos = editada.get(puesto.id)
    if (!nuevos) continue
    const antes = new Set(puesto.permisos)
    for (const permiso of nuevos) {
      if (!antes.has(permiso)) cambios.push({ puestoId: puesto.id, permiso, activo: true })
    }
    for (const permiso of antes) {
      if (!nuevos.has(permiso)) cambios.push({ puestoId: puesto.id, permiso, activo: false })
    }
  }
  return cambios
}

/** Rol de cada puesto de la semilla (puestos.rol_equivalente_id, migración 20261113990000). */
const ROL_DE_PUESTO: Record<string, RolCodigo> = {
  JEFE_PRODUCCION: "JEFE_PRODUCCION",
  COORDINADOR_PRODUCCION: "ANALISTA",
  SUPERVISOR: "SUPERVISOR",
  PASANTE: "SUPERVISOR",
  JEFE_MANTENIMIENTO: "MANTENIMIENTO",
  SUPERVISOR_MANTENIMIENTO: "MANTENIMIENTO",
  TECNICO_MANTENIMIENTO: "MANTENIMIENTO",
  SERVICIOS_INDUSTRIALES: "SERVICIOS_INDUSTRIALES",
  SOLO_VISTA: "VISTA",
  JEFE_CALIDAD: "CALIDAD",
  SUPERVISOR_CALIDAD: "SUPERVISOR_CALIDAD",
  ANALISTA_CALIDAD: "CALIDAD",
  PROBADOR: "SUPERVISOR",
  SUPERADMINISTRADOR: "SUPERADMINISTRADOR",
}

/**
 * Rol con el que se mira la app en «Ver como» un puesto. listar_estructura no
 * trae rol_equivalente: se usa el de la semilla y, para puestos creados
 * después, el rol que le tocaría por su área (los permisos ya salen del puesto;
 * el rol solo afecta unos pocos textos y atajos).
 */
export function rolDePuesto(puesto: Pick<PuestoEstructura, "codigo" | "areaCodigo" | "todosLosPermisos">): RolCodigo {
  const sembrado = ROL_DE_PUESTO[puesto.codigo]
  if (sembrado) return sembrado
  if (puesto.todosLosPermisos) return "SUPERVISOR"
  if (puesto.areaCodigo === "MANTENIMIENTO") return "MANTENIMIENTO"
  if (puesto.areaCodigo === "SERVICIOS_INDUSTRIALES") return "SERVICIOS_INDUSTRIALES"
  if (puesto.areaCodigo === "CALIDAD") return "CALIDAD"
  return "SUPERVISOR"
}

/** Agrupa por nivel (1 a 4) sin los niveles vacíos; los de nivel null van al final en un grupo aparte. */
export function agruparPorNivel<T extends { nivel: Nivel | null }>(
  items: T[],
): { nivel: Nivel | null; nombre: string; items: T[] }[] {
  const grupos: { nivel: Nivel | null; nombre: string; items: T[] }[] = []
  for (const { nivel, nombre } of NIVELES) {
    const delNivel = items.filter((i) => i.nivel === nivel)
    if (delNivel.length > 0) grupos.push({ nivel, nombre, items: delNivel })
  }
  const sinNivel = items.filter((i) => i.nivel === null)
  if (sinNivel.length > 0) grupos.push({ nivel: null, nombre: "Sin nivel", items: sinNivel })
  return grupos
}

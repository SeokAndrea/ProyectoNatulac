import type { ClaseParada } from "@/lib/paradas"
import { agregarFallas, guardarEquipo, guardarSistema, guardarSubsistema, type FallasAgregadas } from "./api"
import type { TipoEquipo } from "./tipos"

/*
 * «Agregar» del catálogo: crea en orden lo que sea nuevo (equipo, sistema,
 * subsistema) y después las fallas. Si algo falla a mitad, devuelve los ids de
 * lo que sí se creó, para que el formulario los deje elegidos y reintentar no
 * duplique nada.
 */

type Nivel<N> = { id: string } | { nuevo: N }

export interface PedidoAgregar {
  equipo: Nivel<{ nombre: string; sufijo: string; tipo: TipoEquipo; lineas: string[] }>
  sistema: Nivel<{ nombre: string; sufijo: string }>
  subsistema: Nivel<{ nombre: string; sufijo: string }>
  /** Vacío: solo se crean los niveles nuevos. */
  fallas: string[]
  clase: ClaseParada
}

export interface ResultadoAgregar {
  equipoId: string | null
  sistemaId: string | null
  subsistemaId: string | null
  agregadas: FallasAgregadas | null
  error: string | null
}

export async function agregarAlCatalogo(usuario: string, p: PedidoAgregar): Promise<ResultadoAgregar> {
  const r: ResultadoAgregar = { equipoId: null, sistemaId: null, subsistemaId: null, agregadas: null, error: null }

  if ("id" in p.equipo) {
    r.equipoId = p.equipo.id
  } else {
    const e = await guardarEquipo(usuario, { id: null, ...p.equipo.nuevo, activo: true })
    if (!e.ok) return { ...r, error: e.error }
    r.equipoId = e.valor
  }

  if ("id" in p.sistema) {
    r.sistemaId = p.sistema.id
  } else {
    const s = await guardarSistema(usuario, { id: null, equipoId: r.equipoId, ...p.sistema.nuevo, activo: true })
    if (!s.ok) return { ...r, error: s.error }
    r.sistemaId = s.valor
  }

  if ("id" in p.subsistema) {
    r.subsistemaId = p.subsistema.id
  } else {
    const u = await guardarSubsistema(usuario, { id: null, sistemaId: r.sistemaId, ...p.subsistema.nuevo, codigoSheet: null, activo: true })
    if (!u.ok) return { ...r, error: u.error }
    r.subsistemaId = u.valor
  }

  if (p.fallas.length > 0) {
    const f = await agregarFallas(usuario, r.subsistemaId, p.fallas, p.clase)
    if (!f.ok) return { ...r, error: f.error }
    r.agregadas = f.valor
  }
  return r
}

/** Lo que se le dice a la persona después de agregar. */
export function resumenAgregadas(a: FallasAgregadas | null): string {
  if (!a) return "Listo. Ya puedes agregarle fallas."
  const partes: string[] = []
  if (a.creadas.length === 1) partes.push(`Agregada: ${a.creadas[0].codigo} ${a.creadas[0].nombre}`)
  else if (a.creadas.length > 1) partes.push(`${a.creadas.length} fallas agregadas, de ${a.creadas[0].codigo} a ${a.creadas[a.creadas.length - 1].codigo}`)
  if (a.repetidas.length === 1) partes.push(`«${a.repetidas[0]}» ya existía`)
  else if (a.repetidas.length > 1) partes.push(`${a.repetidas.length} ya existían`)
  return partes.join(" · ")
}

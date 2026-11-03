import type { TipoParada } from "@/lib/paradas"
import { supabase } from "@/lib/supabase"
import { tienePalabras } from "@/lib/texto"
import type { CatalogoFallas, EquipoCatalogo, FallaCatalogo, SistemaCatalogo, SubsistemaCatalogo } from "./tipos"

/*
 * Las fallas del catálogo modular dentro de las paradas (migración
 * 20261113890000). La parada se registra con el tipo genérico FALLA_EQUIPO y
 * después se le pone la falla: la de Producción al Parar o Anotar, la de
 * Mantenimiento al Terminar o Poner código.
 */

/** Tipo genérico con el que se registran las paradas de equipo cuando el switch está encendido. */
export const TIPO_FALLA_EQUIPO = "FALLA_EQUIPO"

/** Una falla con todo lo que hace falta para mostrarla y elegirla. */
export interface OpcionFalla {
  falla: FallaCatalogo
  subsistema: SubsistemaCatalogo
  sistema: SistemaCatalogo
  equipo: EquipoCatalogo
}

const reservadaAlFinal = <T extends { reservada?: boolean }>(a: T, b: T) => Number(!!a.reservada) - Number(!!b.reservada)

/** Las fallas activas que se pueden elegir en una línea: las de sus equipos y las de los equipos de servicios. */
export function fallasDeLinea(c: CatalogoFallas, lineaId: string | null): OpcionFalla[] {
  const opciones: OpcionFalla[] = []
  for (const equipo of c.equipos) {
    if (!equipo.activo) continue
    if (equipo.tipo === "LINEA" && (!lineaId || !equipo.lineas.includes(lineaId))) continue
    // Lo reservado («General › Sin clasificar › Falla nueva») va al final de su equipo.
    for (const sistema of c.sistemas.filter((s) => s.activo && s.equipoId === equipo.id).sort(reservadaAlFinal)) {
      for (const subsistema of c.subsistemas.filter((u) => u.activo && u.sistemaId === sistema.id).sort(reservadaAlFinal)) {
        for (const falla of c.fallas.filter((f) => f.activo && f.subsistemaId === subsistema.id)) {
          opciones.push({ falla, subsistema, sistema, equipo })
        }
      }
    }
  }
  // Sin reordenar: sale en el orden del catálogo (equipo, sistema y subsistema por creación; fallas por número).
  return opciones
}

/** Busca por nombre de la falla, subsistema, sistema, equipo o código; sin tildes, palabras en cualquier orden. */
export const buscarFallas = (opciones: OpcionFalla[], busqueda: string, equipoId = "") =>
  opciones.filter(
    (o) =>
      (!equipoId || o.equipo.id === equipoId) &&
      tienePalabras(`${o.falla.nombre} ${o.subsistema.nombre} ${o.sistema.nombre} ${o.equipo.nombre} ${o.falla.codigo}`, busqueda),
  )

/** La opción completa de una falla por su id (para prellenar), aunque ya esté desactivada. */
export function opcionDeFalla(c: CatalogoFallas, fallaId: string | null): OpcionFalla | null {
  const falla = fallaId ? c.fallas.find((f) => f.id === fallaId) : undefined
  const subsistema = falla && c.subsistemas.find((u) => u.id === falla.subsistemaId)
  const sistema = subsistema && c.sistemas.find((s) => s.id === subsistema.sistemaId)
  const equipo = sistema && c.equipos.find((e) => e.id === sistema.equipoId)
  return falla && subsistema && sistema && equipo ? { falla, subsistema, sistema, equipo } : null
}

type Resultado = { ok: true } | { ok: false; error: string }

/** Producción, justo después de Parar o Anotar: la falla va a la parada que acaba de registrar en esa línea. */
export async function asignarFallaRecienRegistrada(usuario: string, lineaCodigo: string, fallaId: string, pagina: string): Promise<Resultado> {
  const { error } = await supabase.rpc("asignar_falla_recien_registrada", { p_usuario: usuario, p_linea_codigo: lineaCodigo, p_falla_id: fallaId, p_pagina: pagina })
  return error ? { ok: false, error: error.message || "La parada quedó registrada, pero no se le pudo poner la falla." } : { ok: true }
}

/** Ponerle la falla a una parada conocida (Mantenimiento al Terminar o Poner código). */
export async function asignarFallaParada(usuario: string, paradaId: string, fallaId: string, quien: "PRODUCCION" | "MANTENIMIENTO", pagina: string): Promise<Resultado> {
  const { error } = await supabase.rpc("asignar_falla_parada", { p_usuario: usuario, p_parada_id: paradaId, p_falla_id: fallaId, p_quien: quien, p_pagina: pagina })
  return error ? { ok: false, error: error.message || "No se pudo poner la falla." } : { ok: true }
}

export interface FallasDeParada {
  fallaProduccionId: string | null
  fallaFinalId: string | null
}

/** Las fallas que ya tiene cada parada (para prellenar lo de Mantenimiento). */
export async function leerFallasDeParadas(ids: string[]): Promise<Map<string, FallasDeParada>> {
  const mapa = new Map<string, FallasDeParada>()
  if (ids.length === 0) return mapa
  const { data, error } = await supabase.rpc("fallas_de_paradas", { p_ids: ids })
  if (error || !Array.isArray(data)) return mapa
  for (const f of data as { parada_id: string; falla_produccion_id: string | null; falla_final_id: string | null }[]) {
    mapa.set(f.parada_id, { fallaProduccionId: f.falla_produccion_id, fallaFinalId: f.falla_final_id })
  }
  return mapa
}

/**
 * La falla como «tipo» para las pantallas que ya manejan tipos (Anotar): el
 * genérico FALLA_EQUIPO con el nombre «falla · subsistema» y la clase de la falla.
 */
export const tipoDeFalla = (o: OpcionFalla): TipoParada => ({
  codigo: TIPO_FALLA_EQUIPO,
  nombre: `${o.falla.nombre} · ${o.subsistema.nombre}`,
  clase: o.falla.clase,
  familia: "EQUIPO",
  tiempoGuiaMin: null,
  prefijoPlanilla: "",
  secuenciaPlanilla: null,
})

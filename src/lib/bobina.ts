import { supabase } from "@/lib/supabase"

export interface TipoBobina {
  id: string
  nombre: string
  diametroCoreCm: number
  espesorCm: number
  largoEnvaseCm: number
  /** true = ROUNDUP (como TP en el Excel); false = redondeo al más cercano (como TB). Ver calcularEnvasesRestantes. */
  redondearHaciaArriba: boolean
  activo: boolean
}

interface FilaTipoBobina {
  tipo_id: string
  nombre: string
  diametro_core_cm: number
  espesor_cm: number
  largo_envase_cm: number
  redondear_hacia_arriba: boolean
  activo: boolean
}

export async function listarTiposBobina(): Promise<TipoBobina[]> {
  const { data, error } = await supabase.rpc("listar_tipos_bobina")
  if (error || !data) return []
  return (data as FilaTipoBobina[]).map((t) => ({
    id: t.tipo_id,
    nombre: t.nombre,
    diametroCoreCm: t.diametro_core_cm,
    espesorCm: t.espesor_cm,
    largoEnvaseCm: t.largo_envase_cm,
    redondearHaciaArriba: t.redondear_hacia_arriba,
    activo: t.activo,
  }))
}

export interface CalculoBobina {
  id: string
  tipoBobinaId: string
  tipoBobinaNombre: string
  distanciaCm: number
  envases: number
  usuario: string | null
  creadoEn: string
}

interface FilaCalculoBobina {
  id: string
  tipo_bobina_id: string
  tipo_bobina_nombre: string
  distancia_cm: number
  envases: number
  usuario: string | null
  creado_en: string
}

export async function listarCalculosBobina(fecha: string): Promise<CalculoBobina[]> {
  const { data, error } = await supabase.rpc("listar_calculos_bobina", { p_fecha: fecha })
  if (error || !data) return []
  return (data as FilaCalculoBobina[]).map((c) => ({
    id: c.id,
    tipoBobinaId: c.tipo_bobina_id,
    tipoBobinaNombre: c.tipo_bobina_nombre,
    distanciaCm: c.distancia_cm,
    envases: c.envases,
    usuario: c.usuario,
    creadoEn: c.creado_en,
  }))
}

export async function guardarCalculoBobina(
  usuario: string,
  fecha: string,
  tipoBobinaId: string,
  distanciaCm: number,
  envases: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase.rpc("guardar_calculo_bobina", {
    p_usuario: usuario,
    p_fecha: fecha,
    p_tipo_bobina_id: tipoBobinaId,
    p_distancia_cm: distanciaCm,
    p_envases: envases,
  })
  if (error) return { ok: false, error: "No se pudo guardar el cálculo. Intenta de nuevo." }
  return { ok: true }
}

/**
 * Envases restantes en una bobina de material de empaque, a partir de
 * la distancia medida del core al borde de la bobina.
 *
 * Fórmula tal cual la hoja "Cálculos" del Excel "Control de
 * Existencias" (bloques "CALCULO DE ENVASES ..."): se usa el literal
 * 3.1416, no Math.PI, para que el resultado calce con el que ya
 * conocen en planta.
 *
 * El redondeo NO es igual para todos los tipos ahí: los bloques TP
 * envuelven la fórmula en ROUNDUP, los TB no tienen ROUNDUP — se ven
 * enteros solo porque la celda está formateada como "0" (redondeo al
 * más cercano para mostrarla). `tipo.redondearHaciaArriba` replica esa
 * diferencia (ver migración 20261054).
 */
export function calcularEnvasesRestantes(
  distanciaBobinaCoreCm: number,
  tipo: Pick<TipoBobina, "diametroCoreCm" | "espesorCm" | "largoEnvaseCm" | "redondearHaciaArriba">,
): number {
  const b = distanciaBobinaCoreCm
  const valorCrudo = (3.1416 * b * (b + tipo.diametroCoreCm)) / tipo.espesorCm / tipo.largoEnvaseCm
  // Redondeado a 6 decimales antes de ceil/round: evita que un resultado
  // que "debería" ser un entero exacto caiga al de arriba por precisión
  // de punto flotante (mismo caso que calcularUnidadesPorPeso en conteoPeso.ts).
  const valor = Math.round(valorCrudo * 1e6) / 1e6
  return tipo.redondearHaciaArriba ? Math.ceil(valor) : Math.round(valor)
}

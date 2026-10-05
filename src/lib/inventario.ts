import { supabase } from "@/lib/supabase"
import { unidadPreparacion } from "@/lib/sabores"

/*
 * Inventario diario de materia prima (etapa 1: tambores y kits por
 * sabor) — migración 20261103. Saldo = último conteo − tambores/kits de
 * las preparaciones creadas después; la analista confirma o corrige en
 * el Inventario diario (mañana y tarde) y anota lo que llegó.
 */

type Resultado = { ok: true } | { ok: false; error: string }

export type AreaInventario = "ASEPTICO" | "PRUEBAS"

export interface FilaInventario {
  areaCodigo: AreaInventario
  saborId: string
  saborNombre: string
  familiaNombre: string
  saborActivo: boolean
  unidad: "tambores" | "kits"
  /** null = el sabor nunca se contó en esta área. */
  ultimoEn: string | null
  ultimoPor: string | null
  ultimoContado: number | null
  ultimoLlego: number | null
  /** contado − (sistema + llegó) del último conteo: negativo = faltante. null en el primer conteo. */
  ultimaDiferencia: number | null
  /** Tambores/kits de las preparaciones creadas después del último conteo. */
  consumido: number | null
  preparaciones: number | null
  /** Lo que debería haber ahora. null si nunca se contó. */
  saldo: number | null
}

interface FilaRpc {
  area_codigo: AreaInventario
  sabor_id: string
  sabor_nombre: string
  sabor_base: string
  familia_nombre: string
  sabor_activo: boolean
  ultimo_en: string | null
  ultimo_por: string | null
  ultimo_contado: number | null
  ultimo_llego: number | null
  ultima_diferencia: number | null
  consumido: number | null
  preparaciones: number | null
  saldo: number | null
}

export async function listarInventario(usuario: string, area: AreaInventario | null): Promise<FilaInventario[]> {
  const { data, error } = await supabase.rpc("listar_inventario_mp", { p_usuario: usuario, p_area_codigo: area })
  if (error || !data) return []
  return (data as FilaRpc[]).map((f) => ({
    areaCodigo: f.area_codigo,
    saborId: f.sabor_id,
    saborNombre: f.sabor_nombre,
    familiaNombre: f.familia_nombre,
    saborActivo: f.sabor_activo,
    unidad: unidadPreparacion(`${f.sabor_base} ${f.familia_nombre}`),
    ultimoEn: f.ultimo_en,
    ultimoPor: f.ultimo_por,
    ultimoContado: f.ultimo_contado,
    ultimoLlego: f.ultimo_llego,
    ultimaDiferencia: f.ultima_diferencia,
    consumido: f.consumido,
    preparaciones: f.preparaciones,
    saldo: f.saldo,
  }))
}

export interface ConteoInventario {
  saborId: string
  contado: number
  llego: number
}

/** Guarda el Inventario diario: un conteo por sabor, todo junto. */
export async function registrarInventario(usuario: string, conteos: ConteoInventario[], area: AreaInventario | null): Promise<Resultado> {
  const { error } = await supabase.rpc("registrar_inventario_mp", {
    p_usuario: usuario,
    p_items: conteos.map((c) => ({ sabor_id: c.saborId, contado: c.contado, llego: c.llego })),
    p_area_codigo: area,
  })
  if (error) return { ok: false, error: error.message || "No se pudo guardar el inventario. Intenta de nuevo." }
  return { ok: true }
}

export interface MovimientoInventario {
  tipo: "CONTEO" | "CONSUMO"
  en: string
  /** CONTEO: lo contado. CONSUMO: tambores/kits de la preparación. */
  cantidad: number
  sistema: number | null
  llego: number | null
  diferencia: number | null
  /** CONSUMO: "Lote 0003 · Turno T1-0510 · Tanque 2". */
  detalle: string | null
  usuarioNombre: string | null
}

export async function historialInventario(
  usuario: string,
  saborId: string,
  area: AreaInventario | null,
  dias = 7,
): Promise<MovimientoInventario[]> {
  const { data, error } = await supabase.rpc("historial_inventario_mp", {
    p_usuario: usuario,
    p_sabor_id: saborId,
    p_dias: dias,
    p_area_codigo: area,
  })
  if (error || !data) return []
  return (
    data as {
      tipo: "CONTEO" | "CONSUMO"
      en: string
      cantidad: number
      sistema: number | null
      llego: number | null
      diferencia: number | null
      detalle: string | null
      usuario_nombre: string | null
    }[]
  ).map((m) => ({
    tipo: m.tipo,
    en: m.en,
    cantidad: m.cantidad,
    sistema: m.sistema,
    llego: m.llego,
    diferencia: m.diferencia,
    detalle: m.detalle,
    usuarioNombre: m.usuario_nombre,
  }))
}

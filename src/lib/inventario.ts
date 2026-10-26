import { supabase } from "@/lib/supabase"

/*
 * Inventario diario (migración 20261103): "Inventario de la mañana" /
 * "de la tarde", en dos secciones — Materia prima (pulpa y kits por
 * sabor) y Material de empaque (lista fija). Solo la pulpa se descuenta
 * sola: saldo = último conteo − tambores de las preparaciones creadas
 * después. Kits y empaque quedan con lo último que se contó.
 */

type Resultado = { ok: true } | { ok: false; error: string }

export type AreaInventario = "ASEPTICO" | "PRUEBAS"
export type Momento = "MANANA" | "TARDE"
export type TipoItem = "PULPA" | "KITS" | "EMPAQUE"

export interface ItemInventario {
  areaCodigo: AreaInventario
  seccion: "MATERIA_PRIMA" | "EMPAQUE"
  /** 'PULPA:<sabor>' | 'KITS:<sabor>' | 'EMPAQUE:<codigo>'. */
  item: string
  tipo: TipoItem
  saborId: string | null
  empaqueCodigo: string | null
  /** Sabor (con su familia) o item de empaque. */
  nombre: string
  /** "tambores", "kits", "cajas", "unidades", "rollos". */
  unidad: string
  /** null = nunca se contó en esta área. */
  ultimoEn: string | null
  ultimoPor: string | null
  ultimoMomento: Momento | null
  ultimoContado: number | null
  /** Solo pulpa: contado − lo que esperaba el sistema (negativo = faltante). */
  ultimaDiferencia: number | null
  /** Solo pulpa: tambores de las preparaciones creadas después del último conteo. */
  consumido: number | null
  preparaciones: number | null
  /** Lo que debería haber ahora. null si nunca se contó. */
  saldo: number | null
}

interface ItemRpc {
  area_codigo: AreaInventario
  seccion: "MATERIA_PRIMA" | "EMPAQUE"
  item: string
  tipo: TipoItem
  sabor_id: string | null
  empaque_codigo: string | null
  nombre: string
  unidad: string
  ultimo_en: string | null
  ultimo_por: string | null
  ultimo_momento: Momento | null
  ultimo_contado: number | null
  ultima_diferencia: number | null
  consumido: number | null
  preparaciones: number | null
  saldo: number | null
}

async function listarInventario(usuario: string, area: AreaInventario | null): Promise<ItemInventario[]> {
  const { data, error } = await supabase.rpc("listar_inventario", { p_usuario: usuario, p_area_codigo: area })
  if (error || !data) return []
  return (data as ItemRpc[]).map((f) => ({
    areaCodigo: f.area_codigo,
    seccion: f.seccion,
    item: f.item,
    tipo: f.tipo,
    saborId: f.sabor_id,
    empaqueCodigo: f.empaque_codigo,
    nombre: f.nombre,
    unidad: f.unidad,
    ultimoEn: f.ultimo_en,
    ultimoPor: f.ultimo_por,
    ultimoMomento: f.ultimo_momento,
    ultimoContado: f.ultimo_contado,
    ultimaDiferencia: f.ultima_diferencia,
    consumido: f.consumido,
    preparaciones: f.preparaciones,
    saldo: f.saldo,
  }))
}

export interface ConteoInventario {
  tipo: TipoItem
  saborId: string | null
  empaqueCodigo: string | null
  contado: number
}

async function registrarInventario(
  usuario: string,
  momento: Momento,
  conteos: ConteoInventario[],
  area: AreaInventario | null,
): Promise<Resultado> {
  const { error } = await supabase.rpc("registrar_inventario", {
    p_usuario: usuario,
    p_momento: momento,
    p_items: conteos.map((c) => ({ tipo: c.tipo, sabor_id: c.saborId, empaque_codigo: c.empaqueCodigo, contado: c.contado })),
    p_area_codigo: area,
  })
  if (error) return { ok: false, error: error.message || "No se pudo guardar el inventario. Intenta de nuevo." }
  return { ok: true }
}

/** Un inventario ya hecho (de la mañana o de la tarde). */
export interface InventarioHecho {
  id: string
  momento: Momento
  en: string
  usuarioNombre: string | null
  items: number
  faltantes: number
  sobrantes: number
}

async function listarInventarios(usuario: string, area: AreaInventario | null): Promise<InventarioHecho[]> {
  const { data, error } = await supabase.rpc("listar_inventarios", { p_usuario: usuario, p_dias: 7, p_area_codigo: area })
  if (error || !data) return []
  return (
    data as { id: string; momento: Momento; en: string; usuario_nombre: string | null; items: number; faltantes: number; sobrantes: number }[]
  ).map((i) => ({
    id: i.id,
    momento: i.momento,
    en: i.en,
    usuarioNombre: i.usuario_nombre,
    items: i.items,
    faltantes: i.faltantes,
    sobrantes: i.sobrantes,
  }))
}

export interface MovimientoInventario {
  movimiento: "CONTEO" | "CONSUMO"
  en: string
  momento: Momento | null
  /** CONTEO: lo contado. CONSUMO: tambores de la preparación. */
  cantidad: number
  sistema: number | null
  diferencia: number | null
  /** CONSUMO: "Lote 0003 · Turno T1-0510 · Tanque 2". */
  detalle: string | null
  usuarioNombre: string | null
}

async function historialInventario(usuario: string, item: ItemInventario, area: AreaInventario | null): Promise<MovimientoInventario[]> {
  const { data, error } = await supabase.rpc("historial_inventario", {
    p_usuario: usuario,
    p_tipo: item.tipo,
    p_sabor_id: item.saborId,
    p_empaque_codigo: item.empaqueCodigo,
    p_dias: 7,
    p_area_codigo: area,
  })
  if (error || !data) return []
  return (
    data as {
      movimiento: "CONTEO" | "CONSUMO"
      en: string
      momento: Momento | null
      cantidad: number
      sistema: number | null
      diferencia: number | null
      detalle: string | null
      usuario_nombre: string | null
    }[]
  ).map((m) => ({
    movimiento: m.movimiento,
    en: m.en,
    momento: m.momento,
    cantidad: m.cantidad,
    sistema: m.sistema,
    diferencia: m.diferencia,
    detalle: m.detalle,
    usuarioNombre: m.usuario_nombre,
  }))
}

/** Lo que la pantalla necesita del inventario. Real (Supabase) o de muestra (ver inventarioDemo.ts). */
export interface InventarioApi {
  listar: (usuario: string, area: AreaInventario | null) => Promise<ItemInventario[]>
  inventarios: (usuario: string, area: AreaInventario | null) => Promise<InventarioHecho[]>
  registrar: (usuario: string, momento: Momento, conteos: ConteoInventario[], area: AreaInventario | null) => Promise<Resultado>
  historial: (usuario: string, item: ItemInventario, area: AreaInventario | null) => Promise<MovimientoInventario[]>
}

export const inventarioReal: InventarioApi = {
  listar: listarInventario,
  inventarios: listarInventarios,
  registrar: registrarInventario,
  historial: historialInventario,
}

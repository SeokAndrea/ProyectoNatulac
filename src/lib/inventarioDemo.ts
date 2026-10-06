import type { ConteoInventario, InventarioApi, InventarioHecho, ItemInventario, Momento, MovimientoInventario } from "@/lib/inventario"

/*
 * Modo de muestra del Inventario diario (/inventario?demo=1): sabores,
 * empaque y saldos inventados, en memoria, para ver la pantalla y el
 * flujo sin la migración 20261103 aplicada. Nada llega a Supabase; se
 * pierde al recargar la página.
 */

const hace = (min: number) => new Date(Date.now() - min * 60000).toISOString()
const QUIEN = "Analista (muestra)"

let items: ItemInventario[] | null = null
let hechos: InventarioHecho[] = []
let movimientos: Record<string, MovimientoInventario[]> = {}

function base(over: Partial<ItemInventario> & Pick<ItemInventario, "item" | "tipo" | "nombre" | "unidad">): ItemInventario {
  return {
    areaCodigo: "PRUEBAS",
    seccion: over.tipo === "EMPAQUE" ? "EMPAQUE" : "MATERIA_PRIMA",
    saborId: null,
    empaqueCodigo: null,
    ultimoEn: null,
    ultimoPor: null,
    ultimoMomento: null,
    ultimoContado: null,
    ultimaDiferencia: null,
    consumido: null,
    preparaciones: null,
    saldo: null,
    ...over,
  }
}

const CONTEO_MANANA = 200

/** Pulpa y kits de un sabor. `pulpa`/`kits` = lo contado en la mañana (null = sin contar). */
function sabor(id: string, nombre: string, pulpa: number | null, kits: number | null, preps: { tambores: number; haceMin: number; lote: string; tanque: number }[] = []) {
  const consumido = preps.reduce((a, p) => a + p.tambores, 0)
  const contado = (n: number | null): Partial<ItemInventario> =>
    n === null ? {} : { ultimoEn: hace(CONTEO_MANANA), ultimoPor: QUIEN, ultimoMomento: "MANANA", ultimoContado: n }
  const pulpaItem = base({
    item: `PULPA:${id}`,
    tipo: "PULPA",
    saborId: id,
    nombre,
    unidad: "tambores",
    ...contado(pulpa),
    consumido: pulpa === null ? null : consumido,
    preparaciones: pulpa === null ? null : preps.length,
    saldo: pulpa === null ? null : pulpa - consumido,
  })
  const kitsItem = base({ item: `KITS:${id}`, tipo: "KITS", saborId: id, nombre, unidad: "kits", ...contado(kits), saldo: kits })
  movimientos[pulpaItem.item] = [
    ...preps.map((p) => ({
      movimiento: "CONSUMO" as const,
      en: hace(p.haceMin),
      momento: null,
      cantidad: p.tambores,
      sistema: null,
      diferencia: null,
      detalle: `Lote ${p.lote} · Turno T1-MUESTRA · Tanque ${p.tanque}`,
      usuarioNombre: "Supervisor (muestra)",
    })),
    ...(pulpa === null ? [] : [conteo("MANANA", hace(CONTEO_MANANA), pulpa, null, null)]),
  ]
  movimientos[kitsItem.item] = kits === null ? [] : [conteo("MANANA", hace(CONTEO_MANANA), kits, null, null)]
  return [pulpaItem, kitsItem]
}

function conteo(momento: Momento, en: string, cantidad: number, sistema: number | null, diferencia: number | null): MovimientoInventario {
  return { movimiento: "CONTEO", en, momento, cantidad, sistema, diferencia, detalle: null, usuarioNombre: QUIEN }
}

function empaque(codigo: string, nombre: string, unidad: string, contado: number | null): ItemInventario {
  const it = base({
    item: `EMPAQUE:${codigo}`,
    tipo: "EMPAQUE",
    empaqueCodigo: codigo,
    nombre,
    unidad,
    ...(contado === null ? {} : { ultimoEn: hace(CONTEO_MANANA), ultimoPor: QUIEN, ultimoMomento: "MANANA" as const, ultimoContado: contado }),
    saldo: contado,
  })
  movimientos[it.item] = contado === null ? [] : [conteo("MANANA", hace(CONTEO_MANANA), contado, null, null)]
  return it
}

function datosIniciales(): ItemInventario[] {
  movimientos = {}
  hechos = [{ id: "demo-1", momento: "MANANA", en: hace(CONTEO_MANANA), usuarioNombre: QUIEN, items: 9, faltantes: 0, sobrantes: 0 }]
  return [
    ...sabor("durazno", "Durazno", 40, 12, [
      { tambores: 4, haceMin: 150, lote: "0101", tanque: 1 },
      { tambores: 4, haceMin: 90, lote: "0102", tanque: 2 },
      { tambores: 4, haceMin: 30, lote: "0103", tanque: 3 },
    ]),
    ...sabor("manzana", "Manzana", 15, 6),
    ...sabor("pera", "Pera", 11, 4, [{ tambores: 2, haceMin: 60, lote: "0201", tanque: 2 }]),
    ...sabor("naranja", "Naranja", null, null),
    ...sabor("te-limon", "Té de Limón", null, 22),
    empaque("CAJAS_1000", "Cajas 1000 ml", "cajas", 850),
    empaque("CAJAS_500", "Cajas 500 ml", "cajas", 1200),
    empaque("CAJAS_330", "Cajas 330 ml", "cajas", null),
    empaque("CAJAS_250", "Cajas 250 ml", "cajas", 640),
    empaque("CAJAS_200", "Cajas 200 ml", "cajas", null),
    empaque("TAPAS_BLANCAS", "Tapas blancas", "unidades", 24000),
    empaque("TAPAS_VERDES", "Tapas verdes", "unidades", 9000),
    empaque("PITILLOS_200", "Pitillos 200", "unidades", null),
    empaque("PITILLOS_250", "Pitillos 250", "unidades", 15000),
    empaque("POLISTRECH_PALETIZADO", "Polistrech paletizado", "rollos", 8),
    empaque("POLISTRECH_MANUAL", "Polistrech manual", "rollos", 3),
  ]
}

export const inventarioDemo: InventarioApi = {
  async listar() {
    items ??= datosIniciales()
    return items.map((i) => ({ ...i }))
  },

  async inventarios() {
    items ??= datosIniciales()
    return [...hechos]
  },

  async registrar(_usuario: string, momento: Momento, conteos: ConteoInventario[]) {
    items ??= datosIniciales()
    const ahora = new Date().toISOString()
    let faltantes = 0
    let sobrantes = 0
    for (const c of conteos) {
      const it = items.find((x) => x.tipo === c.tipo && x.saborId === c.saborId && x.empaqueCodigo === c.empaqueCodigo)
      if (!it) continue
      const sistema = it.tipo === "PULPA" ? it.saldo : null
      const diferencia = sistema === null ? null : c.contado - sistema
      if (diferencia !== null && diferencia < 0) faltantes++
      if (diferencia !== null && diferencia > 0) sobrantes++
      movimientos[it.item] = [conteo(momento, ahora, c.contado, sistema, diferencia), ...(movimientos[it.item] ?? [])]
      Object.assign(it, {
        ultimoEn: ahora,
        ultimoPor: QUIEN,
        ultimoMomento: momento,
        ultimoContado: c.contado,
        ultimaDiferencia: diferencia,
        consumido: it.tipo === "PULPA" ? 0 : null,
        preparaciones: it.tipo === "PULPA" ? 0 : null,
        saldo: c.contado,
      })
    }
    hechos = [{ id: `demo-${hechos.length + 1}`, momento, en: ahora, usuarioNombre: QUIEN, items: conteos.length, faltantes, sobrantes }, ...hechos]
    return { ok: true as const }
  },

  async historial(_usuario: string, item: ItemInventario) {
    items ??= datosIniciales()
    return [...(movimientos[item.item] ?? [])]
  },
}

import type { AreaInventario, ConteoInventario, FilaInventario, InventarioApi, MovimientoInventario } from "@/lib/inventario"

/*
 * Modo de muestra del Inventario diario (/inventario?demo=1): sabores y
 * saldos inventados, en memoria, para ver la pantalla y el flujo sin la
 * migración 20261103 aplicada. Nada llega a Supabase; se pierde al
 * recargar la página.
 */

const hace = (min: number) => new Date(Date.now() - min * 60000).toISOString()
const QUIEN = "Analista (muestra)"

let filas: FilaInventario[] | null = null
let movimientos: Record<string, MovimientoInventario[]> = {}

function fila(
  saborId: string,
  saborNombre: string,
  unidad: FilaInventario["unidad"],
  conteo: { contado: number; llego?: number; diferencia: number | null; haceMin: number } | null,
  preps: { tambores: number; haceMin: number; lote: string; tanque: number }[] = [],
): FilaInventario {
  const consumido = preps.reduce((a, p) => a + p.tambores, 0)
  movimientos[saborId] = [
    ...preps.map((p) => ({
      tipo: "CONSUMO" as const,
      en: hace(p.haceMin),
      cantidad: p.tambores,
      sistema: null,
      llego: null,
      diferencia: null,
      detalle: `Lote ${p.lote} · Turno T1-MUESTRA · Tanque ${p.tanque}`,
      usuarioNombre: "Supervisor (muestra)",
    })),
    ...(conteo
      ? [
          {
            tipo: "CONTEO" as const,
            en: hace(conteo.haceMin),
            cantidad: conteo.contado,
            sistema: conteo.diferencia === null ? null : conteo.contado - (conteo.llego ?? 0) - conteo.diferencia,
            llego: conteo.llego ?? 0,
            diferencia: conteo.diferencia,
            detalle: null,
            usuarioNombre: QUIEN,
          },
        ]
      : []),
  ]
  return {
    areaCodigo: "PRUEBAS",
    saborId,
    saborNombre,
    familiaNombre: "Muestra",
    saborActivo: true,
    unidad,
    ultimoEn: conteo ? hace(conteo.haceMin) : null,
    ultimoPor: conteo ? QUIEN : null,
    ultimoContado: conteo?.contado ?? null,
    ultimoLlego: conteo?.llego ?? null,
    ultimaDiferencia: conteo?.diferencia ?? null,
    consumido: conteo ? consumido : null,
    preparaciones: conteo ? preps.length : null,
    saldo: conteo ? conteo.contado - consumido : null,
  }
}

function datosIniciales(): FilaInventario[] {
  movimientos = {}
  return [
    fila("d-durazno", "Durazno", "tambores", { contado: 40, llego: 20, diferencia: -1, haceMin: 200 }, [
      { tambores: 4, haceMin: 150, lote: "0101", tanque: 1 },
      { tambores: 4, haceMin: 90, lote: "0102", tanque: 2 },
      { tambores: 4, haceMin: 30, lote: "0103", tanque: 3 },
    ]),
    fila("d-manzana", "Manzana", "tambores", { contado: 15, diferencia: 0, haceMin: 200 }),
    fila("d-pera", "Pera", "tambores", { contado: 11, diferencia: 2, haceMin: 200 }, [{ tambores: 2, haceMin: 60, lote: "0201", tanque: 2 }]),
    fila("d-naranja", "Naranja", "tambores", null),
    fila("d-mango", "Mango", "kits", { contado: 40, diferencia: 0, haceMin: 200 }, [{ tambores: 6, haceMin: 45, lote: "0301", tanque: 1 }]),
    fila("d-te-limon", "Té de Limón", "kits", { contado: 22, diferencia: -2, haceMin: 200 }),
  ]
}

export const inventarioDemo: InventarioApi = {
  async listar(_usuario: string, _area: AreaInventario | null) {
    filas ??= datosIniciales()
    return filas.map((f) => ({ ...f }))
  },

  async registrar(_usuario: string, conteos: ConteoInventario[]) {
    filas ??= datosIniciales()
    const ahora = new Date().toISOString()
    for (const c of conteos) {
      const f = filas.find((x) => x.saborId === c.saborId)
      if (!f) continue
      const sistema = f.saldo
      const diferencia = sistema === null ? null : c.contado - (sistema + c.llego)
      movimientos[f.saborId] = [
        { tipo: "CONTEO", en: ahora, cantidad: c.contado, sistema, llego: c.llego, diferencia, detalle: null, usuarioNombre: QUIEN },
        ...(movimientos[f.saborId] ?? []),
      ]
      Object.assign(f, {
        ultimoEn: ahora,
        ultimoPor: QUIEN,
        ultimoContado: c.contado,
        ultimoLlego: c.llego,
        ultimaDiferencia: diferencia,
        consumido: 0,
        preparaciones: 0,
        saldo: c.contado,
      })
    }
    return { ok: true as const }
  },

  async historial(_usuario: string, saborId: string) {
    filas ??= datosIniciales()
    return [...(movimientos[saborId] ?? [])]
  },
}

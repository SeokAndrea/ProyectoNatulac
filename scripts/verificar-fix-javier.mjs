/*
 * SOLO LECTURA. Verifica el fix histórico: recalcula la merma de
 * semielaborado del Turno 2 de Javier (2026-09-15) tal como la vería
 * turno_detalle() HOY, después del UPDATE manual a
 * turnos.volumenes_lote_cierre. Debería mostrar fin=2000 para el lote
 * 0002 (no 2960) y una merma razonable (no 96.53%).
 */
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"

const ROOT = "C:/Users/JefeAseptico/Documents/natulac-aseptico"
const env = {}
for (const line of readFileSync(`${ROOT}/.env.local`, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

const USUARIO = process.argv[2] || "agomez"
const TURNO_JAVIER = "8a41f5b8-0323-427b-93c1-2423440aa2f8"
const n = (x) => (x === null || x === undefined ? 0 : Number(x))
const r2 = (x) => Math.round(x * 100) / 100
const MARGEN = 1.05

async function main() {
  const { data: t, error } = await supabase.rpc("turno_detalle", { p_usuario: USUARIO, p_turno_id: TURNO_JAVIER })
  if (error) return console.error(error.message)

  const preps = t.preparaciones ?? []
  const corridas = t.lineas ?? []
  const pts = t.producto_terminado ?? []

  console.log("== Lote 0002 visto por el turno de Javier (T2), HOY ==")
  const lote0002 = preps.find((p) => p.lote === "0002")
  console.log(lote0002)

  const loteIds = new Set()
  for (const c of corridas) if (c.lote_id !== null) loteIds.add(c.lote_id)
  for (const p of preps) if (p.turno_id === t.id) loteIds.add(p.id)

  const ptPorLote = new Map()
  let ptSinLote = 0
  for (const pt of pts) {
    const corrida = pt.turno_linea_id ? corridas.find((c) => c.id === pt.turno_linea_id) : null
    const loteId = corrida?.lote_id ?? null
    if (loteId === null) {
      ptSinLote += n(pt.litros_producidos)
      continue
    }
    ptPorLote.set(loteId, (ptPorLote.get(loteId) ?? 0) + n(pt.litros_producidos))
    loteIds.add(loteId)
  }

  let consumo = 0
  let producido = 0
  let sinContraste = ptSinLote

  console.log("\n== Recálculo de merma semielaborado, Turno 2 (Javier), con el dato corregido ==")
  for (const loteId of loteIds) {
    const lote = preps.find((p) => p.id === loteId)
    const ptLote = ptPorLote.get(loteId) ?? 0
    if (!lote) {
      sinContraste += ptLote
      continue
    }
    const inicio = lote.volumen_l_inicio ?? lote.volumen_inicial_l
    const fin = n(lote.volumen_l)
    const vi = lote.volumen_inicial_l
    const tramo = inicio === null || inicio === undefined ? null : n(inicio) - fin
    const ptExcede = vi != null && n(vi) > 0 && ptLote > n(vi) * MARGEN
    let out
    if (tramo === null || tramo <= 0 || ptExcede) {
      sinContraste += ptLote
      out = "FUERA (" + (tramo === null ? "sin inicio" : tramo <= 0 ? `tramo<=0 (${r2(tramo)})` : "PT excede vol preparado") + ")"
    } else {
      consumo += tramo
      producido += ptLote
      out = `dentro (consumo ${r2(tramo)}, PT ${r2(ptLote)})`
    }
    console.log(`  lote ${lote.lote} (${loteId.slice(0, 8)}) inicio=${n(inicio)} fin=${fin} vi=${n(vi)} ptLote=${r2(ptLote)} → ${out}`)
  }

  const merma = consumo <= 0 ? null : r2((1 - producido / consumo) * 100)
  console.log("\n== RESULTADO ==")
  console.log({ consumo_l: r2(consumo), producido_l: r2(producido), litrosSinContraste: Math.round(sinContraste), merma_semielaborado_pct: merma })
}

main().catch((e) => console.error(e))

/*
 * SOLO LECTURA. Trae el turno EN VIVO de un área (misma RPC que el Panel:
 * estado_planta_actual + turno_json) y reproduce, paso a paso, los dos
 * cálculos de merma del frontend (mermaCorrida / mermaSemielaboradoTurno)
 * para ver de dónde sale un 100%.
 *
 *   node monitor-merma-turno-activo.mjs [AREA]   (default ASEPTICO)
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

const AREA = process.argv[2] || "ASEPTICO"
const n = (x) => (x === null || x === undefined ? 0 : Number(x))
const r2 = (x) => Math.round(x * 100) / 100

async function main() {
  const { data: cab, error: e1 } = await supabase.rpc("estado_planta_actual", { p_area_codigo: AREA })
  if (e1) return console.error("estado_planta_actual:", e1.message)
  if (!cab) return console.log(`Sin turno en vivo para ${AREA}.`)

  console.log("== TURNO EN VIVO ==")
  console.log({
    area: AREA,
    codigo: cab.codigo,
    estado: cab.estado,
    fecha: cab.fecha,
    tipo: cab.turno_tipo_codigo,
    supervisor: cab.supervisor_nombre || cab.supervisor_usuario,
    hora_inicio: cab.hora_inicio,
  })

  const { data: tj, error: e2 } = await supabase.rpc("turno_json", { p_turno_id: cab.id })
  if (e2) return console.error("turno_json:", e2.message)

  const { data: presRaw } = await supabase.rpc("listar_presentaciones")
  const pres = new Map(
    (presRaw ?? []).map((p) => [
      Number(p.volumen_ml),
      { volumenMl: Number(p.volumen_ml), envasesXCaja: n(p.envases_x_caja), cajasXPaleta: n(p.cajas_x_paleta), litrosXCaja: n(p.litros_x_caja) },
    ]),
  )

  const corridas = tj.lineas ?? []
  const contadores = tj.contadores ?? []
  const pts = tj.producto_terminado ?? []
  const preps = tj.preparaciones ?? []

  console.log("\n== LÍNEAS / CONDICIÓN ==")
  for (const le of tj.lineas_estado ?? []) console.log(" ", le.linea_codigo, "→", le.condicion, le.observacion ? `(${le.observacion})` : "")

  console.log("\n== CORRIDAS ==")
  for (const c of corridas) {
    console.log(" ", {
      id: c.id.slice(0, 8),
      linea: c.linea_codigo,
      pres_ml: c.presentacion_volumen_ml,
      sabor: c.sabor_nombre,
      lote: c.lote,
      lote_id: c.lote_id ? c.lote_id.slice(0, 8) : null,
      activa: c.activa,
      pausada: !!c.pausada_en,
      lote_terminado: !!c.lote_terminado_en,
      finalizada: !!c.finalizada_en,
      esperandoPT: !c.activa && c.finalizada_en === null,
    })
  }

  console.log("\n== CONTADORES ==")
  for (const ct of contadores) {
    console.log("  corrida", (ct.turno_linea_id || "—").slice(0, 8), {
      envases_llenadora: n(ct.envases_llenadora),
      envases_buenos: ct.envases_buenos,
      parcial: ct.parcial,
      justif: ct.justificacion,
    })
  }

  console.log("\n== PRODUCTO TERMINADO ==")
  for (const p of pts) {
    const pr = pres.get(Number(p.presentacion_volumen_ml))
    const envasesPt = (n(p.paletas) * (pr?.cajasXPaleta ?? 0) + n(p.cajas_sueltas)) * (pr?.envasesXCaja ?? 0)
    console.log("  corrida", (p.turno_linea_id || "—").slice(0, 8), {
      pres_ml: p.presentacion_volumen_ml,
      pres_en_catalogo: !!pr,
      paletas: n(p.paletas),
      cajas_sueltas: n(p.cajas_sueltas),
      litros_producidos: n(p.litros_producidos),
      envasesPt_calc: envasesPt,
      retenido: p.producto_retenido,
    })
  }

  console.log("\n== PREPARACIONES (lotes) ==")
  for (const pp of preps) {
    console.log("  lote", pp.id.slice(0, 8), {
      lote: pp.lote,
      sabor: pp.sabor_nombre,
      turno_propio: pp.turno_id === cab.id,
      vol_inicio: pp.volumen_l_inicio,
      vol_inicial_l: pp.volumen_inicial_l,
      vol_l_ahora: pp.volumen_l,
      liberado: !!pp.liberado_en,
      cerrado: !!pp.cerrado_en,
    })
  }

  // ---------- MERMA DE ENVASE (reproduce mermaCorrida + mermaEnvasesDeCorridas) ----------
  console.log("\n== MERMA DE ENVASE — por corrida ==")
  let llTot = 0
  let realTot = 0
  let algunaComparable = false
  const corridaIds = new Set(contadores.map((c) => c.turno_linea_id).filter(Boolean))
  for (const id of corridaIds) {
    const llenadora = contadores
      .filter((c) => c.turno_linea_id === id && !c.parcial)
      .reduce((a, c) => a + n(c.envases_llenadora), 0)
    const pt = pts.find((p) => p.turno_linea_id === id)
    if (llenadora === 0 || !pt) {
      console.log("  corrida", id.slice(0, 8), "→ NO comparable (llenadora=" + llenadora + ", PT=" + (pt ? "sí" : "no") + ") → no cuenta")
      continue
    }
    const pr = pres.get(Number(pt.presentacion_volumen_ml))
    const envasesPt = (n(pt.paletas) * (pr?.cajasXPaleta ?? 0) + n(pt.cajas_sueltas)) * (pr?.envasesXCaja ?? 0)
    const pct = r2((1 - envasesPt / llenadora) * 100)
    algunaComparable = true
    llTot += llenadora
    realTot += envasesPt
    console.log("  corrida", id.slice(0, 8), { llenadora, envasesPt, pct: pct + "%", pres_en_catalogo: !!pr })
  }
  const mermaEnv = !algunaComparable || llTot === 0 ? null : r2((1 - realTot / llTot) * 100)
  console.log("  → MERMA DE ENVASE TURNO:", mermaEnv === null ? "— (nada comparable)" : mermaEnv + "%", `(llenadora ${llTot}, PT ${realTot})`)

  // ---------- MERMA DE SEMIELABORADO (reproduce mermaSemielaboradoTurno) ----------
  console.log("\n== RENDIMIENTO / MERMA SEMIELABORADO ==")
  const MARGEN = 1.05
  const loteIds = new Set()
  for (const c of corridas) if (c.lote_id) loteIds.add(c.lote_id)
  for (const p of preps) if (p.turno_id === cab.id) loteIds.add(p.id)
  const ptPorLote = new Map()
  let ptSinLote = 0
  for (const p of pts) {
    const c = p.turno_linea_id ? corridas.find((l) => l.id === p.turno_linea_id) : null
    const loteId = c?.lote_id ?? null
    if (loteId === null) {
      ptSinLote += n(p.litros_producidos)
      continue
    }
    ptPorLote.set(loteId, (ptPorLote.get(loteId) ?? 0) + n(p.litros_producidos))
    loteIds.add(loteId)
  }
  let consumo = 0
  let producido = 0
  let sinContraste = ptSinLote
  for (const loteId of loteIds) {
    const lote = preps.find((p) => p.id === loteId)
    const ptLote = ptPorLote.get(loteId) ?? 0
    if (!lote) {
      sinContraste += ptLote
      console.log("  lote", loteId.slice(0, 8), "→ sin fila de preparación → PT", ptLote, "sin contraste")
      continue
    }
    const inicio = lote.volumen_l_inicio ?? lote.volumen_inicial_l
    const fin = n(lote.volumen_l)
    const vi = lote.volumen_inicial_l
    const tramo = inicio === null || inicio === undefined ? null : n(inicio) - fin
    const ptExcede = vi != null && n(vi) > 0 && ptLote > n(vi) * MARGEN
    let out = ""
    if (tramo === null || tramo <= 0 || ptExcede) {
      sinContraste += ptLote
      out = "→ FUERA (" + (tramo === null ? "sin inicio" : tramo <= 0 ? "tramo<=0 (" + tramo + ")" : "PT excede vol preparado") + ")"
    } else {
      consumo += tramo
      producido += ptLote
      out = "→ dentro (consumo " + r2(tramo) + ", PT " + r2(ptLote) + ")"
    }
    console.log("  lote", loteId.slice(0, 8), lote.lote, { inicio: n(inicio), fin, vi: n(vi), ptLote: r2(ptLote) }, out)
  }
  const rend = consumo <= 0 ? null : r2((1 - producido / consumo) * 100)
  console.log("  → MERMA SEMIELABORADO:", rend === null ? "— (consumo 0)" : rend + "%", `(consumo ${r2(consumo)}, PT ${r2(producido)}, sin contraste ${Math.round(sinContraste)})`)
}

main().catch((e) => console.error(e))

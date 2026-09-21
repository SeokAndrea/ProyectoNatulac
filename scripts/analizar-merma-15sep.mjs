/*
 * SOLO LECTURA. Trae todos los turnos de ASEPTICO y VACIO del 2026-09-15
 * y calcula la merma de semielaborado a NIVEL DE DÍA (agregando lotes y PT
 * de los 3 turnos), para evitar el artefacto de partir un lote que cruza
 * de turno en dos mitades (una sin PT, otra con PT pero "excede volumen").
 *
 *   node analizar-merma-15sep.mjs <usuario_superadmin>
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

const USUARIO = process.argv[2]
if (!USUARIO) {
  console.error("Uso: node analizar-merma-15sep.mjs <usuario_superadmin>")
  process.exit(1)
}

const FECHA = "2026-09-15"
const n = (x) => (x === null || x === undefined ? 0 : Number(x))
const r2 = (x) => Math.round(x * 100) / 100
const MARGEN_REDONDEO = 1.05

async function main() {
  const { data: turnos, error: e1 } = await supabase.rpc("listar_turnos_historial", {
    p_usuario: USUARIO,
    p_supervisor_usuario: null,
    p_fecha_desde: FECHA,
    p_fecha_hasta: FECHA,
  })
  if (e1) return console.error("listar_turnos_historial:", e1.message)

  const candidatos = (turnos ?? []).filter((t) => t.area_codigo === "ASEPTICO" || t.area_codigo === "VACIO")
  console.log(`Turnos ASEPTICO/VACIO del ${FECHA}: ${candidatos.length}`)
  for (const t of candidatos) console.log(`  ${t.area_codigo} ${t.turno_tipo_codigo} ${t.codigo} — ${t.supervisor_nombre}`)

  const { data: presRaw } = await supabase.rpc("listar_presentaciones")
  const presMap = new Map(
    (presRaw ?? []).map((p) => [
      Number(p.volumen_ml),
      { volumenMl: Number(p.volumen_ml), envasesXCaja: n(p.envases_x_caja), cajasXPaleta: n(p.cajas_x_paleta) },
    ]),
  )

  // ---- juntar todo el día: preps (dedup por id, última vista gana = la más "fresca"),
  //      corridas y PT de los 3 turnos ----
  const prepsPorId = new Map()
  const corridasDia = []
  const ptDia = []
  const contadoresDia = []

  for (const resumen of candidatos) {
    const { data: t, error: e2 } = await supabase.rpc("turno_detalle", { p_usuario: USUARIO, p_turno_id: resumen.turno_id })
    if (e2) {
      console.error("  turno_detalle:", e2.message)
      continue
    }
    for (const p of t.preparaciones ?? []) {
      const prev = prepsPorId.get(p.id)
      // nos quedamos con la fila que tenga el volumen_l más BAJO (la más avanzada/reciente
      // en el tiempo, ya que el tanque solo baja salvo "preparar encima")
      if (!prev || n(p.volumen_l) <= n(prev.volumen_l)) prepsPorId.set(p.id, p)
    }
    corridasDia.push(...(t.lineas ?? []))
    ptDia.push(...(t.producto_terminado ?? []))
    contadoresDia.push(...(t.contadores ?? []))
  }
  const preps = [...prepsPorId.values()]

  // ---------- MERMA DE ENVASE DEL DÍA ----------
  let llTot = 0
  let realTot = 0
  const corridaIds = new Set(contadoresDia.map((c) => c.turno_linea_id).filter(Boolean))
  for (const id of corridaIds) {
    const llenadora = contadoresDia.filter((c) => c.turno_linea_id === id && !c.parcial).reduce((a, c) => a + n(c.envases_llenadora), 0)
    const pt = ptDia.find((p) => p.turno_linea_id === id)
    if (llenadora === 0 || !pt) continue
    const pr = presMap.get(Number(pt.presentacion_volumen_ml))
    const envasesPt = (n(pt.paletas) * (pr?.cajasXPaleta ?? 0) + n(pt.cajas_sueltas)) * (pr?.envasesXCaja ?? 0)
    llTot += llenadora
    realTot += envasesPt
  }
  const mermaEnvDia = llTot === 0 ? null : r2((1 - realTot / llTot) * 100)

  // ---------- MERMA DE SEMIELABORADO DEL DÍA (lotes deduplicados, PT del día completo) ----------
  const loteIds = new Set(preps.map((p) => p.id))
  const ptPorLote = new Map()
  let ptSinLote = 0
  for (const pt of ptDia) {
    const corrida = pt.turno_linea_id ? corridasDia.find((c) => c.id === pt.turno_linea_id) : null
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
  console.log("\n== MERMA SEMIELABORADO — DÍA COMPLETO (lotes consolidados) ==")
  for (const loteId of loteIds) {
    const lote = preps.find((p) => p.id === loteId)
    const ptLote = ptPorLote.get(loteId) ?? 0
    if (!lote) {
      sinContraste += ptLote
      console.log(`  lote ${loteId.slice(0, 8)} → sin fila de preparación → PT ${r2(ptLote)} sin contraste`)
      continue
    }
    const inicio = lote.volumen_l_inicio ?? lote.volumen_inicial_l
    const fin = n(lote.volumen_l)
    const vi = lote.volumen_inicial_l
    const tramo = inicio === null || inicio === undefined ? null : n(inicio) - fin
    const ptExcede = vi != null && n(vi) > 0 && ptLote > n(vi) * MARGEN_REDONDEO
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
  const rendDia = consumo <= 0 ? null : r2((1 - producido / consumo) * 100)

  console.log("\n== RESUMEN DEL DÍA", FECHA, "==")
  console.log({
    merma_envase_pct: mermaEnvDia,
    envase_llenadora: llTot,
    envase_pt: realTot,
    merma_semielaborado_pct: rendDia,
    consumo_l: r2(consumo),
    producido_l: r2(producido),
    litrosSinContraste: Math.round(sinContraste),
  })
}

main().catch((e) => console.error(e))

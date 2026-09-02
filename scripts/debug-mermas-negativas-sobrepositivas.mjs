/*
 * SOLO LECTURA. Barre turnos reales de ASEPTICO (ya con el arreglo en
 * producción) y marca cualquier turno cuya merma de SEMIELABORADO o de
 * ENVASES salga negativa, o sospechosamente perfecta (0% con consumo
 * grande, o rendimiento >= 99%).
 *
 *   node scripts/debug-mermas-negativas-sobrepositivas.mjs [dias]
 */
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"

const env = {}
for (const line of readFileSync(`${process.cwd()}/.env.local`, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
const DIAS = Number(process.argv[2]) || 20

function ymd(d) {
  return d.toISOString().slice(0, 10)
}

function mermaSemielaborado(t) {
  const loteIds = new Set()
  for (const l of t.lineas || []) if (l.lote_id) loteIds.add(l.lote_id)
  for (const p of t.preparaciones || []) if (p.turno_id === t.id) loteIds.add(p.id)

  let consumo = 0
  for (const id of loteIds) {
    const p = (t.preparaciones || []).find((x) => x.id === id)
    if (!p) continue
    const inicio = p.volumen_l_inicio ?? p.volumen_inicial_l
    if (inicio == null) continue
    const fin = p.volumen_l ?? 0
    consumo += Math.max(inicio - fin, 0)
  }
  const pt = (t.producto_terminado || []).reduce((a, x) => a + Number(x.litros_producidos || 0), 0)
  const pct = consumo > 0 ? Math.round((1 - pt / consumo) * 10000) / 100 : null
  return { consumo, pt, pct }
}

async function mermaEnvases(t, presentaciones) {
  const resultados = []
  for (const l of t.lineas || []) {
    const contadores = (t.contadores || []).filter((c) => c.turno_linea_id === l.id && !c.parcial)
    const llenadora = contadores.reduce((a, c) => a + c.envases_llenadora, 0)
    const pt = (t.producto_terminado || []).find((p) => p.turno_linea_id === l.id)
    if (llenadora === 0 || !pt) continue
    const pres = presentaciones.find((p) => p.volumen_ml === l.presentacion_volumen_ml)
    if (!pres) continue
    const envasesPt = (pt.paletas * pres.cajas_x_paleta + pt.cajas_sueltas) * pres.envases_x_caja
    const pct = Math.round((1 - envasesPt / llenadora) * 10000) / 100
    resultados.push({ linea: l.linea_codigo, lote: l.lote, llenadora, envasesPt, pct })
  }
  return resultados
}

async function main() {
  const { data: presentaciones } = await supabase.rpc("listar_presentaciones")
  const hoy = new Date()
  const vistos = new Set()
  const hallazgos = []

  for (let i = 0; i < DIAS; i++) {
    const d = new Date(hoy)
    d.setUTCDate(d.getUTCDate() - i)
    const fecha = ymd(d)
    for (const tipo of ["TURNO_1", "TURNO_2", "TURNO_3"]) {
      const { data: t, error } = await supabase.rpc("turno_de_fecha_tipo", { p_fecha: fecha, p_turno_tipo: tipo, p_area_codigo: "ASEPTICO" })
      if (error || !t || vistos.has(t.id)) continue
      vistos.add(t.id)

      const semi = mermaSemielaborado(t)
      const envases = await mermaEnvases(t, presentaciones || [])

      const flags = []
      if (semi.pct !== null && semi.pct < 0) flags.push(`SEMIELABORADO NEGATIVO: ${semi.pct}%`)
      if (semi.pct !== null && semi.pct <= 0.5 && semi.consumo > 3000) flags.push(`SEMIELABORADO SOSPECHOSAMENTE PERFECTO: ${semi.pct}% (consumo ${semi.consumo} L)`)
      for (const e of envases) {
        if (e.pct < 0) flags.push(`ENVASES NEGATIVO (${e.linea} lote ${e.lote}): ${e.pct}%`)
        if (e.pct <= 0.05 && e.llenadora > 1000) flags.push(`ENVASES SOSPECHOSAMENTE PERFECTO (${e.linea} lote ${e.lote}): ${e.pct}%`)
      }

      if (flags.length > 0) {
        hallazgos.push({ turno: t.codigo, fecha, tipo, estado: t.estado, flags, semi, envases })
      }
    }
  }

  console.log(`Barridos ${vistos.size} turnos únicos en ${DIAS} días.\n`)
  for (const h of hallazgos) {
    console.log(`=== ${h.turno} (${h.fecha} ${h.tipo}, ${h.estado}) ===`)
    for (const f of h.flags) console.log(`  ⚠ ${f}`)
  }
  console.log(`\nTotal turnos marcados: ${hallazgos.length} de ${vistos.size}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

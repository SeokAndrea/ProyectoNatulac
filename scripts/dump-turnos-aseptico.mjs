/*
 * SOLO LECTURA. No escribe nada en Supabase.
 * Barre turnos CERRADOS del área ASEPTICO por fecha/tipo (misma RPC que
 * el Panel) y vuelca todo a JSON para armar casos de test reales.
 *
 *   node dump-aseptico.mjs [dias_hacia_atras] [usuario_sesion_opcional]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"

const ROOT = "c:/Users/andre/OneDrive/Documents/PROYECTO"
const OUT = "c:/Users/andre/AppData/Local/Temp/claude/c--Users-andre-OneDrive-Documents-PROYECTO/2ace472d-d75d-4722-bbcf-235a344b6a60/scratchpad/aseptico"
mkdirSync(OUT, { recursive: true })

const env = {}
for (const line of readFileSync(`${ROOT}/.env.local`, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

const DIAS = Number(process.argv[2]) || 21

function ymd(d) {
  return d.toISOString().slice(0, 10)
}

async function pull(fecha, tipo) {
  const { data, error } = await supabase.rpc("turno_de_fecha_tipo", {
    p_fecha: fecha,
    p_turno_tipo: tipo,
    p_area_codigo: "ASEPTICO",
  })
  if (error) return { err: error.message }
  if (!data) return null
  return { data }
}

async function main() {
  // 1) probar explícitamente si existe ajustes_semielaborado_turno
  const probe = await supabase.rpc("ajustes_semielaborado_turno", { p_turno_id: "00000000-0000-0000-0000-000000000000" })
  console.log("ajustes_semielaborado_turno probe:", probe.error ? `ERROR: ${probe.error.message}` : `ok (data=${JSON.stringify(probe.data)})`)

  const listado = []
  const hoy = new Date()

  for (let i = 0; i < DIAS; i++) {
    const d = new Date(hoy)
    d.setUTCDate(d.getUTCDate() - i)
    const fecha = ymd(d)
    for (const tipo of ["TURNO_1", "TURNO_2", "TURNO_3"]) {
      const r = await pull(fecha, tipo)
      if (!r) continue
      if (r.err) {
        console.log(`  ${fecha} ${tipo}: error ${r.err}`)
        continue
      }
      const t = r.data
      const turnoId = t.id
      const fname = `${OUT}/${fecha}_${tipo}_${turnoId.slice(0, 8)}.json`
      writeFileSync(fname, JSON.stringify(t, null, 2))

      let ajustes = null
      const aj = await supabase.rpc("ajustes_semielaborado_turno", { p_turno_id: turnoId })
      ajustes = aj.error ? { error: aj.error.message } : aj.data
      writeFileSync(fname.replace(".json", ".ajustes.json"), JSON.stringify(ajustes, null, 2))

      const preps = t.preparaciones ?? []
      const pts = t.producto_terminado ?? []
      const lineas = t.lineas ?? []
      const loteIdsDeLineas = [...new Set(lineas.map((l) => l.lote_id).filter(Boolean))]

      // Replica exacta de mermaSemielaboradoTurno() para ver qué da HOY
      let volumenInicial = 0
      let litrosProducidos = 0
      let hayLoteAbierto = false
      const trazaLotes = []
      for (const loteId of loteIdsDeLineas) {
        const lote = preps.find((p) => p.id === loteId)
        if (!lote || lote.volumen_inicial_l === null) {
          trazaLotes.push({ loteId: loteId.slice(0, 8), estado: !lote ? "NO_EN_PREPARACIONES" : "inicial_null" })
          continue
        }
        if (lote.cerrado_en === null) {
          hayLoteAbierto = true
          trazaLotes.push({ loteId: loteId.slice(0, 8), lote: lote.lote, estado: "ABIERTO", volumen_inicial_l: lote.volumen_inicial_l })
          continue
        }
        const corridas = new Set(lineas.filter((l) => l.lote_id === loteId).map((l) => l.id))
        const ptLote = pts.filter((p) => p.turno_linea_id && corridas.has(p.turno_linea_id)).reduce((a, p) => a + p.litros_producidos, 0)
        volumenInicial += lote.volumen_inicial_l
        litrosProducidos += ptLote
        trazaLotes.push({
          loteId: loteId.slice(0, 8),
          lote: lote.lote,
          estado: "CUENTA",
          volumen_inicial_l: lote.volumen_inicial_l,
          volumen_l: lote.volumen_l,
          tambores: lote.tambores,
          ptLote,
          inicial_menos_final: lote.volumen_inicial_l - (lote.volumen_l ?? 0),
          "¿inicial == PT+final?": lote.volumen_inicial_l === ptLote + (lote.volumen_l ?? 0),
        })
      }
      const pct = volumenInicial === 0 ? null : Math.round((1 - litrosProducidos / volumenInicial) * 10000) / 100

      listado.push({
        fecha,
        tipo,
        turnoId,
        codigo: t.codigo,
        supervisor: t.supervisor_nombre,
        estado: t.estado,
        merma_semi_pct_HOY: pct,
        hayLoteAbierto,
        volumenInicial,
        litrosProducidos,
        trazaLotes,
        preparaciones: preps.map((p) => ({
          id: p.id.slice(0, 8),
          tanque: p.numero_tanque,
          sabor: p.sabor_nombre,
          lote: p.lote,
          tambores: p.tambores,
          volumen_inicial_l: p.volumen_inicial_l,
          volumen_l: p.volumen_l,
          cerrado_en: p.cerrado_en,
        })),
        ajustes,
      })
    }
  }

  writeFileSync(`${OUT}/_listado.json`, JSON.stringify(listado, null, 2))
  console.log(`\n${listado.length} turnos ASEPTICO cerrados encontrados:\n`)
  console.log(JSON.stringify(listado, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

/*
 * SOLO LECTURA. Javier dice que ayer (2026-09-16) no se le restó el
 * lote 2 de manzana. Buscamos sus turnos de esa fecha (área ASEPTICO,
 * misma RPC que usa el Panel) y revisamos cómo quedó el lote de
 * manzana en turno_detalle: volumen inicial, volumen de cierre, y si
 * el consumo se contabilizó en la merma de semielaborado.
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
const FECHA = process.argv[3] || "2026-09-16"
const n = (x) => (x === null || x === undefined ? 0 : Number(x))
const r2 = (x) => Math.round(x * 100) / 100

async function main() {
  for (const tipo of ["TURNO_1", "TURNO_2", "TURNO_3"]) {
    const { data: t, error } = await supabase.rpc("turno_de_fecha_tipo", {
      p_fecha: FECHA,
      p_turno_tipo: tipo,
      p_area_codigo: "ASEPTICO",
    })
    if (error) { console.log(`${FECHA} ${tipo}: error ${error.message}`); continue }
    if (!t) { console.log(`${FECHA} ${tipo}: sin turno`); continue }
    console.log(`\n== ${t.codigo} — supervisor: ${t.supervisor_nombre} — estado: ${t.estado} ==`)

    const preps = t.preparaciones ?? []
    const corridas = t.lineas ?? []
    const pts = t.producto_terminado ?? []
    const manzana = preps.filter((p) => (p.sabor_nombre ?? "").toLowerCase().includes("manzana"))
    if (manzana.length === 0) { console.log("  (sin lotes de manzana en este turno)"); continue }

    for (const p of manzana) {
      const corridasLote = corridas.filter((c) => c.lote_id === p.id)
      const ptLote = pts.filter((pt) => corridasLote.some((c) => c.id === pt.turno_linea_id)).reduce((a, x) => a + n(x.litros_producidos), 0)
      const inicioTurno = p.volumen_l_inicio ?? p.volumen_inicial_l
      console.log(`  lote ${p.lote} (${p.id.slice(0, 8)}) tanque=${p.numero_tanque} tambores=${p.tambores} turno_id_creacion=${p.turno_id?.slice(0,8)}`)
      console.log(`    volumen_inicial_l(creación)=${n(p.volumen_inicial_l)} volumen_l_inicio(este turno)=${p.volumen_l_inicio} volumen_l(fin/actual)=${n(p.volumen_l)} cerrado_en=${p.cerrado_en}`)
      console.log(`    TRAMO usado por el cálculo real (inicioTurno-fin)=${r2(n(inicioTurno) - n(p.volumen_l))} PT_atribuido_a_este_lote=${r2(ptLote)}`)
      console.log(`    corridas que usan este lote:`, corridasLote.map((c) => ({ id: c.id.slice(0,8), linea: c.linea_codigo, activada_en: c.activada_en, finalizada_en: c.finalizada_en })))
    }
  }
}

main().catch((e) => console.error(e))

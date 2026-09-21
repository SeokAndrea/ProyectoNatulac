/*
 * SOLO LECTURA. Trae ajustes_semielaborado_turno (correcciones de volumen
 * de preparaciones_ajuste) de los 3 turnos ASEPTICO del 2026-09-15, para
 * ver si el salto de volumen del tanque 3 (lote "0002") fue una
 * corrección manual o un "preparar encima" físico.
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

const TURNOS = [
  { codigo: "A20260915_T1G2", id: "de8fa8b3-1488-4330-bcd8-a4f0c2c55283", supervisor: "Danny" },
  { codigo: "A20260915_T2G1", id: "8a41f5b8-0323-427b-93c1-2423440aa2f8", supervisor: "Javier" },
  { codigo: "A20260915_T3G3", id: "41d801dd-61b0-4f83-bbc8-1dec448184b1", supervisor: "Deivis" },
]

async function main() {
  for (const t of TURNOS) {
    console.log(`\n=== ${t.codigo} — ${t.supervisor} ===`)
    const { data, error } = await supabase.rpc("ajustes_semielaborado_turno", { p_turno_id: t.id })
    if (error) {
      console.error("  error:", error.message)
      continue
    }
    if (!data || data.length === 0) {
      console.log("  (sin ajustes)")
      continue
    }
    for (const a of data) {
      console.log(" ", {
        lote: a.lote,
        sabor: a.sabor,
        volumen_teorico: a.volumen_teorico,
        volumen_real: a.volumen_real,
        diferencia: a.diferencia,
        usuario: a.usuario_nombre,
        creado_en: a.creado_en,
      })
    }
  }
}

main().catch((e) => console.error(e))

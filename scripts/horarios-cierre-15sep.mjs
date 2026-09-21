/*
 * SOLO LECTURA. Hora de inicio/cierre real (fecha_fin/hora_fin) de los 3
 * turnos ASEPTICO del 2026-09-15, para entender el orden real en que
 * cerraron (no necesariamente T1 -> T2 -> T3) y así explicar por qué el
 * lote 0002 (tanque 3) quedó "congelado" en valores distintos por turno.
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
const TURNOS = [
  { codigo: "A20260915_T1G2", id: "de8fa8b3-1488-4330-bcd8-a4f0c2c55283", supervisor: "Danny" },
  { codigo: "A20260915_T2G1", id: "8a41f5b8-0323-427b-93c1-2423440aa2f8", supervisor: "Javier" },
  { codigo: "A20260915_T3G3", id: "41d801dd-61b0-4f83-bbc8-1dec448184b1", supervisor: "Deivis" },
]

async function main() {
  for (const t of TURNOS) {
    const { data, error } = await supabase.rpc("turno_detalle", { p_usuario: USUARIO, p_turno_id: t.id })
    if (error) {
      console.error(t.codigo, error.message)
      continue
    }
    console.log(t.codigo, t.supervisor, {
      fecha: data.fecha,
      hora_inicio: data.hora_inicio,
      estado: data.estado,
      fecha_fin: data.fecha_fin,
      hora_fin: data.hora_fin,
      cierre_automatico: data.cierre_automatico,
    })
  }
}

main().catch((e) => console.error(e))

/*
 * SOLO LECTURA. Vuelca los turnos ASEPTICO de una fecha (misma RPC que el
 * Panel) y la auditoría de ese día, para revisar qué hizo un supervisor.
 *
 *   node scripts/revisar-turnos-fecha.mjs <fecha> <carpeta_salida> [usuario_sesion]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"

const env = {}
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

const FECHA = process.argv[2]
const OUT = process.argv[3]
const USUARIO = process.argv[4] || "agomez"
mkdirSync(OUT, { recursive: true })

async function main() {
  for (const tipo of ["TURNO_1", "TURNO_2", "TURNO_3"]) {
    const { data: t, error } = await supabase.rpc("turno_de_fecha_tipo", {
      p_fecha: FECHA,
      p_turno_tipo: tipo,
      p_area_codigo: "ASEPTICO",
    })
    if (error) { console.log(`${tipo}: error ${error.message}`); continue }
    if (!t) { console.log(`${tipo}: sin turno`); continue }
    writeFileSync(`${OUT}/${tipo}.json`, JSON.stringify(t, null, 2))
    console.log(`${tipo}: ${t.codigo} — ${t.supervisor_nombre} — ${t.estado} — id ${t.id}`)
  }

  const d = new Date(`${FECHA}T00:00:00Z`)
  const sig = new Date(d); sig.setUTCDate(sig.getUTCDate() + 1)
  const { data, error } = await supabase.rpc("listar_auditoria", {
    p_usuario: USUARIO,
    p_fecha_desde: FECHA,
    p_fecha_hasta: sig.toISOString().slice(0, 10),
  })
  if (error) return console.log("listar_auditoria:", error.message)
  writeFileSync(`${OUT}/auditoria.json`, JSON.stringify(data, null, 2))
  console.log(`auditoría: ${data.length} registros`)
}

main().catch((e) => console.error(e))

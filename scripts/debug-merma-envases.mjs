/*
 * SOLO LECTURA. Reconstruye mermaCorrida() (src/lib/turno.tsx) para cada
 * corrida del turno ABIERTO de hoy en ASEPTICO, mostrando los datos
 * crudos detrás de cada %, para encontrar el origen de una merma
 * negativa.
 *
 *   node scripts/debug-merma-envases.mjs
 */
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"

const env = {}
for (const line of readFileSync(`${process.cwd()}/.env.local`, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

function ymd(d) {
  return d.toISOString().slice(0, 10)
}

async function main() {
  const hoy = ymd(new Date())
  let turno = null
  for (const tipo of ["TURNO_1", "TURNO_2", "TURNO_3"]) {
    const { data, error } = await supabase.rpc("turno_de_fecha_tipo", { p_fecha: hoy, p_turno_tipo: tipo, p_area_codigo: "ASEPTICO" })
    if (!error && data && data.estado === "ABIERTO") {
      turno = data
      break
    }
  }
  if (!turno) {
    console.log("No encontré un turno ABIERTO hoy en ASEPTICO con turno_de_fecha_tipo. Probando ayer también...")
    for (const fecha of [hoy]) {
      for (const tipo of ["TURNO_1", "TURNO_2", "TURNO_3"]) {
        const { data, error } = await supabase.rpc("turno_de_fecha_tipo", { p_fecha: fecha, p_turno_tipo: tipo, p_area_codigo: "ASEPTICO" })
        if (!error && data) console.log(`  ${fecha} ${tipo}: ${data.codigo} (${data.estado})`)
      }
    }
    return
  }

  console.log(`Turno: ${turno.codigo} (${turno.estado})\n`)

  for (const l of turno.lineas || []) {
    const contadoresCorrida = (turno.contadores || []).filter((c) => c.turno_linea_id === l.id)
    const contadoresDefinitivos = contadoresCorrida.filter((c) => !c.parcial)
    const llenadora = contadoresDefinitivos.reduce((a, c) => a + c.envases_llenadora, 0)
    const pt = (turno.producto_terminado || []).find((p) => p.turno_linea_id === l.id)

    console.log(`--- Corrida ${l.linea_codigo} · lote ${l.lote ?? "—"} · presentación ${l.presentacion_volumen_ml} ml ---`)
    console.log(`  Contadores de esta corrida (${contadoresCorrida.length}):`)
    for (const c of contadoresCorrida) {
      console.log(`    - ${c.envases_llenadora} envases | parcial=${c.parcial} | justificación="${c.justificacion}" | ${c.creado_en}`)
    }
    console.log(`  Suma de DEFINITIVOS (no parciales): ${llenadora}`)

    if (!pt) {
      console.log("  Producto Terminado: (todavía no cargado) -> mermaCorrida = null\n")
      continue
    }
    console.log(`  Producto Terminado: ${pt.paletas} paletas + ${pt.cajas_sueltas} cajas sueltas | litros=${pt.litros_producidos} | tiene_parciales=${pt.tiene_parciales}`)
    if (pt.parciales?.length) {
      console.log(`  Parciales de PT (${pt.parciales.length}):`, pt.parciales.map((p) => `${p.paletas}p+${p.cajas_sueltas}c`))
    }

    if (llenadora === 0) {
      console.log("  llenadora = 0 -> mermaCorrida = null (sin contador definitivo)\n")
      continue
    }

    // Necesitamos envases_x_caja y cajas_x_paleta de la presentación real.
    const { data: pres } = await supabase.rpc("listar_presentaciones")
    const p = (pres || []).find((x) => x.volumen_ml === l.presentacion_volumen_ml)
    if (!p) {
      console.log("  (no encontré la presentación en el catálogo)\n")
      continue
    }
    const envasesPt = (pt.paletas * p.cajas_x_paleta + pt.cajas_sueltas) * p.envases_x_caja
    const pct = Math.round((1 - envasesPt / llenadora) * 10000) / 100
    console.log(`  envases_x_caja=${p.envases_x_caja} cajas_x_paleta=${p.cajas_x_paleta}`)
    console.log(`  envasesProductoTerminado = (${pt.paletas}*${p.cajas_x_paleta}+${pt.cajas_sueltas})*${p.envases_x_caja} = ${envasesPt}`)
    console.log(`  MERMA = 1 - (${envasesPt} / ${llenadora}) = ${pct}%\n`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

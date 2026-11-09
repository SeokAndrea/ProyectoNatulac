// PostgREST de mentira sobre la base local (PGlite), para probar el plc-bridge
// de punta a punta sin Docker ni la base de planta.
//
// Uso (desde scripts/base-local, con base.tar.gz armada por construir.mjs):
//   node postgrest-falso.mjs [puerto] [clave del usuario plc-bridge]
// Por defecto: puerto 4999, clave "clave-de-prueba".
//
// Atiende POST /rpc/<funcion> como PostgREST: fija request.path y
// request.headers (con x-sesion), corre revisar_peticion() con la seguridad en
// EXIGIR y llama la función con argumentos por nombre. Una función de tabla
// responde un arreglo; una escalar, el valor. Un error responde 400
// {code, message}, o 403 si el código es 28000 (sesión no válida).
// Cada 5 s imprime las cargas del PLC y sus ajustes.
//
// Si la base no trae la migración 20261115990000, la aplica.
import http from "node:http"
import { readFileSync } from "node:fs"
import { PGlite } from "@electric-sql/pglite"
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto"

const PUERTO = Number(process.argv[2] ?? 4999)
const CLAVE = process.argv[3] ?? "clave-de-prueba"
const MIGRACION = new URL("../../supabase/migrations/20261115990000_preparacion_plc.sql", import.meta.url)

const tar = readFileSync(new URL("./base.tar.gz", import.meta.url))
const db = await PGlite.create({ extensions: { pgcrypto }, loadDataDir: new Blob([tar]) })
await db.exec(`set search_path = "$user", public, extensions;`)

const { rows: hay } = await db.query("select to_regclass('public.plc_cargas_tanque') is not null as hay")
if (!hay[0].hay) {
  await db.exec(readFileSync(MIGRACION, "utf8"))
  console.log("migración 20261115990000 aplicada")
}
await db.query("update usuarios set password_hash = extensions.crypt($1, extensions.gen_salt('bf')) where usuario = 'plc-bridge'", [CLAVE])
await db.exec("update seguridad_config set modo = 'EXIGIR';")

/** Literal SQL sin tipo: Postgres lo convierte al tipo del parámetro de la función. */
function literal(valor) {
  if (valor === null || valor === undefined) return "null"
  const texto = typeof valor === "object" ? JSON.stringify(valor) : String(valor)
  return `'${texto.replace(/'/g, "''")}'`
}

async function llamar(funcion, args, sesion) {
  if (!/^[a-z_][a-z0-9_]*$/.test(funcion)) return { status: 404, cuerpo: { message: "función no válida" } }
  const nombres = Object.keys(args)
  if (!nombres.every((n) => /^[a-z_][a-z0-9_]*$/.test(n))) return { status: 400, cuerpo: { message: "argumento no válido" } }
  const lista = nombres.map((n) => `${n} => ${literal(args[n])}`).join(", ")
  try {
    return await db.transaction(async (tx) => {
      await tx.query("select set_config('request.path', $1, true)", [`/rpc/${funcion}`])
      await tx.query("select set_config('request.headers', $1, true)", [JSON.stringify(sesion ? { "x-sesion": sesion } : {})])
      await tx.query("select public.revisar_peticion()")
      const { rows: info } = await tx.query("select bool_or(proretset) as conjunto from pg_proc where proname = $1 and pronamespace = 'public'::regnamespace", [funcion])
      if (info[0].conjunto === null) return { status: 404, cuerpo: { code: "PGRST202", message: `No existe ${funcion}` } }
      if (info[0].conjunto) {
        const { rows } = await tx.query(`select * from public.${funcion}(${lista})`)
        return { status: 200, cuerpo: rows }
      }
      const { rows } = await tx.query(`select public.${funcion}(${lista}) as r`)
      return { status: 200, cuerpo: rows[0].r }
    })
  } catch (error) {
    return { status: error.code === "28000" ? 403 : 400, cuerpo: { code: error.code ?? null, message: error.message } }
  }
}

const servidor = http.createServer(async (req, res) => {
  const m = /^\/rpc\/([^/?]+)/.exec(req.url ?? "")
  if (req.method !== "POST" || !m) return res.writeHead(404).end()
  let datos = ""
  for await (const parte of req) datos += parte
  let args
  try {
    args = datos ? JSON.parse(datos) : {}
  } catch {
    return res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ message: "JSON no válido" }))
  }
  const sesion = req.headers["x-sesion"] || null
  const r = await llamar(m[1], args, typeof sesion === "string" ? sesion : null)
  if (m[1] !== "registrar_carga_plc" || r.status !== 200) console.log(`POST /rpc/${m[1]} → ${r.status}${r.status !== 200 ? ` ${r.cuerpo.message}` : ""}`)
  res.writeHead(r.status, { "content-type": "application/json" }).end(JSON.stringify(r.cuerpo))
})
servidor.listen(PUERTO, () => console.log(`PostgREST falso en http://localhost:${PUERTO} (plc-bridge / ${CLAVE})`))

let anterior = ""
setInterval(async () => {
  const { rows } = await db.query(`
    select c.numero_tanque as t, c.estado, c.kits, c.kits_listos_en is not null as kits_listos,
           c.iniciada_en, c.terminada_en,
           (select string_agg(a.litros::text || case when a.hecho_en is null then ' (en curso)' else '' end, ', ' order by a.iniciado_en)
              from plc_cargas_ajustes a where a.carga_id = c.id) as ajustes
    from plc_cargas_tanque c join areas ar on ar.id = c.area_id
    where ar.codigo = 'PRUEBAS' order by c.iniciada_en`)
  const texto = rows
    .map((r) => `  T${r.t} ${r.estado.padEnd(10)} kits=${r.kits ?? "-"}${r.kits_listos ? " (listos)" : ""} ajustes=[${r.ajustes ?? ""}] ${r.terminada_en ? "terminada" : "abierta"}`)
    .join("\n")
  if (texto !== anterior) {
    console.log(`--- ${new Date().toISOString()} · ${rows.length} cargas\n${texto}`)
    anterior = texto
  }
}, 5000)

function apagar() {
  servidor.close()
  db.close().finally(() => {
    process.exitCode = 0
  })
}
process.on("SIGINT", apagar)
process.on("SIGTERM", apagar)

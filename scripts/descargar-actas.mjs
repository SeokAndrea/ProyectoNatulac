// ============================================================
// DESCARGAR LAS ACTAS (PDF) DEL STORAGE — para la migración
// ============================================================
// El SQL maestro (generar-sql-maestro.ps1) no lleva los PDF de las actas:
// viven en Supabase Storage, bucket "actas" (público). Este script los baja
// TODOS a una carpeta, con la misma estructura de rutas que en el bucket
// (ÁREA/turno_id/CÓDIGO-timestamp.pdf), que es la que guarda la tabla
// actas.storage_path. En la base nueva se suben con esas mismas rutas.
//
// Usa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY de .env.local.
// No borra ni cambia nada en Supabase. Si un archivo ya está bajado (mismo
// tamaño), lo salta: se puede correr de nuevo para traer solo lo nuevo.
//
// Uso (desde la carpeta ProyectoNatulac):
//   node scripts/descargar-actas.mjs
// Por defecto guarda en Documentos\natulac-respaldos\actas-AAAA-MM-DD.
// Otra carpeta: node scripts/descargar-actas.mjs "D:\respaldo\actas"
// ============================================================

import { createClient } from "@supabase/supabase-js"
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

function leerEnv() {
  const env = {}
  for (const linea of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "")
  }
  return env
}

const env = leerEnv()
if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
  console.error("Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY en .env.local")
  process.exit(1)
}
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
const bucket = supabase.storage.from("actas")

const hoy = new Date().toISOString().slice(0, 10)
const destino = process.argv[2] ?? join(homedir(), "Documents", "natulac-respaldos", `actas-${hoy}`)

// Lista recursiva: las carpetas vienen sin id; los archivos, con id y metadata.
async function listar(prefijo) {
  const archivos = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await bucket.list(prefijo, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } })
    if (error) throw new Error(`No se pudo listar "${prefijo || "/"}": ${error.message}`)
    for (const item of data) {
      const ruta = prefijo ? `${prefijo}/${item.name}` : item.name
      if (item.id === null) archivos.push(...(await listar(ruta)))
      else archivos.push({ ruta, tamano: item.metadata?.size ?? null })
    }
    if (data.length < 1000) break
  }
  return archivos
}

const archivos = await listar("")
console.log(`${archivos.length} archivo(s) en el bucket "actas". Guardando en ${destino}`)

let bajados = 0
let saltados = 0
const fallidos = []
for (const { ruta, tamano } of archivos) {
  const local = join(destino, ...ruta.split("/"))
  if (existsSync(local) && tamano !== null && statSync(local).size === tamano) {
    saltados++
    continue
  }
  const { data, error } = await bucket.download(ruta)
  if (error || !data) {
    fallidos.push(`${ruta}: ${error?.message ?? "sin datos"}`)
    continue
  }
  mkdirSync(dirname(local), { recursive: true })
  writeFileSync(local, Buffer.from(await data.arrayBuffer()))
  bajados++
  if (bajados % 25 === 0) console.log(`  ${bajados} bajados…`)
}

console.log(`Listo: ${bajados} bajado(s), ${saltados} ya estaban, ${fallidos.length} con error.`)
for (const f of fallidos) console.log(`  ERROR ${f}`)
if (fallidos.length) process.exit(1)

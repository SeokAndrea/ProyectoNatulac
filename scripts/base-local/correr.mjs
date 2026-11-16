// Corre ensayos SQL sobre la base local que armó construir.mjs (base.tar.gz).
//
// Uso (desde scripts/base-local):
//   node correr.mjs [--migracion archivo.sql]... ensayo.sql [otro-ensayo.sql]...
// Cada --migracion se aplica antes de los ensayos, en el orden dado (como en
// planta). Los ensayos van en begin ... rollback: si algo no sale, levantan
// una excepción y este programa termina con código 1.
import { PGlite } from "@electric-sql/pglite"
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto"
import { readFileSync } from "node:fs"

function detalle(error) {
  return `${error.message}${error.where ? `\n  dónde: ${error.where}` : ""}`
}

/** Devuelve la cantidad de fallas (0 = todo bien). */
async function correr(migraciones, ensayos) {
  const tar = readFileSync(new URL("./base.tar.gz", import.meta.url))
  const db = await PGlite.create({ extensions: { pgcrypto }, loadDataDir: new Blob([tar]) })
  try {
    await db.exec(`set search_path = "$user", public, extensions;`)
    for (const archivo of migraciones) {
      try {
        await db.exec(readFileSync(archivo, "utf8"))
        console.log(`Migración aplicada: ${archivo}`)
      } catch (error) {
        console.error(`FALLÓ la migración ${archivo}:\n  ${detalle(error)}`)
        return 1
      }
    }
    let fallas = 0
    for (const archivo of ensayos) {
      try {
        await db.exec(readFileSync(archivo, "utf8"))
        console.log(`OK  ${archivo}`)
      } catch (error) {
        fallas++
        console.error(`FALLÓ ${archivo}:\n  ${detalle(error)}`)
        // Por si el ensayo quedó a medias dentro de su transacción.
        await db.exec("rollback;").catch(() => {})
      }
    }
    return fallas
  } finally {
    await db.close()
  }
}

const args = process.argv.slice(2)
const migraciones = []
const ensayos = []
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--migracion") migraciones.push(args[++i])
  else ensayos.push(args[i])
}
if (ensayos.length === 0 && migraciones.length === 0) {
  console.error("Uso: node correr.mjs [--migracion archivo.sql]... ensayo.sql [otro-ensayo.sql]...")
  process.exitCode = 1
} else {
  // exitCode y no process.exit(): en Windows, salir de golpe con PGlite recién
  // cerrado corta libuv a mitad ("UV_HANDLE_CLOSING") y el código sale mal.
  process.exitCode = (await correr(migraciones, ensayos)) ? 1 : 0
}

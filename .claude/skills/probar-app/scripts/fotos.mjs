// Fotos de pantallas de la app (ver ../SKILL.md).
//   node .claude/skills/probar-app/scripts/fotos.mjs [--sesion] [--tam pc|telefono|ambos] ruta [otra ...]
// Rutas sin barra inicial (Git Bash convierte "/algo" en una ruta de Windows):
// "entrada" es la pantalla de entrada (/), "hub" es /hub, "paradas" es /paradas.
// Imprime dónde quedó cada foto y los errores de consola de cada pantalla.

import { abrirNavegador, levantarApp, nuevaPagina, rutaFoto, URL_APP } from "./natulac.mjs"

const USO = "Uso: node fotos.mjs [--sesion] [--tam pc|telefono|ambos] ruta [otra ...]   (ej.: entrada, hub, paradas)"

const args = process.argv.slice(2)
const conSesion = args.includes("--sesion")
const iTam = args.indexOf("--tam")
const tamPedido = iTam >= 0 ? args[iTam + 1] : "ambos"
const tamanos = tamPedido === "ambos" ? ["pc", "telefono"] : [tamPedido]
const rutas = args
  .filter((a, i) => !a.startsWith("--") && (iTam < 0 || i !== iTam + 1))
  .map((a) => {
    if (/^[a-z]:[\\/]/i.test(a)) {
      console.log(`"${a}" parece una ruta convertida por Git Bash: escribir la ruta sin la barra inicial.`)
      process.exit(1)
    }
    return a === "entrada" ? "/" : `/${a.replace(/^\/+/, "")}`
  })

if (rutas.length === 0 || tamanos.some((t) => !["pc", "telefono"].includes(t))) {
  console.log(USO)
  process.exit(1)
}

const app = await levantarApp()
const navegador = await abrirNavegador()
let fallo = false
try {
  for (const tam of tamanos) {
    const { page, contexto, errores } = await nuevaPagina(navegador, { tam, conSesion })
    for (const ruta of rutas) {
      errores.length = 0
      await page.goto(URL_APP + ruta)
      await page.waitForLoadState("networkidle")
      const archivo = rutaFoto(ruta, tam)
      await page.screenshot({ path: archivo, fullPage: true })
      const llego = new URL(page.url()).pathname
      console.log(`FOTO ${ruta} (${tam}) -> ${archivo}${llego !== ruta ? `  [redirigió a ${llego}]` : ""}`)
      for (const e of errores) console.log(`  ERROR CONSOLA: ${e.slice(0, 300)}`)
    }
    await contexto.close()
  }
} catch (e) {
  fallo = true
  console.error(`FALLÓ: ${e.message}`)
} finally {
  await navegador.close()
  await app.detener()
}
process.exit(fallo ? 1 : 0)

// Ayudantes para manejar la app con Playwright (ver ../SKILL.md).
// Levanta Vite si hace falta, abre Chromium y entra con la cuenta de Pruebas
// de .env.local (PRUEBAS_USUARIO / PRUEBAS_CLAVE). La sesión se guarda en la
// carpeta temporal del sistema para no crear una sesión nueva en cada corrida.

import { spawn, execSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..")
export const PUERTO = 5199
export const URL_APP = `http://localhost:${PUERTO}`
export const CARPETA = path.join(os.tmpdir(), "natulac-pruebas")
const ESTADO_SESION = path.join(CARPETA, "sesion-pruebas.json")

export const TAMANOS = {
  pc: { width: 1280, height: 800 },
  telefono: { width: 400, height: 850 },
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

function leerEnvLocal() {
  const archivo = path.join(RAIZ, ".env.local")
  if (!existsSync(archivo)) return {}
  const valores = {}
  for (const linea of readFileSync(archivo, "utf8").split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m) valores[m[1]] = m[2].replace(/^["']|["']$/g, "")
  }
  return valores
}

async function responde() {
  try {
    return (await fetch(URL_APP)).ok
  } catch {
    return false
  }
}

/** Levanta Vite en PUERTO si no está corriendo. detener() solo apaga lo que levantó. */
export async function levantarApp() {
  if (await responde()) return { detener: async () => {} }
  const hijo = spawn(`npx vite --port ${PUERTO} --strictPort`, {
    cwd: RAIZ,
    shell: true,
    stdio: "ignore",
  })
  for (let i = 0; i < 60 && !(await responde()); i++) await esperar(500)
  if (!(await responde())) throw new Error(`La app no respondió en ${URL_APP} después de 30 s.`)
  return {
    detener: async () => {
      // En Windows, shell:true deja a Vite como nieto: hay que matar el árbol entero.
      if (process.platform === "win32") execSync(`taskkill /pid ${hijo.pid} /T /F`, { stdio: "ignore" })
      else hijo.kill()
    },
  }
}

export function abrirNavegador() {
  return chromium.launch({ headless: true })
}

/**
 * Página nueva del tamaño pedido. Junta los errores de la consola en `errores`.
 * Con conSesion: entra con la cuenta de Pruebas (reusa la sesión guardada si sirve).
 */
export async function nuevaPagina(navegador, { tam = "pc", conSesion = false } = {}) {
  mkdirSync(CARPETA, { recursive: true })
  const contexto = await navegador.newContext({
    viewport: TAMANOS[tam],
    storageState: conSesion && existsSync(ESTADO_SESION) ? ESTADO_SESION : undefined,
  })
  const page = await contexto.newPage()
  const errores = []
  page.on("console", (m) => {
    if (m.type() === "error") errores.push(m.text())
  })
  page.on("pageerror", (e) => errores.push(e.message))
  if (conSesion) await asegurarSesion(page)
  return { page, contexto, errores }
}

async function asegurarSesion(page) {
  await page.goto(`${URL_APP}/hub`)
  await page.waitForLoadState("networkidle")
  if ((await page.locator("#username").count()) === 0) return // la sesión guardada sirve

  const env = leerEnvLocal()
  if (!env.PRUEBAS_USUARIO || !env.PRUEBAS_CLAVE) {
    throw new Error("Faltan PRUEBAS_USUARIO y PRUEBAS_CLAVE en .env.local (cuenta del Área de Pruebas).")
  }
  await page.fill("#username", env.PRUEBAS_USUARIO)
  await page.fill("#password", env.PRUEBAS_CLAVE)
  await page.getByRole("button", { name: "Iniciar sesión" }).click()
  await page.waitForURL((u) => u.pathname !== "/", { timeout: 15000 }).catch(() => {})
  if ((await page.locator("#username").count()) > 0) {
    const aviso = await page.getByRole("alert").first().textContent().catch(() => null)
    throw new Error(`No pudo entrar con la cuenta de Pruebas: ${aviso ?? "revisar usuario y clave"}`)
  }
  await page.waitForLoadState("networkidle")
  await page.context().storageState({ path: ESTADO_SESION })
}

/** Nombre de archivo para una foto: /panel-paradas + telefono -> panel-paradas-telefono.png */
export function rutaFoto(ruta, tam, sufijo = "") {
  const base = ruta.replace(/^\/+|\/+$/g, "").replace(/[^a-z0-9]+/gi, "-") || "inicio"
  return path.join(CARPETA, `${base}${sufijo ? `-${sufijo}` : ""}-${tam}.png`)
}

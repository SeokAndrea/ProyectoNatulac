---
name: probar-app
description: Abre la app de Natulac en un navegador real (Playwright) para sacar fotos de pantallas en PC y teléfono, ver errores de consola o probar un recorrido (clics, formularios). Usar cuando la dueña pide "muéstrame cómo se ve…", "saca una foto de…", "revisa en la app que…", o para confirmar un cambio de pantalla antes de subirlo.
---

# Probar la app en el navegador

Los scripts están en `.claude/skills/probar-app/scripts/` y usan Playwright, que es dependencia de desarrollo del proyecto. No hace falta Python.

- **`fotos.mjs`**: saca fotos de una o varias rutas.
- **`natulac.mjs`**: ayudantes para recorridos a medida:
  - `levantarApp()` levanta Vite en el puerto 5199, o reusa el que ya esté corriendo.
  - `abrirNavegador()` abre Chromium.
  - `nuevaPagina(nav, { tam, conSesion })` entrega `{ page, contexto, errores }`.
  - `rutaFoto(ruta, tam, sufijo)` arma el nombre del archivo de cada foto.

Las fotos quedan en la carpeta temporal del sistema (`%TEMP%\natulac-pruebas\`), nunca en el repo.

## Fotos (lo más común)

Correr desde `ProyectoNatulac/`:

```bash
# Sin entrar (pantalla de entrada), PC y teléfono:
node .claude/skills/probar-app/scripts/fotos.mjs entrada

# Con la cuenta de Pruebas, solo teléfono, varias pantallas:
node .claude/skills/probar-app/scripts/fotos.mjs --sesion --tam telefono hub paradas lineas
```

Las rutas van **sin barra inicial**, porque Git Bash convierte `/algo` en una ruta de Windows. `entrada` es la pantalla de entrada (`/`).

Cada foto se imprime como `FOTO /ruta (tam) -> archivo`. Abrir el PNG con Read para verlo.

Al responder:
- Describir lo que se ve.
- Dar la ruta del archivo, para que la dueña lo abra.
- Avisar si salió `ERROR CONSOLA` o `[redirigió a …]`. Lo segundo suele significar que la cuenta no tiene permiso para esa pantalla, o que no entró.

**Tamaños:**
- `pc`: 1280×800.
- `telefono`: 400×850. Los supervisores usan la app sobre todo en el teléfono, así que conviene revisar los dos.

**Rutas:**
- **Sin sesión:** `/` (entrada).
- **Con sesión:**
  - **Entrada y turno:** `/hub`, `/turno`, `/finalizar-turno`, `/mis-actas`.
  - **Producción:** `/preparacion`, `/preparacion-plc`, `/lineas`, `/producto-terminado`, `/programacion`.
  - **Paradas y fallas:** `/paradas`, `/panel-paradas`, `/catalogo-paradas`, `/solicitudes-intervencion`.
  - **Paneles y validación:** `/panel-produccion`, `/resumen-dia`, `/validar-jornada`.
  - **Calidad y servicios:** `/calidad`, `/servicios-industriales`, `/registros-servicios-industriales`.
  - **Calculadoras:** `/calculadoras`, `/calculadora-bobina`, `/calculadora-conteo-peso`, `/calculadora-formula`.
  - **Administración:** `/personal`, `/edicion-datos`, `/auditoria`, `/errores`.

## Recorridos a medida (clics, formularios)

Escribir un script `.mjs` en el scratchpad que importe los ayudantes por ruta absoluta y correrlo con `node`:

```js
import { abrirNavegador, levantarApp, nuevaPagina, rutaFoto, URL_APP } from "file:///C:/Users/Jefe Aseptico/Documents/natulac-aseptico/ProyectoNatulac/.claude/skills/probar-app/scripts/natulac.mjs"

const app = await levantarApp()
const nav = await abrirNavegador()
try {
  const { page, errores } = await nuevaPagina(nav, { tam: "telefono", conSesion: true })
  await page.goto(`${URL_APP}/paradas`)
  await page.waitForLoadState("networkidle")        // siempre antes de mirar la pantalla
  await page.getByRole("button", { name: "Nueva parada" }).click()
  await page.screenshot({ path: rutaFoto("/paradas", "telefono", "formulario"), fullPage: true })
  console.log(errores)
} finally {
  await nav.close()
  await app.detener()
}
```

Para buscar elementos, preferir lo que ve la persona:
- `getByRole("button", { name })`
- `getByLabel("…")`
- `getByText("…")`

Si no se sabe qué hay en la pantalla, sacar primero una foto o listar `page.getByRole("button").allTextContents()`.

## Reglas (importantes)

- **Solo la cuenta de Pruebas.** Sus datos están en `.env.local` como `PRUEBAS_USUARIO` y `PRUEBAS_CLAVE`, sin prefijo `VITE_` para que no lleguen al navegador. Nunca usar la cuenta de la dueña (`agomez`) ni la de un operario, y nunca mostrar la clave en el chat.
- **La base es la real.** Un recorrido que guarde algo (abrir turno, registrar parada, cargar PT) solo dentro del Área de Pruebas, y **preguntar antes** de correrlo. Mirar y sacar fotos no necesita permiso.
- **Si faltan las variables**, el script falla con `Faltan PRUEBAS_USUARIO y PRUEBAS_CLAVE`. En ese caso, pedirle a la dueña que las agregue a `.env.local`, no inventarlas.
- **Las fotos pueden tener datos reales de la planta:** no publicarlas ni subirlas a ningún lado sin que la dueña lo pida.
- **Si la cuenta de Pruebas cae en "Primer ingreso"**, la dueña tiene que completarlo una vez a mano.
- **Si la sesión guardada deja de servir** (cambio de clave, o el modo EXIGIR de la migración 20261109690000), se vuelve a entrar sola. Si falla igual, borrar `%TEMP%\natulac-pruebas\sesion-pruebas.json`.

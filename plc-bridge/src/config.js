// Configuracion del bridge: se lee de bridge.conf (carpeta plc-bridge), una
// linea CLAVE=VALOR por ajuste, "#" para comentarios. Ver el manual
// (Manual-plc-bridge.pdf) para el detalle de cada clave.
//
// Prioridad: si la misma clave viene como variable de entorno (un "set" en el
// .bat o "environment:" en docker-compose.yml), gana la variable de entorno.
// Asi el .bat solo decide real/simulacion y el resto sale del archivo.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const RUTA_CONF = join(dirname(fileURLToPath(import.meta.url)), "..", "bridge.conf");

const PREFIJO_EXTRA = "PLC_EXTRA_";

// Tipos de direccion que entiende nodes7, formato DB<n>,<TIPO><offset>.
const FORMATO_DIRECCION = /^DB\d+,(X\d+\.[0-7]|(BYTE|CHAR|INT|WORD|DINT|DWORD|REAL)\d+)$/;

function leerArchivo() {
  const valores = {};
  if (!existsSync(RUTA_CONF)) return valores;

  readFileSync(RUTA_CONF, "utf8")
    .split(/\r?\n/)
    .forEach((lineaCruda, i) => {
      const linea = lineaCruda.trim();
      if (linea === "" || linea.startsWith("#")) return;
      const igual = linea.indexOf("=");
      if (igual === -1) {
        throw new Error(`bridge.conf linea ${i + 1}: falta el "=" en "${linea}".`);
      }
      const clave = linea.slice(0, igual).trim();
      const valor = linea.slice(igual + 1).trim();
      if (!/^[A-Z0-9_]+$/.test(clave)) {
        throw new Error(`bridge.conf linea ${i + 1}: la clave "${clave}" solo puede tener MAYUSCULAS, numeros y "_".`);
      }
      valores[clave] = valor;
    });
  return valores;
}

function leerArchivoOSalir() {
  try {
    return leerArchivo();
  } catch (error) {
    console.error(`[plc-bridge] ERROR en la configuracion: ${error.message}`);
    process.exit(1);
  }
}

const delArchivo = leerArchivoOSalir();

export const archivoEncontrado = existsSync(RUTA_CONF);

export function leer(clave, porDefecto) {
  const deEntorno = process.env[clave];
  if (deEntorno !== undefined && deEntorno !== "") return deEntorno;
  const deArchivo = delArchivo[clave];
  if (deArchivo !== undefined && deArchivo !== "") return deArchivo;
  return porDefecto;
}

/** Devuelve la direccion en mayusculas, o lanza un error claro si no tiene formato nodes7. */
export function validarDireccion(clave, direccion) {
  const normalizada = String(direccion).replace(/\s+/g, "").toUpperCase();
  if (!FORMATO_DIRECCION.test(normalizada)) {
    throw new Error(
      `${clave}="${direccion}" no es una direccion valida. Formato: DB<numero>,<TIPO><offset> ` +
        `(ej. DB5,DINT0 / DB5,REAL4 / DB5,X14.0). Tipos: X, BYTE, CHAR, INT, WORD, DINT, DWORD, REAL.`,
    );
  }
  return normalizada;
}

/** Tags adicionales PLC_EXTRA_<NOMBRE>=<direccion>, de archivo y de entorno. */
export function tagsExtra() {
  const claves = new Set([
    ...Object.keys(delArchivo),
    ...Object.keys(process.env).filter((c) => c.startsWith(PREFIJO_EXTRA)),
  ]);
  return [...claves]
    .filter((clave) => clave.startsWith(PREFIJO_EXTRA) && clave.length > PREFIJO_EXTRA.length)
    .map((clave) => ({ clave, direccion: leer(clave, "") }))
    .filter(({ direccion }) => direccion !== "")
    .map(({ clave, direccion }) => ({
      nombre: clave.slice(PREFIJO_EXTRA.length).toLowerCase(),
      direccion: validarDireccion(clave, direccion),
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

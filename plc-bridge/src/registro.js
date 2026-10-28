// Registro de llenados: cuando el PLC selecciona un tanque (PLC_ID_Tanque pasa
// a 1/2/3) se abre un llenado, y se cierra cuando pasa a otro tanque o a 0.
// Cada llenado guarda tanque, hora de inicio, hora de fin y el ultimo valor de
// PLC_Totales_Litros (DB5,DINT8) que se leyo mientras estuvo abierto: el PLC
// suma ese total mientras el tanque esta seleccionado y lo pone en cero al
// cambiar de tanque. El bridge no calcula litros, solo guarda lo que leyo.
//
// Se guarda en un archivo JSON (carpeta PLC_REGISTRO_CARPETA, por defecto
// plc-bridge/datos), uno para "real" y otro para "simulacion", asi las pruebas
// no ensucian el registro de verdad. Si el bridge se reinicia con un llenado
// abierto, ese llenado se cierra con motivo "bridge reiniciado".

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { leer } from "./config.js";

const MAXIMO_GUARDADOS = 500;
const GUARDAR_CADA_MS = 5000;

export function crearRegistro({ modo }) {
  const carpeta = leer("PLC_REGISTRO_CARPETA", join(dirname(fileURLToPath(import.meta.url)), "..", "datos"));
  const archivo = join(carpeta, modo === "real" ? "llenados.json" : "llenados-simulacion.json");

  let ultimoGuardadoMs = 0;
  let pendiente = false;
  let llenados = cargar();
  let abierto = llenados.find((l) => l.fin === null) ?? null;
  if (abierto) {
    abierto.fin = abierto.ultima_lectura ?? abierto.inicio;
    abierto.motivo_fin = "bridge reiniciado";
    abierto = null;
    guardar();
  }

  console.log(`[plc-bridge] registro de llenados: ${archivo} (${llenados.length} guardados)`);

  function cargar() {
    if (!existsSync(archivo)) return [];
    try {
      const datos = JSON.parse(readFileSync(archivo, "utf8"));
      return Array.isArray(datos) ? datos : [];
    } catch (error) {
      console.error(`[plc-bridge] no se pudo leer ${archivo} (${error.message}); se empieza un registro nuevo.`);
      return [];
    }
  }

  function guardar() {
    try {
      mkdirSync(carpeta, { recursive: true });
      // Se escribe aparte y se renombra: un corte a mitad no deja el archivo roto.
      writeFileSync(archivo + ".tmp", JSON.stringify(llenados, null, 1));
      renameSync(archivo + ".tmp", archivo);
      ultimoGuardadoMs = Date.now();
      pendiente = false;
    } catch (error) {
      console.error(`[plc-bridge] no se pudo guardar ${archivo}: ${error.message}`);
    }
  }

  function cerrar(timestamp, motivo) {
    abierto.fin = timestamp;
    abierto.motivo_fin = motivo;
    console.log(`[plc-bridge] llenado cerrado: tanque ${abierto.tanque}, ${abierto.litros_tanque ?? "sin dato"} L (${motivo})`);
    abierto = null;
    guardar();
  }

  function abrir(tanque, timestamp) {
    abierto = {
      tanque,
      inicio: timestamp,
      fin: null,
      litros_tanque: null,
      ultima_lectura: timestamp,
      motivo_fin: null,
    };
    llenados.unshift(abierto);
    if (llenados.length > MAXIMO_GUARDADOS) llenados = llenados.slice(0, MAXIMO_GUARDADOS);
    console.log(`[plc-bridge] llenado abierto: tanque ${tanque}`);
    guardar();
  }

  return {
    /** Recibe cada lectura del PLC (o de la simulacion) y abre/cierra llenados. */
    procesar(estado) {
      // Sin comunicacion con el PLC no se sabe que tanque esta seleccionado:
      // no se abre ni se cierra nada hasta que vuelva.
      if (estado.conectado === false) return;

      const tanque = estado.tanque_activo ?? null;
      if (abierto && tanque !== abierto.tanque) {
        cerrar(estado.timestamp, tanque ? `cambio a tanque ${tanque}` : "sin tanque seleccionado");
      }
      if (tanque && !abierto) abrir(tanque, estado.timestamp);

      if (abierto) {
        if (estado.litros_tanque != null && estado.litros_tanque !== abierto.litros_tanque) {
          abierto.litros_tanque = estado.litros_tanque;
          pendiente = true;
        }
        abierto.ultima_lectura = estado.timestamp;
        if (pendiente && Date.now() - ultimoGuardadoMs >= GUARDAR_CADA_MS) guardar();
      }
    },

    /** Los mas recientes primero; el que esta abierto tiene fin = null. */
    ultimos(cantidad) {
      return llenados.slice(0, cantidad).map(({ ultima_lectura: _interna, ...llenado }) => llenado);
    },

    detener() {
      if (pendiente) guardar();
    },
  };
}

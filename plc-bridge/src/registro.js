// Registros que lleva el bridge con lo que lee del PLC (sin calcular litros):
//
// - Llenados: cuando el PLC selecciona un tanque (PLC_ID_Tanque pasa a 1/2/3)
//   se abre un llenado, y se cierra cuando pasa a otro tanque o a 0. Cada
//   llenado guarda tanque, hora de inicio, hora de fin y el ultimo valor de
//   PLC_Totales_Litros (DB5,DINT8) leido mientras estuvo abierto: el PLC suma
//   ese total mientras el tanque esta seleccionado y lo pone en cero al
//   cambiar de tanque.
//
// - Aperturas de la valvula auxiliar (Actuador_Aux_Tank_X): cada vez que el
//   bit pasa a 1 se abre una apertura, y se cierra cuando vuelve a 0. Guarda
//   quien la abrio y quien la cerro: { usuario, nombre } si el cambio llego
//   dentro de ORDEN_VIGENTE_MS de una orden de la app, null si no (la abrieron
//   o cerraron desde la HMI / el PLC).
//
// Se guardan en archivos JSON (carpeta PLC_REGISTRO_CARPETA, por defecto
// plc-bridge/datos), aparte para "real" y "simulacion", asi las pruebas no
// ensucian el registro de verdad. Si el bridge se reinicia con algo abierto,
// se cierra con motivo "bridge reiniciado".

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { leer } from "./config.js";

const MAXIMO_GUARDADOS = 500;
const GUARDAR_CADA_MS = 5000;
const NUMEROS_TANQUE = [1, 2, 3];
// Cuanto espera una orden de la app a que la valvula cambie para atribuirsela.
const ORDEN_VIGENTE_MS = 10000;

/** Lista guardada en un archivo JSON, la mas reciente primero. */
function crearAlmacen(archivo) {
  let lista = [];
  if (existsSync(archivo)) {
    try {
      const datos = JSON.parse(readFileSync(archivo, "utf8"));
      if (Array.isArray(datos)) lista = datos;
    } catch (error) {
      console.error(`[plc-bridge] no se pudo leer ${archivo} (${error.message}); se empieza un registro nuevo.`);
    }
  }

  const almacen = {
    lista,
    guardar() {
      try {
        mkdirSync(dirname(archivo), { recursive: true });
        // Se escribe aparte y se renombra: un corte a mitad no deja el archivo roto.
        writeFileSync(archivo + ".tmp", JSON.stringify(almacen.lista, null, 1));
        renameSync(archivo + ".tmp", archivo);
      } catch (error) {
        console.error(`[plc-bridge] no se pudo guardar ${archivo}: ${error.message}`);
      }
    },
    agregar(item) {
      almacen.lista.unshift(item);
      if (almacen.lista.length > MAXIMO_GUARDADOS) almacen.lista = almacen.lista.slice(0, MAXIMO_GUARDADOS);
    },
    /** Lo que quedo abierto de una corrida anterior del bridge se cierra en su ultima lectura. */
    cerrarAbiertosAlArrancar() {
      const abiertos = almacen.lista.filter((item) => item.fin === null);
      for (const item of abiertos) {
        item.fin = item.ultima_lectura ?? item.inicio;
        item.motivo_fin = "bridge reiniciado";
      }
      if (abiertos.length) almacen.guardar();
    },
    ultimos(cantidad) {
      return almacen.lista.slice(0, cantidad).map(({ ultima_lectura: _interna, ...item }) => item);
    },
  };
  return almacen;
}

export function crearRegistro({ modo }) {
  const carpeta = leer("PLC_REGISTRO_CARPETA", join(dirname(fileURLToPath(import.meta.url)), "..", "datos"));
  const sufijo = modo === "real" ? "" : "-simulacion";
  const llenados = crearAlmacen(join(carpeta, `llenados${sufijo}.json`));
  const aperturasAux = crearAlmacen(join(carpeta, `aperturas-aux${sufijo}.json`));
  llenados.cerrarAbiertosAlArrancar();
  aperturasAux.cerrarAbiertosAlArrancar();

  let llenadoAbierto = null;
  const auxAbiertas = {}; // tanque -> apertura en curso
  const ordenesAux = {}; // tanque -> { abrir, persona, hastaMs } de la ultima orden de la app
  let ultimoGuardadoMs = 0;
  let pendiente = false; // hay algo sin guardar
  let huboCambio = false; // se abrio o cerro algo en esta lectura

  console.log(`[plc-bridge] registro de llenados y valvulas auxiliares: ${carpeta} (modo ${modo})`);

  function guardarTodo() {
    llenados.guardar();
    aperturasAux.guardar();
    ultimoGuardadoMs = Date.now();
    pendiente = false;
  }

  function procesarLlenado(estado) {
    const tanque = estado.tanque_activo ?? null;
    if (llenadoAbierto && tanque !== llenadoAbierto.tanque) {
      llenadoAbierto.fin = estado.timestamp;
      llenadoAbierto.motivo_fin = tanque ? `cambio a tanque ${tanque}` : "sin tanque seleccionado";
      console.log(
        `[plc-bridge] llenado cerrado: tanque ${llenadoAbierto.tanque}, ${llenadoAbierto.litros_tanque ?? "sin dato"} L (${llenadoAbierto.motivo_fin})`,
      );
      llenadoAbierto = null;
      huboCambio = true;
    }
    if (tanque && !llenadoAbierto) {
      llenadoAbierto = { tanque, inicio: estado.timestamp, fin: null, litros_tanque: null, motivo_fin: null };
      llenados.agregar(llenadoAbierto);
      console.log(`[plc-bridge] llenado abierto: tanque ${tanque}`);
      huboCambio = true;
    }
    if (llenadoAbierto) {
      if (estado.litros_tanque != null && estado.litros_tanque !== llenadoAbierto.litros_tanque) {
        llenadoAbierto.litros_tanque = estado.litros_tanque;
        pendiente = true;
      }
      llenadoAbierto.ultima_lectura = estado.timestamp;
    }
  }

  /** Quien pidio este cambio desde la app, o null si no hay una orden vigente que coincida. */
  function quienOrdeno(tanque, abrir) {
    const orden = ordenesAux[tanque];
    delete ordenesAux[tanque];
    return orden && orden.abrir === abrir && Date.now() <= orden.hastaMs ? orden.persona : null;
  }

  function nombreDe(persona) {
    return persona ? persona.nombre : "HMI/PLC";
  }

  function procesarAux(estado) {
    for (const tanque of NUMEROS_TANQUE) {
      const abierta = !!estado.auxiliares?.[tanque];
      const apertura = auxAbiertas[tanque];
      if (abierta && !apertura) {
        const persona = quienOrdeno(tanque, true);
        auxAbiertas[tanque] = { tanque, inicio: estado.timestamp, abierta_por: persona, fin: null, cerrada_por: null, motivo_fin: null };
        aperturasAux.agregar(auxAbiertas[tanque]);
        console.log(`[plc-bridge] valvula auxiliar abierta: tanque ${tanque} (${nombreDe(persona)})`);
        huboCambio = true;
      } else if (!abierta && apertura) {
        apertura.fin = estado.timestamp;
        apertura.cerrada_por = quienOrdeno(tanque, false);
        console.log(`[plc-bridge] valvula auxiliar cerrada: tanque ${tanque} (${nombreDe(apertura.cerrada_por)})`);
        delete auxAbiertas[tanque];
        huboCambio = true;
      }
      if (auxAbiertas[tanque]) auxAbiertas[tanque].ultima_lectura = estado.timestamp;
    }
  }

  return {
    /** Recibe cada lectura del PLC (o de la simulacion) y abre/cierra registros. */
    procesar(estado) {
      // Sin comunicacion con el PLC no se sabe que tanque esta seleccionado ni
      // como estan las valvulas: no se abre ni se cierra nada hasta que vuelva.
      if (estado.conectado === false) return;

      huboCambio = false;
      procesarLlenado(estado);
      procesarAux(estado);

      // Abrir o cerrar se guarda enseguida; el avance de litros, cada 5 s.
      if (huboCambio || (pendiente && Date.now() - ultimoGuardadoMs >= GUARDAR_CADA_MS)) guardarTodo();
    },

    /** Los mas recientes primero; el que esta abierto tiene fin = null. */
    ultimosLlenados(cantidad) {
      return llenados.ultimos(cantidad);
    },

    ultimasAperturasAux(cantidad) {
      return aperturasAux.ultimos(cantidad);
    },

    /** Una orden de la app ya escrita al PLC: el proximo cambio de esa valvula es de esta persona. */
    anotarOrdenAux(tanque, abrir, persona) {
      ordenesAux[tanque] = { abrir, persona, hastaMs: Date.now() + ORDEN_VIGENTE_MS };
    },

    /** La escritura fallo: el proximo cambio ya no es de esa orden. */
    cancelarOrdenAux(tanque) {
      delete ordenesAux[tanque];
    },

    detener() {
      if (pendiente) guardarTodo();
    },
  };
}

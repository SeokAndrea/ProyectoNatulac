// Fuente real: lee el PLC Siemens (S7-1200 CPU 1212C, firmware V2.2) por
// S7comm usando "nodes7" (JS puro, sin compilacion nativa -> no complica el
// Dockerfile con node:20-alpine).
//
// Direcciones por defecto = DB_MONITOREO (DB5) de "Prom_Preparacion",
// confirmado por automatizacion 2026-10-16: acceso optimizado desactivado,
// valores reales (sin escalado), PUT/GET habilitado (viene asi por defecto
// en el 1200). Si el DB cambia, se corrige PLC_TAG_* en bridge.conf.
//
// PLC_ID_Tanque: 0 = ningun tanque seleccionado, 1/2/3 = ese tanque esta en
// uso (confirmado por el dueno 2026-10-16).
//
// Actuador_Valv_Tank_1/2/3 (offset 14.0-14.2): valvula de ENTRADA de agua de
// cada tanque (la que llena con el flujometro). TRUE = abierta.
//
// Actuador_Aux_Tank_1/2/3 (offset 14.3-14.5): otra valvula por tanque, pero
// NO es "entrada de agua" -- es la que se habilita para RECIRCULAR producto
// durante la preparacion, o para el CIP (limpieza), segun el caso. El PLC
// solo entrega el bit TRUE/FALSE; que significa en cada momento depende de
// en que "condicion" tiene la app ese tanque ahora mismo
// (recepcion_tanques.condicion: EN_PREPARACION -> recirculando, CIP -> CIP).
// Por eso aqui se pasa tal cual en "auxiliares" sin interpretarlo -- la
// interpretacion (recirculando vs. CIP) le corresponde al frontend, que ya
// sabe la condicion del tanque via turno_json()/volumen_vivo_tanque().
// No se usa para calcular tanque_activo/llenando (eso lo decide la valvula
// de entrada + PLC_ID_Tanque).

import NodeS7 from "nodes7";
import { leer, tagsExtra, validarDireccion } from "../config.js";

// Tags "base": tienen un significado fijo y la pantalla los usa para dibujar
// los tanques. Clave en bridge.conf -> nombre interno -> direccion por defecto.
const TAGS_BASE = [
  ["PLC_TAG_SETPOINT", "setpoint_l", "DB5,DINT0"],
  ["PLC_TAG_LITROS_ACTUALES", "litros_actuales", "DB5,DINT4"],
  ["PLC_TAG_TANQUE_ACTIVO", "tanque_activo", "DB5,INT12"],
  ["PLC_TAG_VALVULA_1", "valvula_1", "DB5,X14.0"],
  ["PLC_TAG_VALVULA_2", "valvula_2", "DB5,X14.1"],
  ["PLC_TAG_VALVULA_3", "valvula_3", "DB5,X14.2"],
  ["PLC_TAG_AUX_1", "aux_1", "DB5,X14.3"],
  ["PLC_TAG_AUX_2", "aux_2", "DB5,X14.4"],
  ["PLC_TAG_AUX_3", "aux_3", "DB5,X14.5"],
  ["PLC_TAG_TOTALES", "litros_totales", "DB5,DINT8"],
  ["PLC_TAG_CAUDAL", "caudal_l_min", ""],
];

const PREFIJO_EXTRA_INTERNO = "extra.";

function construirMapaTags() {
  const mapa = {};
  for (const [clave, nombre, porDefecto] of TAGS_BASE) {
    const direccion = leer(clave, porDefecto);
    // Vacio = no se lee (ej. PLC_TAG_CAUDAL: sin tag, el caudal se deriva de los litros).
    if (direccion) mapa[nombre] = validarDireccion(clave, direccion);
  }
  for (const { nombre, direccion } of tagsExtra()) {
    mapa[PREFIJO_EXTRA_INTERNO + nombre] = direccion;
  }
  return mapa;
}

/** Bool tal cual; numeros sin ruido de punto flotante (los REAL llegan como 12.300000190734863). */
function limpiarValor(valor) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "boolean") return valor;
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return null;
  return Math.round(numero * 1000) / 1000;
}

export function crearFuentePlc({ onEstado, intervaloMs = 200 }) {
  const host = leer("PLC_HOST", "");
  if (!host) {
    throw new Error("PLC_HOST no esta definido en bridge.conf. Hace falta la IP del PLC para PLC_MODO=real.");
  }

  const rack = Number(leer("PLC_RACK", 0));
  const slot = Number(leer("PLC_SLOT", 1));
  const puerto = Number(leer("PLC_PUERTO", 102));
  const timeoutMs = Number(leer("PLC_TIMEOUT_MS", 5000));
  const reconexionMs = Number(leer("PLC_RECONEXION_MS", 5000));

  const tags = construirMapaTags();
  const nombresExtra = Object.keys(tags)
    .filter((n) => n.startsWith(PREFIJO_EXTRA_INTERNO))
    .map((n) => n.slice(PREFIJO_EXTRA_INTERNO.length));
  const conn = new NodeS7({ silent: true });

  console.log(`[plc-bridge] PLC ${host}:${puerto} rack ${rack} slot ${slot}`);
  for (const [nombre, direccion] of Object.entries(tags)) {
    console.log(`[plc-bridge]   ${nombre.padEnd(28)} ${direccion}`);
  }

  function extrasDe(valores) {
    return Object.fromEntries(
      nombresExtra.map((n) => [n, valores ? limpiarValor(valores[PREFIJO_EXTRA_INTERNO + n]) : null]),
    );
  }

  let temporizadorLectura = null;
  let temporizadorReconexion = null;
  let litrosAnteriores = null;
  let tiempoAnteriorMs = null;
  let conectado = false;
  let detenido = false;

  const tagsAvisados = new Set();

  function emitirSinDatos() {
    onEstado({
      timestamp: new Date().toISOString(),
      fuente: "plc",
      tanque_activo: null,
      setpoint_l: null,
      litros_actuales: null,
      litros_totales: null,
      caudal_l_min: null,
      valvulas: { 1: false, 2: false, 3: false },
      auxiliares: { 1: false, 2: false, 3: false },
      llenando: false,
      extra: extrasDe(null),
      tags_con_error: [],
      conectado: false,
    });
  }

  // nodes7 deja el texto "BAD <codigo>" en vez del valor cuando el PLC no
  // pudo entregar ESE tag (DB inexistente, offset fuera del DB, DB optimizado).
  function esMalo(valor) {
    return typeof valor === "string" && valor.startsWith("BAD");
  }

  function avisarTagsMalos(malos) {
    for (const nombre of malos) {
      if (tagsAvisados.has(nombre)) continue;
      tagsAvisados.add(nombre);
      console.error(
        `[plc-bridge] el PLC no entrega "${nombre}" (${tags[nombre]}): revisar numero de DB, offset y tipo en bridge.conf.`,
      );
    }
    for (const nombre of [...tagsAvisados]) {
      if (!malos.includes(nombre)) tagsAvisados.delete(nombre);
    }
  }

  function calcularTanqueActivo(valores) {
    if (valores.tanque_activo !== undefined && valores.tanque_activo !== null) {
      return Number(valores.tanque_activo) || null;
    }
    if (valores.valvula_1) return 1;
    if (valores.valvula_2) return 2;
    if (valores.valvula_3) return 3;
    return null;
  }

  function calcularCaudal(valores, ahoraMs) {
    if (valores.caudal_l_min !== undefined) return Number(valores.caudal_l_min) || 0;

    // Sin tag directo de caudal: lo derivamos del delta de litros entre lecturas.
    if (litrosAnteriores === null || tiempoAnteriorMs === null) return 0;
    const deltaLitros = Number(valores.litros_actuales) - litrosAnteriores;
    const deltaMin = (ahoraMs - tiempoAnteriorMs) / 60000;
    if (deltaMin <= 0) return 0;
    return Math.max(0, deltaLitros / deltaMin);
  }

  function leerCiclo() {
    conn.readAllItems((hayMalos, valoresCrudos) => {
      if (detenido) return;

      const nombres = Object.keys(tags);
      const malos = hayMalos ? nombres.filter((n) => esMalo(valoresCrudos?.[n]) || !(n in (valoresCrudos ?? {}))) : [];

      if (!valoresCrudos || malos.length === nombres.length) {
        // Ninguna lectura valida (conexion caida o todo mal): "sin datos" en
        // vez de quedarnos con el ultimo valor bueno, que podria ser viejo.
        // nodes7 reintenta la conexion TCP solo.
        emitirSinDatos();
        return;
      }

      // Un tag mal configurado llega vacio (null) y se avisa, pero no tumba
      // al resto: un tag nuevo con offset equivocado no deja la pantalla en blanco.
      avisarTagsMalos(malos);
      const valores = Object.fromEntries(nombres.map((n) => [n, malos.includes(n) ? null : valoresCrudos[n]]));

      const ahoraMs = Date.now();
      const litrosActuales = Number(valores.litros_actuales) || 0;
      const caudalLMin = calcularCaudal(valores, ahoraMs);

      onEstado({
        timestamp: new Date().toISOString(),
        fuente: "plc",
        tanque_activo: calcularTanqueActivo(valores),
        setpoint_l: valores.setpoint_l != null ? Number(valores.setpoint_l) : null,
        litros_actuales: litrosActuales,
        litros_totales: valores.litros_totales != null ? Number(valores.litros_totales) : null,
        caudal_l_min: Math.round(caudalLMin * 10) / 10,
        valvulas: {
          1: !!valores.valvula_1,
          2: !!valores.valvula_2,
          3: !!valores.valvula_3,
        },
        auxiliares: {
          1: !!valores.aux_1,
          2: !!valores.aux_2,
          3: !!valores.aux_3,
        },
        llenando: !!(valores.valvula_1 || valores.valvula_2 || valores.valvula_3),
        extra: extrasDe(valores),
        tags_con_error: malos,
        conectado: true,
      });

      litrosAnteriores = litrosActuales;
      tiempoAnteriorMs = ahoraMs;
    });
  }

  function conectar() {
    if (detenido) return;

    conn.initiateConnection({ host, port: puerto, rack, slot, timeout: timeoutMs }, (error) => {
      if (detenido) return;

      if (error) {
        conectado = false;
        emitirSinDatos();
        temporizadorReconexion = setTimeout(conectar, reconexionMs);
        return;
      }

      conectado = true;
      conn.setTranslationCB((tag) => tags[tag]);
      conn.addItems(Object.keys(tags));
      temporizadorLectura = setInterval(leerCiclo, intervaloMs);
    });
  }

  return {
    iniciar() {
      conectar();
    },
    detener() {
      detenido = true;
      if (temporizadorLectura) clearInterval(temporizadorLectura);
      if (temporizadorReconexion) clearTimeout(temporizadorReconexion);
      if (conectado) conn.dropConnection(() => {});
    },
  };
}

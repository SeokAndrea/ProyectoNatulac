// Fuente real: lee el PLC Siemens (S7-1200 CPU 1212C, firmware V2.2) por
// S7comm usando "nodes7" (JS puro, sin compilacion nativa -> no complica el
// Dockerfile con node:20-alpine).
//
// Direcciones por defecto = DB_MONITOREO (DB5) de "Prom_Preparacion",
// confirmado por automatizacion 2026-10-16: acceso optimizado desactivado,
// valores reales (sin escalado), PUT/GET habilitado (viene asi por defecto
// en el 1200). Overrides por PLC_TAG_* en .env si el DB cambia.
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

function leerEnv(nombre, porDefecto) {
  const valor = process.env[nombre];
  return valor === undefined || valor === "" ? porDefecto : valor;
}

function construirMapaTags() {
  const mapa = {
    setpoint_l: leerEnv("PLC_TAG_SETPOINT", "DB5,DINT0"),
    litros_actuales: leerEnv("PLC_TAG_LITROS_ACTUALES", "DB5,DINT4"),
    tanque_activo: leerEnv("PLC_TAG_TANQUE_ACTIVO", "DB5,INT12"),
    valvula_1: leerEnv("PLC_TAG_VALVULA_1", "DB5,X14.0"),
    valvula_2: leerEnv("PLC_TAG_VALVULA_2", "DB5,X14.1"),
    valvula_3: leerEnv("PLC_TAG_VALVULA_3", "DB5,X14.2"),
    aux_1: leerEnv("PLC_TAG_AUX_1", "DB5,X14.3"),
    aux_2: leerEnv("PLC_TAG_AUX_2", "DB5,X14.4"),
    aux_3: leerEnv("PLC_TAG_AUX_3", "DB5,X14.5"),
  };

  const tagCaudal = leerEnv("PLC_TAG_CAUDAL", "");
  if (tagCaudal) mapa.caudal_l_min = tagCaudal;

  const tagTotales = leerEnv("PLC_TAG_TOTALES", "DB5,DINT8");
  if (tagTotales) mapa.litros_totales = tagTotales;

  return mapa;
}

export function crearFuentePlc({ onEstado, intervaloMs = 200 }) {
  const host = process.env.PLC_HOST;
  if (!host) {
    throw new Error("PLC_HOST no esta definido. Hace falta la IP del PLC para PLC_MODO=real.");
  }

  const rack = Number(leerEnv("PLC_RACK", 0));
  const slot = Number(leerEnv("PLC_SLOT", 1));
  const puerto = Number(leerEnv("PLC_PUERTO", 102));
  const timeoutMs = Number(leerEnv("PLC_TIMEOUT_MS", 5000));
  const reconexionMs = Number(leerEnv("PLC_RECONEXION_MS", 5000));

  const tags = construirMapaTags();
  const conn = new NodeS7();

  let temporizadorLectura = null;
  let temporizadorReconexion = null;
  let litrosAnteriores = null;
  let tiempoAnteriorMs = null;
  let conectado = false;
  let detenido = false;

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
      conectado: false,
    });
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
    conn.readAllItems((anuladoPorError, valores) => {
      if (detenido) return;

      if (anuladoPorError) {
        // nodes7 reintenta la conexion TCP sola; mientras no haya lectura
        // valida, avisamos "sin datos" en vez de quedarnos con el ultimo
        // valor bueno (que podria ser viejo y enganoso).
        emitirSinDatos();
        return;
      }

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

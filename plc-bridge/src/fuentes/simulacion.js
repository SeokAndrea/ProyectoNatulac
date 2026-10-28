// Fuente simulada de datos de llenado, mientras no hay conexion fisica al PLC.
//
// Modela la tuberia real: un solo flujometro en la linea principal, luego una
// cruz que reparte el agua a 3 valvulas (una por tanque). Solo un tanque se
// llena a la vez porque el flujometro es compartido.
//
// Cualquier fuente futura (por ejemplo una que hable S7comm con el PLC real)
// debe exponer la misma forma: { iniciar(), detener() } y llamar a onEstado()
// con un objeto con la misma forma que emitir() produce aqui, para que
// servidor.js no tenga que cambiar.

import { tagsExtra } from "../config.js";

const NUMEROS_TANQUE = [1, 2, 3];

export function crearFuenteSimulacion({ onEstado, intervaloMs = 200, pausaEntreLlenadosMs = 3000 }) {
  let indiceTanque = 0;
  let tanqueActivo = null;
  let setpointL = 0;
  let litrosActuales = 0;
  // Como PLC_Totales_Litros: suma lo que entra al tanque y vuelve a 0 al
  // seleccionar un tanque distinto.
  let litrosTanque = 0;
  let ultimoTanque = null;
  let caudalLMin = 0;
  let pausaHastaMs = 0;
  let temporizador = null;
  const extras = tagsExtra();
  for (const { nombre, direccion } of extras) {
    console.log(`[plc-bridge]   extra.${nombre.padEnd(22)} ${direccion} (valor simulado)`);
  }

  function estadoValvulas() {
    return {
      1: tanqueActivo === 1,
      2: tanqueActivo === 2,
      3: tanqueActivo === 3,
    };
  }

  function iniciarNuevoLlenado() {
    // A veces el operador vuelve al mismo tanque para un ajuste (el total del
    // PLC sigue sumando); si no, pasa al siguiente tanque.
    if (ultimoTanque !== null && Math.random() < 0.3) {
      tanqueActivo = ultimoTanque;
    } else {
      tanqueActivo = NUMEROS_TANQUE[indiceTanque % NUMEROS_TANQUE.length];
      indiceTanque += 1;
    }
    if (tanqueActivo !== ultimoTanque) litrosTanque = 0;
    ultimoTanque = tanqueActivo;
    setpointL = Math.round(500 + Math.random() * 1500); // 500-2000 L, como en un setpoint tipico del HMI
    litrosActuales = 0;
  }

  function emitir() {
    onEstado({
      timestamp: new Date().toISOString(),
      fuente: "simulacion",
      tanque_activo: tanqueActivo,
      setpoint_l: tanqueActivo ? setpointL : null,
      // DINT e INT en el PLC: llegan sin decimales.
      litros_actuales: Math.round(litrosActuales),
      litros_tanque: Math.round(litrosTanque),
      caudal_l_min: Math.round(caudalLMin),
      valvulas: estadoValvulas(),
      // Actuador_Aux_Tank_X = valvula de recirculacion/CIP, no de entrada
      // de agua (ver s7.js); la simulacion solo modela el llenado, asi que
      // se dejan siempre apagados.
      auxiliares: { 1: false, 2: false, 3: false },
      llenando: tanqueActivo !== null,
      extra: valoresExtraSimulados(),
      tags_con_error: [],
    });
  }

  // Los PLC_EXTRA_* de bridge.conf tambien salen en simulacion, con valores
  // inventados (bits que cambian cada 5 s, numeros al azar), para probar la
  // pantalla sin PLC.
  function valoresExtraSimulados() {
    const bitEncendido = Math.floor(Date.now() / 5000) % 2 === 0;
    return Object.fromEntries(
      extras.map(({ nombre, direccion }) => [
        nombre,
        direccion.includes(",X") ? bitEncendido : Math.round(Math.random() * 1000) / 10,
      ]),
    );
  }

  function tick() {
    const ahora = Date.now();

    if (tanqueActivo === null) {
      caudalLMin = 0;
      if (ahora < pausaHastaMs) {
        emitir();
        return;
      }
      iniciarNuevoLlenado();
    }

    // caudal con algo de ruido, como leeria un flujometro real
    caudalLMin = 80 + Math.random() * 60;
    const incrementoL = (caudalLMin / 60) * (intervaloMs / 1000);
    const litrosAntes = litrosActuales;
    litrosActuales = Math.min(setpointL, litrosActuales + incrementoL);
    litrosTanque += litrosActuales - litrosAntes;

    if (litrosActuales >= setpointL) {
      litrosActuales = setpointL;
      emitir();
      tanqueActivo = null;
      caudalLMin = 0;
      pausaHastaMs = ahora + pausaEntreLlenadosMs;
      return;
    }

    emitir();
  }

  return {
    iniciar() {
      temporizador = setInterval(tick, intervaloMs);
    },
    detener() {
      if (temporizador) clearInterval(temporizador);
    },
  };
}

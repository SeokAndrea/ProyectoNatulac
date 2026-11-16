// Fuente simulada (PLC_MODO=simulacion), mientras no hay conexion fisica al PLC.
//
// Modela la tuberia real: un solo flujometro en la linea principal, luego una
// cruz que reparte el agua a 3 valvulas (una por tanque). Solo un tanque se
// llena a la vez porque el flujometro es compartido. El agua entra siguiendo
// el ciclo de una preparacion (ciclo.js): fase 1 hasta el 80 %, fase 2 con los
// kits, espera de Calidad y ajustes de agua.
//
// Cualquier fuente expone la misma forma: { iniciar(), detener(),
// escribirAux() } y llama a onEstado() con un objeto como el de emitir(), para
// que index.js no tenga que cambiar.

import { leer, tagsExtra } from "../config.js";
import { crearCicloPreparacion } from "./ciclo.js";

const NUMEROS_TANQUE = [1, 2, 3];

export function crearFuenteSimulacion({ onEstado, intervaloMs = 200 }) {
  // PLC_SIM_VELOCIDAD: cuantas veces mas rapido corre el ciclo (1 = tiempo real).
  const velocidad = Number(leer("PLC_SIM_VELOCIDAD", 1)) || 1;
  const ciclo = crearCicloPreparacion({ velocidad });
  // Valvula auxiliar simulada: se abre en el tanque que termina su preparacion
  // (como si el operador la abriera desde la HMI) y se cierra sola a los 45 s.
  // Una orden de la app la deja abierta o cerrada hasta la orden siguiente.
  const AUX_ABIERTA_MS = 45000;
  const auxHastaMs = { 1: 0, 2: 0, 3: 0 };
  let anterior = null;
  let temporizador = null;
  const extras = tagsExtra();
  if (velocidad !== 1) console.log(`[plc-bridge] simulacion x${velocidad}`);
  for (const { nombre, direccion } of extras) {
    console.log(`[plc-bridge]   extra.${nombre.padEnd(22)} ${direccion} (valor simulado)`);
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
    const paso = ciclo.avanzar(intervaloMs);
    if (anterior?.preparacion.activa && !paso.preparacion.activa && anterior.tanque) {
      auxHastaMs[anterior.tanque] = Date.now() + AUX_ABIERTA_MS;
    }
    anterior = paso;

    onEstado({
      timestamp: new Date().toISOString(),
      fuente: "simulacion",
      tanque_activo: paso.tanque,
      setpoint_l: paso.setpoint_l,
      // DINT e INT en el PLC: llegan sin decimales.
      litros_actuales: Math.round(paso.litros_actuales),
      litros_tanque: Math.round(paso.litros_tanque),
      caudal_l_min: Math.round(paso.caudal_l_min),
      valvulas: Object.fromEntries(NUMEROS_TANQUE.map((n) => [n, paso.valvula_abierta && paso.tanque === n])),
      // Actuador_Aux_Tank_X = valvula de recirculacion/CIP, no de entrada de
      // agua (ver s7.js).
      auxiliares: Object.fromEntries(NUMEROS_TANQUE.map((n) => [n, Date.now() < auxHastaMs[n]])),
      llenando: paso.valvula_abierta,
      preparacion: paso.preparacion,
      extra: valoresExtraSimulados(),
      tags_con_error: [],
    });
  }

  return {
    iniciar() {
      temporizador = setInterval(tick, intervaloMs);
    },
    detener() {
      if (temporizador) clearInterval(temporizador);
    },
    escribirAux(tanque, abrir) {
      auxHastaMs[tanque] = abrir ? Infinity : 0;
      return Promise.resolve();
    },
  };
}

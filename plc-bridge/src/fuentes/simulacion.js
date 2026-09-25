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

const NUMEROS_TANQUE = [1, 2, 3];

export function crearFuenteSimulacion({ onEstado, intervaloMs = 200, pausaEntreLlenadosMs = 3000 }) {
  let indiceTanque = 0;
  let tanqueActivo = null;
  let setpointL = 0;
  let litrosActuales = 0;
  let caudalLMin = 0;
  let pausaHastaMs = 0;
  let temporizador = null;

  function estadoValvulas() {
    return {
      1: tanqueActivo === 1,
      2: tanqueActivo === 2,
      3: tanqueActivo === 3,
    };
  }

  function iniciarNuevoLlenado() {
    tanqueActivo = NUMEROS_TANQUE[indiceTanque % NUMEROS_TANQUE.length];
    indiceTanque += 1;
    setpointL = Math.round(500 + Math.random() * 1500); // 500-2000 L, como en un setpoint tipico del HMI
    litrosActuales = 0;
  }

  function emitir() {
    onEstado({
      timestamp: new Date().toISOString(),
      fuente: "simulacion",
      tanque_activo: tanqueActivo,
      setpoint_l: tanqueActivo ? setpointL : null,
      litros_actuales: Math.round(litrosActuales * 10) / 10,
      caudal_l_min: Math.round(caudalLMin * 10) / 10,
      valvulas: estadoValvulas(),
      llenando: tanqueActivo !== null,
    });
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
    litrosActuales = Math.min(setpointL, litrosActuales + (caudalLMin / 60) * (intervaloMs / 1000));

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

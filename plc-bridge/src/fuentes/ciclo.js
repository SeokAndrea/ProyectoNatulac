// Ciclo simulado de una preparacion (PLC_MODO=simulacion), con la forma del PLC
// real (ver s7.js y docs/superpowers/specs/2026-11-06-preparacion-plc-design.md):
//
//   espera 5 s -> el operador elige el tanque y pone el agua de la formula
//   fase 1     -> entra agua hasta el 80 % del setpoint y la valvula cierra
//   fase 2     -> a los 3 s el operador pone los kits (de 1 a 3, en medios) y
//                 entra el 20 % que faltaba, con la pulpa
//   "Calidad"  -> 20 s sin fase activa
//   fase 3     -> de 0 a 2 ajustes de 50 a 200 L; cada uno vuelve a 0 al
//                 terminar y le siguen 10 s de "Calidad"
//   fin        -> PREPARACION baja, los kits vuelven a 0 y el PLC deja de tener
//                 tanque seleccionado; la siguiente es en otro tanque
//
// Tiempo simulado, sin timers: avanzar(ms) mueve el reloj ms x velocidad
// (PLC_SIM_VELOCIDAD en bridge.conf, para probar rapido). Quien llama decide
// cada cuanto (simulacion.js, cada PLC_BRIDGE_INTERVALO_MS).

const TANQUES = [1, 2, 3];
const CAUDAL_L_MIN = 1200;
const ESPERA_MS = 5000;
const KITS_A_LOS_MS = 3000;
const CALIDAD_MS = 20000;
const CALIDAD_AJUSTE_MS = 10000;

export function crearCicloPreparacion({ aleatorio = Math.random, velocidad = 1 } = {}) {
  let indice = 0;
  let etapa = "espera";
  let enEtapaMs = 0;
  let tanque = null;
  let activa = false;
  let setpoint = 0;
  // PLC_Totales_Litros: suma mientras el tanque esta seleccionado; vuelve a 0 al cambiar de tanque.
  let litrosTanque = 0;
  // PLC_Actuales_Litros: litros de la apertura en curso.
  let litrosActuales = 0;
  let valvula = false;
  let kits = 0;
  let kitsElegidos = 0;
  let ajuste = 0;
  let objetivoAjuste = 0;
  let ajustesPendientes = 0;

  function cambiar(nueva) {
    etapa = nueva;
    enEtapaMs = 0;
  }

  function abrir() {
    valvula = true;
    litrosActuales = 0;
  }

  /** Agrega el agua de dtMs; true si el tanque llego a "objetivo" (y la valvula cierra). */
  function llenarHasta(objetivo, dtMs) {
    const entra = (CAUDAL_L_MIN / 60000) * dtMs;
    const agrega = Math.min(entra, Math.max(0, objetivo - litrosTanque));
    litrosTanque += agrega;
    litrosActuales += agrega;
    if (litrosTanque >= objetivo - 1e-9) {
      litrosTanque = objetivo;
      valvula = false;
      return true;
    }
    return false;
  }

  function iniciarPreparacion() {
    tanque = TANQUES[indice % TANQUES.length];
    indice += 1;
    activa = true;
    setpoint = Math.round(1500 + aleatorio() * 1500);
    kitsElegidos = 1 + Math.floor(aleatorio() * 5) * 0.5;
    ajustesPendientes = Math.floor(aleatorio() * 3);
    litrosTanque = 0;
    kits = 0;
    ajuste = 0;
    abrir();
    cambiar("fase1");
  }

  function iniciarAjuste() {
    ajuste = Math.round(50 + aleatorio() * 150);
    objetivoAjuste = litrosTanque + ajuste;
    abrir();
    cambiar("fase3");
  }

  function terminar() {
    activa = false;
    tanque = null;
    kits = 0;
    ajuste = 0;
    valvula = false;
    cambiar("espera");
  }

  function despuesDeCalidad() {
    if (ajustesPendientes > 0) iniciarAjuste();
    else terminar();
  }

  function avanzarEtapa(dtMs) {
    enEtapaMs += dtMs;
    switch (etapa) {
      case "espera":
        if (enEtapaMs >= ESPERA_MS) iniciarPreparacion();
        break;
      case "fase1":
        if (llenarHasta(setpoint * 0.8, dtMs)) cambiar("fase2");
        break;
      case "fase2":
        if (kits === 0 && enEtapaMs >= KITS_A_LOS_MS) {
          kits = kitsElegidos;
          abrir();
        }
        if (kits > 0 && llenarHasta(setpoint, dtMs)) cambiar("calidad");
        break;
      case "calidad":
        if (enEtapaMs >= CALIDAD_MS) despuesDeCalidad();
        break;
      case "fase3":
        if (llenarHasta(objetivoAjuste, dtMs)) {
          ajuste = 0;
          ajustesPendientes -= 1;
          cambiar("calidad_ajuste");
        }
        break;
      case "calidad_ajuste":
        if (enEtapaMs >= CALIDAD_AJUSTE_MS) despuesDeCalidad();
        break;
    }
  }

  function paso() {
    return {
      tanque,
      setpoint_l: tanque ? setpoint : null,
      litros_actuales: litrosActuales,
      litros_tanque: litrosTanque,
      caudal_l_min: valvula ? CAUDAL_L_MIN : 0,
      valvula_abierta: valvula,
      preparacion: {
        activa,
        fase_1: etapa === "fase1",
        fase_2: etapa === "fase2",
        fase_3: etapa === "fase3",
        kits,
        ajuste_l: ajuste,
      },
    };
  }

  return {
    /** Avanza ms de tiempo real (x velocidad) y devuelve como queda el PLC simulado. */
    avanzar(ms) {
      avanzarEtapa(ms * velocidad);
      return paso();
    },
  };
}

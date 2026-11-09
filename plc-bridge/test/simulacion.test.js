import { test, mock } from "node:test";
import assert from "node:assert/strict";

// La simulacion lee PLC_SIM_VELOCIDAD al crearse: rapida, para no esperar minutos.
process.env.PLC_SIM_VELOCIDAD = "20";
const { crearFuenteSimulacion } = await import("../src/fuentes/simulacion.js");

/** Corre la simulacion "segundos" de reloj falso y devuelve cada estado emitido. */
function correr(segundos) {
  mock.timers.enable({ apis: ["setInterval", "Date"], now: 0 });
  const estados = [];
  const fuente = crearFuenteSimulacion({ onEstado: (e) => estados.push(e), intervaloMs: 200 });
  fuente.iniciar();
  for (let i = 0; i < segundos * 5; i++) mock.timers.tick(200);
  fuente.detener();
  mock.timers.reset();
  return estados;
}

test("cada estado trae la preparacion con la forma del PLC real", () => {
  const estados = correr(30);
  const conPreparacion = estados.filter((e) => e.preparacion?.activa);
  assert.ok(conPreparacion.length > 0, "en 30 s (x20) arranca una preparacion");
  for (const e of estados) {
    assert.deepEqual(Object.keys(e.preparacion).sort(), ["activa", "ajuste_l", "fase_1", "fase_2", "fase_3", "kits"]);
    assert.equal(e.fuente, "simulacion");
  }
  for (const e of conPreparacion) assert.ok([1, 2, 3].includes(e.tanque_activo));
});

test("la valvula de entrada abierta es la del tanque activo y marca llenando", () => {
  const estados = correr(30);
  const llenando = estados.filter((e) => e.llenando);
  assert.ok(llenando.length > 0);
  for (const e of llenando) {
    assert.equal(e.valvulas[e.tanque_activo], true);
    assert.equal(Object.values(e.valvulas).filter(Boolean).length, 1);
    assert.ok(e.caudal_l_min > 0);
  }
});

test("al terminar la preparacion se abre la valvula auxiliar de ese tanque", () => {
  const estados = correr(30);
  const fin = estados.findIndex((e, i) => i > 0 && estados[i - 1].preparacion.activa && !e.preparacion.activa);
  assert.ok(fin > 0, "una preparacion termina en 30 s (x20)");
  const tanque = estados[fin - 1].tanque_activo;
  assert.equal(estados[fin].auxiliares[tanque], true);
});

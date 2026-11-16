import { test } from "node:test";
import assert from "node:assert/strict";
import { crearCicloPreparacion } from "../src/fuentes/ciclo.js";

const PASO_MS = 200;

/** Avanza el ciclo hasta que termina la primera preparación (y un poco más) y devuelve los pasos. */
function recorrer({ velocidad = 1, ciclos = 1 } = {}) {
  const ciclo = crearCicloPreparacion({ aleatorio: () => 0.5, velocidad });
  const pasos = [];
  let terminadas = 0;
  let antes = false;
  for (let i = 0; i < 20000 && terminadas < ciclos; i++) {
    const p = ciclo.avanzar(PASO_MS);
    pasos.push(p);
    if (antes && !p.preparacion.activa) terminadas++;
    antes = p.preparacion.activa;
  }
  assert.equal(terminadas, ciclos, "el ciclo tiene que terminar");
  return pasos;
}

const faseDe = (p) => (p.preparacion.fase_3 ? 3 : p.preparacion.fase_2 ? 2 : p.preparacion.fase_1 ? 1 : null);

test("las fases aparecen en orden 1, 2, 3 y PREPARACION baja al final", () => {
  const pasos = recorrer();
  const fases = [];
  for (const p of pasos) {
    const f = faseDe(p);
    if (f && fases[fases.length - 1] !== f) fases.push(f);
  }
  // Con aleatorio 0,5: un ajuste.
  assert.deepEqual(fases, [1, 2, 3]);
  const ultimo = pasos[pasos.length - 1];
  assert.equal(ultimo.preparacion.activa, false);
});

test("en la fase 1 la valvula cierra con el 80 % del setpoint adentro", () => {
  const pasos = recorrer();
  const finFase1 = pasos.findIndex((p, i) => i > 0 && faseDe(pasos[i - 1]) === 1 && faseDe(p) !== 1);
  const cierre = pasos[finFase1 - 1];
  assert.ok(cierre.setpoint_l >= 1500 && cierre.setpoint_l <= 3000, `setpoint ${cierre.setpoint_l}`);
  const proporcion = pasos[finFase1].litros_tanque / cierre.setpoint_l;
  assert.ok(Math.abs(proporcion - 0.8) <= 0.01, `entro el ${(proporcion * 100).toFixed(1)} %`);
  assert.equal(pasos[finFase1].valvula_abierta, false);
});

test("al terminar la preparacion entro todo el setpoint mas los ajustes", () => {
  const pasos = recorrer();
  const fin = pasos.findIndex((p, i) => i > 0 && pasos[i - 1].preparacion.activa && !p.preparacion.activa);
  const antes = pasos[fin - 1];
  // Un ajuste de 125 L (aleatorio 0,5: 50 + 0,5 × 150).
  assert.ok(Math.abs(antes.litros_tanque - (antes.setpoint_l + 125)) <= 1, `entraron ${antes.litros_tanque} L`);
});

test("los kits aparecen en la fase 2, en medios, y vuelven a 0 cuando baja PREPARACION", () => {
  const pasos = recorrer();
  const primeraConKits = pasos.findIndex((p) => p.preparacion.kits > 0);
  assert.equal(faseDe(pasos[primeraConKits]), 2);
  const kits = pasos[primeraConKits].preparacion.kits;
  assert.equal(kits * 2, Math.trunc(kits * 2), "van de medio en medio");
  assert.ok(kits >= 1 && kits <= 3);
  for (const p of pasos.slice(primeraConKits)) {
    if (p.preparacion.activa) assert.equal(p.preparacion.kits, kits);
    else assert.equal(p.preparacion.kits, 0);
  }
});

test("cada ajuste vuelve a 0 al terminar y solo existe en la fase 3", () => {
  const pasos = recorrer();
  const conAjuste = pasos.filter((p) => p.preparacion.ajuste_l > 0);
  assert.ok(conAjuste.length > 0);
  for (const p of conAjuste) assert.equal(faseDe(p), 3);
  assert.equal(pasos[pasos.length - 1].preparacion.ajuste_l, 0);
  const ultimoConAjuste = pasos.lastIndexOf(conAjuste[conAjuste.length - 1]);
  assert.equal(pasos[ultimoConAjuste + 1].preparacion.ajuste_l, 0);
});

test("la siguiente preparacion es en otro tanque", () => {
  const pasos = recorrer({ ciclos: 2 });
  const tanques = [];
  for (const p of pasos) {
    if (p.preparacion.activa && tanques[tanques.length - 1] !== p.tanque) tanques.push(p.tanque);
  }
  assert.equal(tanques.length, 2);
  assert.notEqual(tanques[0], tanques[1]);
});

test("la velocidad acorta el ciclo", () => {
  const normal = recorrer().length;
  const rapido = recorrer({ velocidad: 10 }).length;
  assert.ok(rapido * 5 < normal, `normal ${normal} pasos, rapido ${rapido}`);
});

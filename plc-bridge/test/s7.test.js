import { test } from "node:test";
import assert from "node:assert/strict";
import { armarPreparacion } from "../src/fuentes/s7.js";

test("armarPreparacion pasa las fases, los kits y el ajuste tal cual", () => {
  assert.deepEqual(
    armarPreparacion({ preparacion: true, fase_1: false, fase_2: true, fase_3: false, kits: 2.5, ajuste_agua: 0 }),
    { activa: true, fase_1: false, fase_2: true, fase_3: false, kits: 2.5, ajuste_l: 0 },
  );
});

test("sin Estatus_Preparacion (tag mal configurado o sin conexion) no hay bloque", () => {
  assert.equal(armarPreparacion({ preparacion: null, fase_2: true, kits: 2 }), null);
  assert.equal(armarPreparacion(null), null);
});

test("los kits REAL llegan sin ruido de punto flotante", () => {
  assert.equal(armarPreparacion({ preparacion: true, kits: 2.299999952316284, ajuste_agua: 120 }).kits, 2.3);
});

test("un kit o un ajuste que el PLC no entrego llega como null", () => {
  const p = armarPreparacion({ preparacion: false, fase_1: null, kits: null, ajuste_agua: null });
  assert.deepEqual(p, { activa: false, fase_1: false, fase_2: false, fase_3: false, kits: null, ajuste_l: null });
});

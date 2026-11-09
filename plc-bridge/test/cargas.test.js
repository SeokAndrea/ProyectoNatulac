import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { areaPorDefecto, cambioRelevante, crearReportador, lecturaDeCarga } from "../src/cargas.js";

const API = "http://base:3000";

function respuesta(status, cuerpo) {
  return { ok: status >= 200 && status < 300, status, json: async () => cuerpo };
}

/**
 * fetch falso: guarda cada llamada y responde con lo que diga "responder".
 * Por defecto: login bueno (token "t1", "t2"...) y la base acepta la lectura.
 */
function fetchFalso(responder = {}) {
  const llamadas = [];
  let tokens = 0;
  const f = async (url, opciones) => {
    const ruta = url.replace(API, "");
    const cuerpo = JSON.parse(opciones.body);
    const llamada = { ruta, cuerpo, sesion: opciones.headers["x-sesion"] ?? null };
    llamadas.push(llamada);
    if (ruta === "/rpc/verificar_login") {
      if (responder.login) return responder.login(llamada);
      tokens += 1;
      return respuesta(200, [{ usuario: "plc-bridge", token: `t${tokens}` }]);
    }
    if (responder.registrar) return responder.registrar(llamada);
    return respuesta(200, { habilitado: true, carga_id: "c1", estado: "EN_CURSO" });
  };
  f.llamadas = llamadas;
  f.registradas = () => llamadas.filter((l) => l.ruta === "/rpc/registrar_carga_plc");
  f.logins = () => llamadas.filter((l) => l.ruta === "/rpc/verificar_login");
  return f;
}

function reloj(inicio = 1_000_000) {
  let t = inicio;
  const ahora = () => t;
  ahora.avanzar = (ms) => {
    t += ms;
  };
  return ahora;
}

function archivoNuevo() {
  return join(mkdtempSync(join(tmpdir(), "plc-cargas-")), "cargas-pendientes.json");
}

/** Lectura del bridge como la arma s7.js / simulacion.js. */
function estado({ tanque = 1, activa = true, fase_1 = false, fase_2 = false, fase_3 = false, kits = 0, ajuste_l = 0, ms = 0 } = {}) {
  return {
    timestamp: new Date(1_700_000_000_000 + ms).toISOString(),
    tanque_activo: activa ? tanque : null,
    setpoint_l: 2000,
    preparacion: { activa, fase_1, fase_2, fase_3, kits, ajuste_l },
  };
}

function reportador(opciones = {}) {
  return crearReportador({
    apiUrl: API,
    usuario: "plc-bridge",
    clave: "secreta",
    area: "PRUEBAS",
    archivoCola: archivoNuevo(),
    fetch: fetchFalso(),
    ahora: reloj(),
    aviso: () => {},
    ...opciones,
  });
}

test("lecturaDeCarga arma la lectura para la base, o null sin PLC o sin preparación", () => {
  assert.deepEqual(lecturaDeCarga(estado({ fase_2: true, kits: 1.5 })), {
    momento: "2023-11-14T22:13:20.000Z",
    tanque: 1,
    preparacion: true,
    fase_1: false,
    fase_2: true,
    fase_3: false,
    kits: 1.5,
    ajuste_l: 0,
    setpoint_l: 2000,
  });
  assert.equal(lecturaDeCarga({ ...estado(), conectado: false }), null);
  assert.equal(lecturaDeCarga({ ...estado(), preparacion: null }), null);
  assert.equal(cambioRelevante(null, lecturaDeCarga(estado())), true);
  assert.equal(cambioRelevante(lecturaDeCarga(estado({ ms: 0 })), lecturaDeCarga(estado({ ms: 200 }))), false);
  assert.equal(cambioRelevante(lecturaDeCarga(estado()), lecturaDeCarga(estado({ kits: 2 }))), true);
});

test("sin clave, el reportador queda apagado con su motivo", async () => {
  const fetch = fetchFalso();
  const r = reportador({ clave: "", fetch });
  assert.equal(r.habilitado, false);
  assert.equal(r.motivoApagado, "falta PLC_BRIDGE_CLAVE");
  r.procesar(estado());
  await r.enviarPendientes();
  assert.equal(fetch.llamadas.length, 0);
  assert.deepEqual(r.resumen(), {
    habilitado: false,
    area: "PRUEBAS",
    motivo_apagado: "falta PLC_BRIDGE_CLAVE",
    pendientes: 0,
    ultimo_envio: null,
    error: null,
  });
});

test("sin PLC_API_URL, el reportador queda apagado con su motivo", () => {
  const r = reportador({ apiUrl: "" });
  assert.equal(r.habilitado, false);
  assert.equal(r.motivoApagado, "falta PLC_API_URL en bridge.conf");
});

test("entra con verificar_login y manda x-sesion", async () => {
  const fetch = fetchFalso();
  const r = reportador({ fetch });
  r.procesar(estado({ fase_1: true }));
  await r.enviarPendientes();
  assert.deepEqual(fetch.llamadas[0], {
    ruta: "/rpc/verificar_login",
    cuerpo: { p_usuario: "plc-bridge", p_password: "secreta" },
    sesion: null,
  });
  const [envio] = fetch.registradas();
  assert.equal(envio.sesion, "t1");
  assert.equal(envio.cuerpo.p_usuario, "plc-bridge");
  assert.equal(envio.cuerpo.p_area_codigo, "PRUEBAS");
  assert.equal(envio.cuerpo.p_lectura.fase_1, true);
  assert.equal(r.resumen().pendientes, 0);
  assert.notEqual(r.resumen().ultimo_envio, null);

  // La sesión se reusa: la segunda lectura no vuelve a entrar.
  r.procesar(estado({ fase_2: true }));
  await r.enviarPendientes();
  assert.equal(fetch.logins().length, 1);
  assert.equal(fetch.registradas().length, 2);
});

test("solo encola cuando cambia algo o pasó el latido", async () => {
  const ahora = reloj();
  // La base no contesta: lo encolado se queda en la cola y se puede contar.
  const fetch = fetchFalso({ registrar: async () => Promise.reject(new TypeError("fetch failed")) });
  const r = reportador({ fetch, ahora, latidoMs: 60000 });
  r.procesar(estado({ fase_1: true, ms: 0 }));
  ahora.avanzar(200);
  r.procesar(estado({ fase_1: true, ms: 200 }));
  ahora.avanzar(200);
  r.procesar(estado({ fase_1: true, ms: 400 }));
  await r.enviarPendientes();
  assert.equal(r.resumen().pendientes, 1);

  r.procesar(estado({ fase_2: true, ms: 600 }));
  assert.equal(r.resumen().pendientes, 2);

  ahora.avanzar(59000);
  r.procesar(estado({ fase_2: true, ms: 59600 }));
  assert.equal(r.resumen().pendientes, 2);
  ahora.avanzar(1000);
  r.procesar(estado({ fase_2: true, ms: 60600 }));
  assert.equal(r.resumen().pendientes, 3, "a los 60 s sin cambios se manda igual (latido)");

  // Sin conexión con el PLC no se encola nada.
  ahora.avanzar(120000);
  r.procesar({ ...estado({ fase_3: true }), conectado: false });
  assert.equal(r.resumen().pendientes, 3);
});

test("si la base falla, reintenta y manda en orden", async () => {
  const ahora = reloj();
  let fallas = 2;
  const fetch = fetchFalso({
    registrar: async () => {
      if (fallas > 0) {
        fallas -= 1;
        throw new TypeError("fetch failed");
      }
      return respuesta(200, { habilitado: true, carga_id: "c1", estado: "EN_CURSO" });
    },
  });
  const r = reportador({ fetch, ahora });
  r.procesar(estado({ fase_1: true, ms: 0 }));
  r.procesar(estado({ fase_2: true, ms: 200 }));
  r.procesar(estado({ fase_2: true, kits: 2, ms: 400 }));
  await r.enviarPendientes();
  assert.equal(fetch.registradas().length, 1);
  assert.equal(r.resumen().pendientes, 3);
  assert.match(r.resumen().error, /Sin conexión con la base/);

  // Primera espera: 5 s.
  ahora.avanzar(4999);
  await r.enviarPendientes();
  assert.equal(fetch.registradas().length, 1);
  ahora.avanzar(1);
  await r.enviarPendientes();
  assert.equal(fetch.registradas().length, 2);

  // Segunda espera: 10 s.
  ahora.avanzar(9999);
  await r.enviarPendientes();
  assert.equal(fetch.registradas().length, 2);
  ahora.avanzar(1);
  await r.enviarPendientes();
  assert.equal(r.resumen().pendientes, 0);
  assert.equal(r.resumen().error, null);

  const enviadas = fetch.registradas().slice(2).map((l) => l.cuerpo.p_lectura);
  assert.deepEqual(
    enviadas.map((l) => [l.fase_1, l.fase_2, l.kits]),
    [
      [true, false, 0],
      [false, true, 0],
      [false, true, 2],
    ],
  );
});

test("la espera entre reintentos llega hasta 60 s", async () => {
  const ahora = reloj();
  const fetch = fetchFalso({ registrar: async () => respuesta(500, { message: "caída" }) });
  const r = reportador({ fetch, ahora });
  r.procesar(estado());
  await r.enviarPendientes();
  for (const espera of [5000, 10000, 20000, 40000, 60000, 60000]) {
    const antes = fetch.registradas().length;
    ahora.avanzar(espera - 1);
    await r.enviarPendientes();
    assert.equal(fetch.registradas().length, antes, `no reintenta antes de ${espera} ms`);
    ahora.avanzar(1);
    await r.enviarPendientes();
    assert.equal(fetch.registradas().length, antes + 1, `reintenta a los ${espera} ms`);
  }
  assert.equal(r.resumen().error, "caída");
});

test("la cola sobrevive a un reinicio y se manda en orden", async () => {
  const archivoCola = archivoNuevo();
  const caida = fetchFalso({ registrar: async () => Promise.reject(new TypeError("fetch failed")) });
  const antes = reportador({ archivoCola, fetch: caida });
  antes.procesar(estado({ fase_1: true, ms: 0 }));
  antes.procesar(estado({ fase_2: true, ms: 200 }));
  antes.procesar(estado({ activa: false, ms: 400 }));
  await antes.enviarPendientes();
  antes.detener();
  assert.equal(JSON.parse(readFileSync(archivoCola, "utf8")).length, 3);

  const fetch = fetchFalso();
  const despues = reportador({ archivoCola, fetch });
  assert.equal(despues.resumen().pendientes, 3);
  await despues.enviarPendientes();
  assert.deepEqual(
    fetch.registradas().map((l) => l.cuerpo.p_lectura.momento),
    [estado({ ms: 0 }).timestamp, estado({ ms: 200 }).timestamp, estado({ ms: 400 }).timestamp],
  );
  assert.deepEqual(JSON.parse(readFileSync(archivoCola, "utf8")), []);
});

test("la cola guarda como máximo 5.000 lecturas (se pierden las más viejas)", async () => {
  const ahora = reloj();
  const fetch = fetchFalso({ registrar: async () => Promise.reject(new TypeError("fetch failed")) });
  const archivoCola = archivoNuevo();
  const r = reportador({ fetch, ahora, archivoCola });
  for (let i = 0; i < 5002; i++) r.procesar(estado({ kits: i + 1, ms: i * 200 }));
  assert.equal(r.resumen().pendientes, 5000);
  r.detener();
  const cola = JSON.parse(readFileSync(archivoCola, "utf8"));
  assert.equal(cola[0].kits, 3);
  assert.equal(cola.at(-1).kits, 5002);
});

test("una respuesta 403 o código 28000 hace volver a entrar", async () => {
  for (const vencida of [respuesta(403, { message: "Tu sesión no es válida" }), respuesta(401, { code: "28000" })]) {
    let primera = true;
    const fetch = fetchFalso({
      registrar: async () => {
        if (primera) {
          primera = false;
          return vencida;
        }
        return respuesta(200, { habilitado: true, carga_id: "c1", estado: "EN_CURSO" });
      },
    });
    const r = reportador({ fetch });
    r.procesar(estado());
    await r.enviarPendientes();
    assert.equal(fetch.logins().length, 2);
    assert.deepEqual(
      fetch.registradas().map((l) => l.sesion),
      ["t1", "t2"],
    );
    assert.equal(r.resumen().pendientes, 0);
  }
});

test("con la clave equivocada espera 5 minutos antes de reintentar", async () => {
  const ahora = reloj();
  const fetch = fetchFalso({ login: async () => respuesta(200, []) });
  const r = reportador({ fetch, ahora });
  r.procesar(estado());
  await r.enviarPendientes();
  assert.equal(fetch.logins().length, 1);
  assert.equal(fetch.registradas().length, 0);
  assert.match(r.resumen().error, /clave/);

  ahora.avanzar(299999);
  await r.enviarPendientes();
  assert.equal(fetch.logins().length, 1);
  ahora.avanzar(1);
  await r.enviarPendientes();
  assert.equal(fetch.logins().length, 2);
  assert.equal(r.resumen().pendientes, 1);
});

test("en simulación el área por defecto es PRUEBAS", () => {
  assert.equal(areaPorDefecto("simulacion"), "PRUEBAS");
  assert.equal(areaPorDefecto("real"), "ASEPTICO");
});

test("con habilitado:false de la base no reintenta y lo informa", async () => {
  const ahora = reloj();
  const fetch = fetchFalso({ registrar: async () => respuesta(200, { habilitado: false, carga_id: null, estado: null }) });
  const r = reportador({ fetch, ahora });
  r.procesar(estado());
  await r.enviarPendientes();
  assert.equal(fetch.registradas().length, 1);
  assert.equal(r.resumen().pendientes, 0);
  assert.equal(r.resumen().motivo_apagado, "La preparación con PLC está apagada en PRUEBAS.");
  ahora.avanzar(600000);
  await r.enviarPendientes();
  assert.equal(fetch.registradas().length, 1);
});

test("una lectura que la base no entiende (400) se descarta en vez de trabar la cola", async () => {
  let primera = true;
  const fetch = fetchFalso({
    registrar: async () => {
      if (primera) {
        primera = false;
        return respuesta(400, { code: "P0001", message: "La lectura del PLC no trae PREPARACION." });
      }
      return respuesta(200, { habilitado: true, carga_id: "c1", estado: "EN_CURSO" });
    },
  });
  const r = reportador({ fetch });
  r.procesar(estado({ fase_1: true }));
  r.procesar(estado({ fase_2: true }));
  await r.enviarPendientes();
  assert.equal(fetch.registradas().length, 2);
  assert.equal(r.resumen().pendientes, 0);
});

test("un error de configuración en la base (permiso, área) se reintenta y se informa", async () => {
  const ahora = reloj();
  const fetch = fetchFalso({
    registrar: async () => respuesta(400, { code: "P0001", message: "No tienes permiso para registrar cargas del PLC." }),
  });
  const r = reportador({ fetch, ahora });
  r.procesar(estado());
  await r.enviarPendientes();
  assert.equal(r.resumen().pendientes, 1);
  assert.equal(r.resumen().error, "No tienes permiso para registrar cargas del PLC.");
  ahora.avanzar(5000);
  await r.enviarPendientes();
  assert.equal(fetch.registradas().length, 2);
});

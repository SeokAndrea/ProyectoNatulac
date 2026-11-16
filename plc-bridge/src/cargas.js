// Cargas de la preparacion hacia la base (spec
// docs/superpowers/specs/2026-11-06-preparacion-plc-design.md).
//
// El bridge no decide nada: manda a la base lo que ve del PLC (PREPARACION,
// fases, kits y ajuste de agua) y la funcion registrar_carga_plc (migracion
// 20261115990000) abre la carga, anota los kits y los ajustes y la deja
// PENDIENTE cuando la preparacion termina.
//
// - Entra con su propio usuario (plc-bridge, permiso PLC_CARGAR) por
//   verificar_login, como la app, y manda la credencial en x-sesion. La clave
//   sale SOLO de la variable de entorno PLC_BRIDGE_CLAVE, nunca de bridge.conf.
// - Manda una lectura cuando cambia algo de la preparacion, y una cada minuto
//   aunque no cambie nada (latido: la tarjeta sabe que el bridge sigue vivo).
// - Lo que no se pudo mandar queda en una cola en disco
//   (cargas-pendientes.json, con "-simulacion" en simulacion) y se manda en
//   orden, de a una, cuando la base vuelve. Repetir una lectura no duplica nada
//   en la base.
// - Si la base dice que la preparacion con PLC esta apagada en el area, la
//   lectura se descarta (no se reintenta) y queda dicho en el resumen.
//
// Los textos del resumen van con acentos (los muestra la pantalla); los de
// consola, sin acentos como el resto del bridge.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { leer } from "./config.js";
import { carpetaDatos, sufijoModo } from "./registro.js";

const MAXIMO_EN_COLA = 5000;
const ESPERA_INICIAL_MS = 5000;
const ESPERA_MAXIMA_MS = 60000;
const ESPERA_CLAVE_MALA_MS = 5 * 60000;
const ESPERA_API_MS = 5000;
// La cola se guarda como mucho una vez por segundo (y siempre al detener).
const GUARDAR_CADA_MS = 1000;

/** Area de las cargas cuando PLC_AREA esta vacio. */
export function areaPorDefecto(modo) {
  return modo === "real" ? "ASEPTICO" : "PRUEBAS";
}

/** Lo que se manda a registrar_carga_plc, o null si no hay datos del PLC. */
export function lecturaDeCarga(estado) {
  if (!estado || estado.conectado === false || estado.preparacion == null) return null;
  const p = estado.preparacion;
  return {
    momento: estado.timestamp ?? null,
    tanque: estado.tanque_activo ?? null,
    preparacion: !!p.activa,
    fase_1: !!p.fase_1,
    fase_2: !!p.fase_2,
    fase_3: !!p.fase_3,
    kits: p.kits ?? null,
    ajuste_l: p.ajuste_l ?? null,
    setpoint_l: estado.setpoint_l ?? null,
  };
}

const CAMPOS_RELEVANTES = ["tanque", "preparacion", "fase_1", "fase_2", "fase_3", "kits", "ajuste_l"];

/** true si la lectura b cambia algo de la preparacion respecto de a. */
export function cambioRelevante(a, b) {
  if (!a || !b) return a !== b;
  return CAMPOS_RELEVANTES.some((campo) => a[campo] !== b[campo]);
}

function leerCola(archivo, aviso) {
  if (!existsSync(archivo)) return [];
  try {
    const datos = JSON.parse(readFileSync(archivo, "utf8"));
    return Array.isArray(datos) ? datos : [];
  } catch (error) {
    aviso(`no se pudo leer ${archivo} (${error.message}); se empieza una cola nueva.`);
    return [];
  }
}

/** Respuesta de la base que significa "credencial vencida o no valida": se vuelve a entrar. */
function esSesionVencida(status, cuerpo) {
  return status === 403 || cuerpo?.code === "28000";
}

/**
 * Lectura que la base nunca va a aceptar (mal formada): se descarta para no
 * trabar la cola. Los demas 400 (permiso, area) son de configuracion y se
 * reintentan hasta que se arreglen.
 */
function esLecturaInvalida(status, cuerpo) {
  if (status !== 400) return false;
  return String(cuerpo?.code ?? "").startsWith("22") || /no trae PREPARACION/.test(cuerpo?.message ?? "");
}

export function crearReportador({
  apiUrl,
  usuario,
  clave,
  area,
  archivoCola,
  fetch,
  ahora = Date.now,
  latidoMs = 60000,
  aviso = (texto) => console.log(`[plc-bridge] ${texto}`),
}) {
  const base = (apiUrl ?? "").replace(/\/+$/, "");
  const motivoApagado = !base ? "falta PLC_API_URL en bridge.conf" : !clave ? "falta PLC_BRIDGE_CLAVE" : null;
  const habilitado = !motivoApagado;

  let cola = habilitado ? leerCola(archivoCola, aviso) : [];
  let ultimaEncolada = null;
  let ultimaEncoladaMs = -Infinity;
  let token = null;
  let esperaMs = ESPERA_INICIAL_MS;
  let proximoIntentoMs = -Infinity;
  let enCurso = null;
  let sucio = false;
  let ultimoGuardadoMs = -Infinity;
  let ultimoEnvio = null;
  let error = null;
  let baseApagada = null; // texto si la base dijo habilitado:false
  let estadoConsola = null;

  aviso(
    habilitado
      ? `cargas de preparacion habilitadas (area ${area}, usuario ${usuario}, base ${base})` +
          (cola.length ? `; ${cola.length} pendientes de antes` : "")
      : `cargas de preparacion APAGADAS (${motivoApagado})`,
  );

  /** Un aviso en consola por cambio de estado, no por lectura. */
  function avisarEstado(clave, texto) {
    if (clave === estadoConsola) return;
    estadoConsola = clave;
    aviso(texto);
  }

  function guardar() {
    try {
      mkdirSync(dirname(archivoCola), { recursive: true });
      // Se escribe aparte y se renombra: un corte a mitad no deja el archivo roto.
      writeFileSync(archivoCola + ".tmp", JSON.stringify(cola));
      renameSync(archivoCola + ".tmp", archivoCola);
      sucio = false;
      ultimoGuardadoMs = ahora();
    } catch (e) {
      aviso(`no se pudo guardar ${archivoCola}: ${e.message}`);
    }
  }

  function guardarSiToca() {
    if (sucio && ahora() - ultimoGuardadoMs >= GUARDAR_CADA_MS) guardar();
  }

  function quitar(item) {
    const i = cola.indexOf(item);
    if (i >= 0) cola.splice(i, 1);
    sucio = true;
  }

  function esperar(ms, texto) {
    proximoIntentoMs = ahora() + ms;
    error = texto;
  }

  function fallo(texto) {
    esperar(esperaMs, texto);
    esperaMs = Math.min(esperaMs * 2, ESPERA_MAXIMA_MS);
  }

  async function llamar(ruta, cuerpo) {
    const headers = { "Content-Type": "application/json" };
    if (token) headers["x-sesion"] = token;
    const respuesta = await fetch(`${base}/rpc/${ruta}`, {
      method: "POST",
      headers,
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(ESPERA_API_MS),
    });
    const datos = await respuesta.json().catch(() => null);
    return { status: respuesta.status, ok: respuesta.ok, datos };
  }

  /** true si quedo con sesion; si no, ya dejo programado el reintento. */
  async function entrar() {
    token = null;
    const r = await llamar("verificar_login", { p_usuario: usuario, p_password: clave });
    const nuevo = r.ok && Array.isArray(r.datos) ? r.datos[0]?.token : null;
    if (nuevo) {
      token = nuevo;
      return true;
    }
    // Clave mala o usuario bloqueado: reintentar seguido solo bloquearia el usuario.
    const texto = r.ok ? "El usuario o la clave del bridge no son correctos (PLC_BRIDGE_CLAVE)." : r.datos?.message || `La base respondió ${r.status} al entrar.`;
    esperar(ESPERA_CLAVE_MALA_MS, texto);
    avisarEstado("clave", `no se pudo entrar a la base como ${usuario}: ${texto} Reintento en 5 min.`);
    return false;
  }

  /** Manda la lectura mas vieja. true si hay que seguir con la siguiente. */
  async function mandarUna(reintentoSesion) {
    const item = cola[0];
    const r = await llamar("registrar_carga_plc", { p_usuario: usuario, p_area_codigo: area, p_lectura: item });
    if (r.ok) {
      quitar(item);
      ultimoEnvio = new Date(ahora()).toISOString();
      error = null;
      esperaMs = ESPERA_INICIAL_MS;
      if (r.datos?.habilitado === false) {
        baseApagada = `La preparación con PLC está apagada en ${area}.`;
        avisarEstado("apagada", `la preparacion con PLC esta apagada en ${area}: la base no guarda las cargas`);
      } else {
        baseApagada = null;
        avisarEstado("ok", `cargas de preparacion: enviando a la base (area ${area})`);
      }
      return true;
    }
    // Sesion vencida (30 dias sin uso) o cerrada: se vuelve a entrar una vez.
    if (esSesionVencida(r.status, r.datos) && !reintentoSesion) {
      if (!(await entrar())) return false;
      return mandarUna(true);
    }
    if (esLecturaInvalida(r.status, r.datos)) {
      quitar(item);
      aviso(`lectura descartada (${r.datos?.message ?? r.status}): ${JSON.stringify(item)}`);
      return true;
    }
    const texto = r.datos?.message || `La base respondió ${r.status}.`;
    fallo(texto);
    avisarEstado(`error:${texto}`, `la base rechazo una carga: ${texto} (${cola.length} pendientes)`);
    return false;
  }

  async function vaciar() {
    let salieron = 0;
    while (cola.length && ahora() >= proximoIntentoMs) {
      try {
        if (!token && !(await entrar())) break;
        if (!(await mandarUna(false))) break;
        salieron += 1;
      } catch (e) {
        fallo(`Sin conexión con la base (${e.cause?.code ?? e.cause?.errors?.[0]?.code ?? e.name}).`);
        avisarEstado("sin_base", `sin conexion con la base: ${cola.length} pendientes`);
        break;
      }
    }
    // Lo que la base ya aceptó sale del disco enseguida: si se corta la luz,
    // al volver no se reenvía después de lecturas más nuevas.
    if (salieron > 0) guardar();
    else guardarSiToca();
  }

  function enviarPendientes() {
    if (!habilitado) return Promise.resolve();
    if (!enCurso) {
      enCurso = vaciar().finally(() => {
        enCurso = null;
      });
    }
    return enCurso;
  }

  return {
    habilitado,
    motivoApagado,

    /** Recibe cada lectura del bridge; encola si cambio algo o paso el latido. */
    procesar(estado) {
      if (!habilitado) return;
      const lectura = lecturaDeCarga(estado);
      if (!lectura) return;
      if (cambioRelevante(ultimaEncolada, lectura) || ahora() - ultimaEncoladaMs >= latidoMs) {
        cola.push(lectura);
        if (cola.length > MAXIMO_EN_COLA) {
          cola = cola.slice(cola.length - MAXIMO_EN_COLA);
          avisarEstado("llena", `la cola de cargas llego a ${MAXIMO_EN_COLA}: se pierden las lecturas mas viejas`);
        }
        ultimaEncolada = lectura;
        ultimaEncoladaMs = ahora();
        sucio = true;
      }
      guardarSiToca();
      void enviarPendientes();
    },

    enviarPendientes,

    resumen() {
      return {
        habilitado,
        area,
        motivo_apagado: motivoApagado ?? baseApagada,
        pendientes: cola.length,
        ultimo_envio: ultimoEnvio,
        error,
      };
    },

    detener() {
      if (habilitado && sucio) guardar();
    },
  };
}

/** El reportador con lo que dice bridge.conf (y PLC_BRIDGE_CLAVE del entorno). */
export function crearReportadorDesdeConf({ modo }) {
  return crearReportador({
    apiUrl: leer("PLC_API_URL", ""),
    usuario: leer("PLC_BRIDGE_USUARIO", "plc-bridge"),
    // Solo del entorno: la clave no se escribe en bridge.conf.
    clave: process.env.PLC_BRIDGE_CLAVE ?? "",
    area: leer("PLC_AREA", areaPorDefecto(modo)).toUpperCase(),
    archivoCola: join(carpetaDatos(), `cargas-pendientes${sufijoModo(modo)}.json`),
    fetch: globalThis.fetch,
  });
}

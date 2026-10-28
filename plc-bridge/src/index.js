import { WebSocketServer } from "ws";
import { archivoEncontrado, leer, RUTA_CONF } from "./config.js";
import { crearFuenteSimulacion } from "./fuentes/simulacion.js";
import { crearFuentePlc } from "./fuentes/s7.js";

const PUERTO = Number(leer("PLC_BRIDGE_PUERTO", 4036));
const INTERVALO_MS = Number(leer("PLC_BRIDGE_INTERVALO_MS", 200));
const MODO = leer("PLC_MODO", "simulacion");
// Explicito en vez de dejar que Node elija el host por defecto (":: " puede
// quedar en modo IPv6-only segun la maquina/antivirus): asi queda escuchando
// en TODAS las interfaces IPv4, para que otras PCs en la red lo alcancen.
const HOST = leer("PLC_BRIDGE_HOST", "0.0.0.0");

console.log(
  archivoEncontrado
    ? `[plc-bridge] configuracion: ${RUTA_CONF}`
    : `[plc-bridge] AVISO: no se encontro ${RUTA_CONF}, se usan los valores por defecto.`,
);

let ultimoEstado = null;

const wss = new WebSocketServer({ port: PUERTO, host: HOST });

wss.on("listening", () => {
  console.log(`[plc-bridge] escuchando en ${HOST}:${PUERTO}`);
});

wss.on("error", (error) => {
  console.error("[plc-bridge] error del servidor WebSocket:", error.message);
});

function difundir(estado) {
  ultimoEstado = estado;
  const mensaje = JSON.stringify(estado);
  for (const cliente of wss.clients) {
    if (cliente.readyState === cliente.OPEN) {
      cliente.send(mensaje);
    }
  }
}

wss.on("connection", (socket) => {
  if (ultimoEstado) {
    socket.send(JSON.stringify(ultimoEstado));
  }
});

let fuente;
try {
  if (MODO === "simulacion") {
    fuente = crearFuenteSimulacion({ onEstado: difundir, intervaloMs: INTERVALO_MS });
  } else if (MODO === "real") {
    fuente = crearFuentePlc({ onEstado: difundir, intervaloMs: INTERVALO_MS });
  } else {
    throw new Error(`PLC_MODO="${MODO}" no reconocido. Usa "simulacion" o "real".`);
  }
} catch (error) {
  // Error de configuracion (direccion mal escrita, falta PLC_HOST...): mensaje
  // corto y claro en vez de la traza completa de Node.
  console.error(`[plc-bridge] ERROR en la configuracion: ${error.message}`);
  process.exit(1);
}

fuente.iniciar();

console.log(`[plc-bridge] modo=${MODO} puerto=${PUERTO} intervalo=${INTERVALO_MS}ms`);

function apagar() {
  fuente.detener();
  wss.close(() => process.exit(0));
}

process.on("SIGTERM", apagar);
process.on("SIGINT", apagar);

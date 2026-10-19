import { WebSocketServer } from "ws";
import { crearFuenteSimulacion } from "./fuentes/simulacion.js";
import { crearFuentePlc } from "./fuentes/s7.js";

const PUERTO = Number(process.env.PLC_BRIDGE_PUERTO || 4036);
const INTERVALO_MS = Number(process.env.PLC_BRIDGE_INTERVALO_MS || 200);
const MODO = process.env.PLC_MODO || "simulacion";
// Explicito en vez de dejar que Node elija el host por defecto (":: " puede
// quedar en modo IPv6-only segun la maquina/antivirus): asi queda escuchando
// en TODAS las interfaces IPv4, para que otras PCs en la red lo alcancen.
const HOST = process.env.PLC_BRIDGE_HOST || "0.0.0.0";

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
if (MODO === "simulacion") {
  fuente = crearFuenteSimulacion({ onEstado: difundir, intervaloMs: INTERVALO_MS });
} else if (MODO === "real") {
  fuente = crearFuentePlc({ onEstado: difundir, intervaloMs: INTERVALO_MS });
} else {
  throw new Error(`PLC_MODO="${MODO}" no reconocido. Usa "simulacion" o "real".`);
}

fuente.iniciar();

console.log(`[plc-bridge] modo=${MODO} puerto=${PUERTO} intervalo=${INTERVALO_MS}ms`);

function apagar() {
  fuente.detener();
  wss.close(() => process.exit(0));
}

process.on("SIGTERM", apagar);
process.on("SIGINT", apagar);

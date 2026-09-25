import { WebSocketServer } from "ws";
import { crearFuenteSimulacion } from "./fuentes/simulacion.js";

const PUERTO = Number(process.env.PLC_BRIDGE_PUERTO || 4036);
const INTERVALO_MS = Number(process.env.PLC_BRIDGE_INTERVALO_MS || 200);
const MODO = process.env.PLC_MODO || "simulacion";

let ultimoEstado = null;

const wss = new WebSocketServer({ port: PUERTO });

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
} else {
  throw new Error(
    `PLC_MODO="${MODO}" todavia no esta soportado. Usa PLC_MODO=simulacion mientras no haya conexion al PLC real.`
  );
}

fuente.iniciar();

console.log(`[plc-bridge] modo=${MODO} puerto=${PUERTO} intervalo=${INTERVALO_MS}ms`);

function apagar() {
  fuente.detener();
  wss.close(() => process.exit(0));
}

process.on("SIGTERM", apagar);
process.on("SIGINT", apagar);

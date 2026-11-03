// Herramienta de consola para probar ESCRITURA al PLC sobre DB_COMANDOS (DB9):
// Valv_Aux_Tank1..3, las valvulas auxiliares (la HMI escribe el mismo bit).
// OJO: abre y cierra la valvula de verdad. Escribe una variable, la lee de
// vuelta y muestra si llego; la HMI tiene que mostrar lo mismo.
//
// Independiente del bridge (src/index.js): no abre WebSocket ni toca la app.
// Se corre desde plc-bridge.bat (opcion 3). La IP del PLC y las direcciones
// salen de bridge.conf, igual que en el bridge.

import readline from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import NodeS7 from "nodes7";
import { leer, validarDireccion } from "./config.js";

const host = leer("PLC_HOST", "192.168.0.10");
const puerto = Number(leer("PLC_PUERTO", 102));
const rack = Number(leer("PLC_RACK", 0));
const slot = Number(leer("PLC_SLOT", 1));
const direccion = (clave, porDefecto) => validarDireccion(clave, leer(clave, porDefecto));

// Solo estas variables se pueden escribir: lista blanca, nunca direcciones libres.
const VARIABLES = {
  Valv_Aux_Tank1: { direccion: direccion("PLC_TAG_CMD_AUX_1", "DB9,X0.0"), tipo: "bool" },
  Valv_Aux_Tank2: { direccion: direccion("PLC_TAG_CMD_AUX_2", "DB9,X0.1"), tipo: "bool" },
  Valv_Aux_Tank3: { direccion: direccion("PLC_TAG_CMD_AUX_3", "DB9,X0.2"), tipo: "bool" },
};
const NOMBRES = Object.keys(VARIABLES);

const conn = new NodeS7({ silent: true });
const rl = readline.createInterface({ input, output });

// Cola propia de lineas: readline/promises pierde respuestas si llegan varias
// juntas (pegadas o redirigidas) antes de que se haga la pregunta.
const lineasPendientes = [];
const esperando = [];
let entradaCerrada = false;
rl.on("line", (linea) => {
  const resolver = esperando.shift();
  if (resolver) resolver(linea);
  else lineasPendientes.push(linea);
});
rl.on("close", () => {
  entradaCerrada = true;
  while (esperando.length) esperando.shift()(null);
});

function preguntar(texto) {
  output.write(texto);
  if (lineasPendientes.length) return Promise.resolve(lineasPendientes.shift());
  if (entradaCerrada) return Promise.resolve(null);
  return new Promise((resolve) => esperando.push(resolve));
}

function conectar() {
  return new Promise((resolve, reject) => {
    conn.initiateConnection({ host, port: puerto, rack, slot, timeout: 5000 }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function leerTodo() {
  return new Promise((resolve, reject) => {
    conn.readAllItems((malo, valores) => {
      if (malo) reject(new Error("El PLC devolvio lectura con mala calidad (revisar direcciones / PUT-GET)."));
      else resolve(valores);
    });
  });
}

function escribir(nombre, valor) {
  return new Promise((resolve, reject) => {
    const ocupado = conn.writeItems(nombre, valor, (malo) => {
      if (malo) reject(new Error("El PLC rechazo la escritura (revisar que la variable sea escribible y PUT/GET habilitado)."));
      else resolve();
    });
    if (ocupado) reject(new Error("Ya hay una escritura en curso, intenta de nuevo."));
  });
}

function mostrar(valores) {
  console.log("");
  console.log("  Valores actuales en DB_COMANDOS (DB9):");
  for (const nombre of NOMBRES) {
    console.log(`    ${nombre.padEnd(16)} ${String(valores[nombre]).padEnd(8)} (${VARIABLES[nombre].direccion})`);
  }
  console.log("");
}

async function pedirValor(nombre) {
  const variable = VARIABLES[nombre];
  if (variable.tipo === "bool") {
    const respuesta = ((await preguntar(`  Nuevo valor de ${nombre} (1 = true, 0 = false): `)) ?? "").trim();
    if (respuesta !== "1" && respuesta !== "0") {
      console.log("  Valor no valido: escribe 1 o 0.");
      return null;
    }
    return respuesta === "1";
  }

  const respuesta = ((await preguntar(`  Nuevo valor de ${nombre} (${variable.min} a ${variable.max}): `)) ?? "").trim();
  const numero = Number(respuesta);
  if (respuesta === "" || !Number.isInteger(numero) || numero < variable.min || numero > variable.max) {
    console.log(`  Valor no valido: tiene que ser un numero entero entre ${variable.min} y ${variable.max}.`);
    return null;
  }
  return numero;
}

async function escribirYVerificar(nombre) {
  const valor = await pedirValor(nombre);
  if (valor === null) return;

  const confirmacion = ((await preguntar(`  Se escribira ${nombre} = ${valor} en el PLC. Confirmar? (s/n): `)) ?? "").trim().toLowerCase();
  if (confirmacion !== "s") {
    console.log("  Cancelado, no se escribio nada.");
    return;
  }

  await escribir(nombre, valor);
  const valores = await leerTodo();
  const leido = valores[nombre];
  if (leido === valor) {
    console.log(`  OK: el PLC tiene ${nombre} = ${leido}. Verifica que la HMI muestre lo mismo.`);
  } else {
    console.log(`  ATENCION: se escribio ${valor} pero el PLC devuelve ${leido}. Puede que el programa del PLC lo este sobrescribiendo.`);
  }
  mostrar(valores);
}

async function menu() {
  console.log("  Que quieres hacer?");
  NOMBRES.forEach((nombre, i) => console.log(`    ${i + 1}) Escribir ${nombre}`));
  console.log("    L) Leer valores actuales");
  console.log("    0) Salir");
  const opcion = await preguntar("  Opcion: ");
  return opcion === null ? "0" : opcion.trim().toUpperCase();
}

async function main() {
  console.log(`Conectando al PLC ${host}:${puerto} (rack ${rack}, slot ${slot})...`);
  try {
    await conectar();
  } catch (error) {
    // nodes7 devuelve objetos tipo { code: "EUSERTIMEOUT" }, sin message.
    console.error(`No se pudo conectar al PLC: ${error?.message || error?.code || error}`);
    console.error("Revisa el cable, que la IP de esta PC sea de la red 192.168.0.x y que el PLC responda a ping.");
    rl.close();
    process.exitCode = 1;
    return;
  }

  console.log("Conectado.");
  conn.setTranslationCB((nombre) => VARIABLES[nombre]?.direccion);
  conn.addItems(NOMBRES);

  try {
    mostrar(await leerTodo());
  } catch (error) {
    console.error(`  ${error.message}`);
  }

  for (;;) {
    const opcion = await menu();
    if (opcion === "0") break;

    try {
      if (opcion === "L") {
        mostrar(await leerTodo());
      } else if (NOMBRES[Number(opcion) - 1]) {
        await escribirYVerificar(NOMBRES[Number(opcion) - 1]);
      } else {
        console.log("  Opcion no valida.");
      }
    } catch (error) {
      console.error(`  Error: ${error.message ?? error}`);
    }
  }

  rl.close();
  conn.dropConnection(() => process.exit(0));
}

main();

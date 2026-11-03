// Ordenes de la app para abrir/cerrar las valvulas auxiliares
// (Valv_Aux_Tank1..3 en DB_COMANDOS, DB9). La HMI escribe el mismo bit.
//
// El bridge no decide quien puede: antes de escribir le pregunta a la base
// (autorizar_valvula_aux, migracion 20261113490000) con la credencial de la
// sesion que mando la app (header x-sesion, igual que la app). La base revisa
// el permiso VALVULA_AUX, deja la orden en la auditoria y devuelve el nombre,
// que queda en el registro de aperturas.
//
// Los textos que vuelven a la app van con acentos (se muestran en pantalla);
// los de consola, sin acentos como el resto del bridge.
//
// Siempre habilitado (Alexander, 2026-10-30), en real y en simulacion; solo
// hace falta PLC_API_URL (la API de la base, PostgREST).

import { leer } from "./config.js";

const NUMEROS_TANQUE = [1, 2, 3];
const ESPERA_API_MS = 5000;

export function crearControlAux({ fuente, registro }) {
  const apiUrl = leer("PLC_API_URL", "").replace(/\/+$/, "");
  const motivoApagado = apiUrl ? null : "falta PLC_API_URL en bridge.conf";

  console.log(
    motivoApagado
      ? `[plc-bridge] control de valvulas auxiliares APAGADO (${motivoApagado})`
      : `[plc-bridge] control de valvulas auxiliares habilitado (base: ${apiUrl})`,
  );

  async function autorizar({ sesion, usuario, tanque, abrir }) {
    let respuesta;
    try {
      respuesta = await fetch(`${apiUrl}/rpc/autorizar_valvula_aux`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-sesion": sesion ?? "" },
        body: JSON.stringify({ p_usuario: usuario, p_tanque: tanque, p_abrir: abrir }),
        signal: AbortSignal.timeout(ESPERA_API_MS),
      });
    } catch (error) {
      throw new Error(`El bridge no pudo consultar la base de datos (${error.cause?.code ?? error.name}).`);
    }
    const cuerpo = await respuesta.json().catch(() => null);
    if (!respuesta.ok) throw new Error(cuerpo?.message || `La base de datos respondió ${respuesta.status}.`);
    return cuerpo;
  }

  return {
    habilitado: !motivoApagado,

    /** Atiende { tanque, abrir, usuario, sesion }. Devuelve { ok } o { ok: false, error }. */
    async atender(orden, ultimaLectura) {
      if (motivoApagado) return { ok: false, error: "El control remoto de la válvula auxiliar no está habilitado en el bridge." };
      const tanque = Number(orden?.tanque);
      const abrir = orden?.abrir;
      if (!NUMEROS_TANQUE.includes(tanque) || typeof abrir !== "boolean" || typeof orden?.usuario !== "string") {
        return { ok: false, error: "Orden no válida." };
      }
      if (!ultimaLectura || ultimaLectura.conectado === false) {
        return { ok: false, error: "No hay comunicación con el PLC." };
      }
      if (!!ultimaLectura.auxiliares?.[tanque] === abrir) {
        return { ok: false, error: `La válvula auxiliar del Tanque ${tanque} ya está ${abrir ? "abierta" : "cerrada"}.` };
      }

      let persona;
      try {
        persona = await autorizar({ sesion: orden.sesion, usuario: orden.usuario, tanque, abrir });
      } catch (error) {
        console.error(`[plc-bridge] orden rechazada (${orden.usuario}, tanque ${tanque}): ${error.message}`);
        return { ok: false, error: error.message };
      }

      // Se anota antes de escribir: el cambio puede llegar en la lectura siguiente.
      registro.anotarOrdenAux(tanque, abrir, persona);
      try {
        await fuente.escribirAux(tanque, abrir);
      } catch (error) {
        registro.cancelarOrdenAux(tanque);
        console.error(`[plc-bridge] no se pudo escribir la valvula auxiliar del tanque ${tanque}: ${error.message}`);
        return { ok: false, error: error.message };
      }
      console.log(`[plc-bridge] orden: ${abrir ? "abrir" : "cerrar"} valvula auxiliar tanque ${tanque} (${persona.nombre})`);
      return { ok: true };
    },
  };
}

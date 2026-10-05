export const TANK_CAPACITY = 20000
/**
 * Techo de volumen que aguanta el CHECK de base (`preparaciones.volumen_l`
 * / `recepcion_tanques.volumen_l`, migración 20261008090000). Sólo
 * Transferir puede pasar de TANK_CAPACITY, y hasta acá — más que esto la
 * RPC lo rechaza con un error crudo de constraint, así que lo frenamos
 * antes con un mensaje claro.
 */
export const TANK_MAX_VOLUMEN = 30000

/**
 * Desvase (sacar el resto de un tanque y guardarlo en pipa, ver
 * desvasarTanque en src/lib/preparacion/ajustes.ts) estaba pausado
 * porque no tenía un uso claro. Ahora sí lo tiene: es una de las 3
 * alternativas del guardrail #1 (plan-rework-tanques-lineas-recepcion.md
 * §6) para cuando NO se quiere sumar el resto al lote nuevo.
 */
export const DESVASE_HABILITADO = true

/**
 * Insumos de la preparación (agua / azúcar / ácido cítrico) — ocultos
 * en el formulario "Nueva preparación" por pedido. El state y el envío
 * siguen intactos: poner en `true` para volver a mostrarlos.
 */
export const MOSTRAR_INSUMOS_PREPARACION = false

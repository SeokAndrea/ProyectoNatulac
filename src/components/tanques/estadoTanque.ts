import type { CondicionTanque, PreparacionRegistro, TanqueRecepcion } from "@/lib/preparacion/tipos"
import type { Corrida } from "@/lib/produccion/tipos"

/*
 * Rename de estados (docs/plan-rework-tanques-lineas-recepcion.md §9): "Sucio"
 * deja de existir como palabra propia — un tanque que se drenó del todo
 * es conceptualmente "Con Restos", solo que con 0 L. "Listo" pasa a
 * llamarse "Liberado" (ya no hace falta el prefijo "En Preparación").
 * El código interno (CondicionTanque, recepcion_tanques.condicion) NO
 * cambia — es solo el rótulo que ve el supervisor.
 */
export function nombreCondicionTanque(condicion: CondicionTanque, volumenL: number | null): string {
  switch (condicion) {
    case "LISTO":
      return "Liberado"
    case "SUCIO":
      return "Con Restos 0 L"
    case "EN_PREPARACION":
      return "En Preparación No Liberado"
    case "STANDBY":
      return `Con Restos ${volumenL != null ? volumenL.toLocaleString("es-CO") : "—"} L`
    case "CIP":
      return "En CIP"
    case "LIMPIO":
      return "Limpio"
  }
}

export const badgeVariantCondicion: Record<CondicionTanque, "success" | "warning" | "muted" | "secondary"> = {
  LISTO: "success",
  EN_PREPARACION: "warning",
  SUCIO: "muted",
  STANDBY: "secondary",
  CIP: "warning",
  LIMPIO: "success",
}

/** Liberado o Con Restos: hay líquido de un lote en el tanque. */
export const conLiquido = (t: TanqueRecepcion) => t.condicion === "LISTO" || t.condicion === "STANDBY"

/** Sabor que se dibuja en el tanque: el último si está Sucio, el del lote abierto si está En Preparación. */
export function saborDibujado(tanque: TanqueRecepcion, loteAbierto: PreparacionRegistro | null): string | null {
  if (tanque.condicion === "SUCIO") return tanque.ultimoSaborNombre
  if (tanque.condicion === "EN_PREPARACION") return loteAbierto?.saborNombre ?? null
  return tanque.saborNombre
}

/** "Restos del lote 0003" ya viene con el texto completo (ver registrar_producto_terminado) — no le antepone "Lote " de nuevo. */
export function textoUltimoLote(lote: string): string {
  return lote.startsWith("Restos del lote") ? ` · ${lote}` : ` · Lote ${lote}`
}

/**
 * El volumen del tanque baja recién cuando se carga el Producto Terminado.
 * Con una corrida del lote YA PARADA y sin PT, el tanque marca litros que
 * ya se envasaron: prepararle encima, transferirlo, desvasarlo o mandarlo a
 * Vacío arrastra esos litros y la merma sale falsa. Esas acciones quedan
 * bloqueadas hasta cargarlo (BotonCargarPt). La corrida que sigue corriendo
 * no bloquea: su volumen es en vivo y transferir con la línea andando es
 * «No parar la línea».
 */
export function paradasSinPt(corridas: Corrida[]): Corrida[] {
  return corridas.filter((c) => !c.activa)
}

import type { CondicionTanque, PreparacionRegistro, TanqueRecepcion } from "@/lib/preparacion/tipos"

/*
 * Rename de estados (plan-rework-tanques-lineas-recepcion.md §9): "Sucio"
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

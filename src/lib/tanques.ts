import type { CondicionTanque } from "@/lib/turno"

/** Texto compacto de condición de tanque, compartido entre el acta en PDF (src/lib/actaPdf.ts) y los pasos de confirmación (ConfirmarEstadoTanque.tsx). */
export function textoCondicionTanque(condicion: CondicionTanque, volumenL: number | null, saborNombre: string | null): string {
  if (condicion === "LISTO" || condicion === "STANDBY") return `${saborNombre ?? "Sin sabor"} · ${volumenL ?? 0} L`
  if (condicion === "SUCIO") return "Sucio"
  if (condicion === "CIP") return "En CIP"
  if (condicion === "LIMPIO") return "Limpio"
  return "En Preparación"
}

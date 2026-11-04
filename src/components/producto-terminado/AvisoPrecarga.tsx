import { Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { PrecargaRobot } from "@/lib/robotTavil"
import { fechaPlanta, horaCortaPlanta } from "@/lib/tiempoPlanta"
import { cn } from "@/lib/utils"
import { pistaPrecarga } from "./calculosPT"

export function PistaPrecarga({ escrito, robot }: { escrito: string; robot: number }) {
  const { texto, corrige } = pistaPrecarga(escrito, robot)
  return <p className={cn("num text-xs", corrige ? "text-warning-foreground" : "text-info-foreground")}>{texto}</p>
}

/**
 * La precarga del operador del Robot Tavil en la tarjeta de Producto
 * Terminado. «Usar la precarga» pasa sus números a Paletas y Cajas sueltas;
 * el supervisor confirma con Registrar o Cerrar, o los corrige antes.
 */
export function AvisoPrecarga({
  precarga,
  registrado,
  coincide,
  onUsar,
}: {
  precarga: PrecargaRobot
  /** Lo que ya registró el supervisor, si hay. */
  registrado: { paletas: number; cajasSueltas: number } | null
  /** Paletas y Cajas sueltas ya tienen los números del robot. */
  coincide: boolean
  onUsar: () => void
}) {
  const resto = precarga.resto ?? 0
  const ultima = precarga.ultimaPaletaEn ? horaCortaPlanta(precarga.ultimaPaletaEn, fechaPlanta()) : null
  const distinto = registrado !== null && (registrado.paletas !== precarga.paletas || registrado.cajasSueltas !== resto)
  return (
    <div className="flex gap-2 rounded-lg border border-info/35 bg-info-soft px-3 py-2 text-sm text-info-foreground">
      <Info className="mt-0.5 size-4 shrink-0" />
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-semibold">Precarga del Robot Tavil</span>
        <span className="num">
          {precarga.paletas} {precarga.paletas === 1 ? "paleta" : "paletas"} · {resto} cajas sueltas
          {ultima && ` · última paleta ${ultima}`}
          {precarga.ultimaPaletaPor && ` (${precarga.ultimaPaletaPor})`}.
        </span>
        {distinto && (
          <span className="text-warning-foreground">
            Lo registrado ({registrado.paletas} paletas y {registrado.cajasSueltas} cajas) no coincide con la precarga.
          </span>
        )}
        {!coincide && (
          <Button size="sm" variant="outline" className="mt-1 self-start" onClick={onUsar}>
            Usar la precarga
          </Button>
        )}
      </div>
    </div>
  )
}

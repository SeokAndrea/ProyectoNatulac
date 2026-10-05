import { Check } from "lucide-react"
import { CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

/** Cabecera de la tarjeta de una corrida: línea, lote, un dato a la derecha y la presentación (o lo que toque) debajo. */
export function CabeceraFila({
  nombreLinea,
  lote,
  conCheck = false,
  derecha,
  descripcion,
}: {
  nombreLinea: string
  lote: string | null
  /** Tilde junto al lote: la corrida ya tiene Producto Terminado cargado. */
  conCheck?: boolean
  derecha: React.ReactNode
  descripcion: React.ReactNode
}) {
  return (
    <CardHeader className="pb-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg border-2 border-foreground/25 px-2.5 py-1 text-lg font-bold tracking-wide">{nombreLinea}</span>
          {lote && <span className="text-lg font-normal text-muted-foreground">Lote {lote}</span>}
          {conCheck && <Check className="size-3.5 text-muted-foreground" />}
        </CardTitle>
        {derecha}
      </div>
      <CardDescription>{descripcion}</CardDescription>
    </CardHeader>
  )
}

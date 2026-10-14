import { useState } from "react"
import { Input } from "@/components/ui/input"
import { leerNumero } from "@/lib/indicadores/calculos"
import { cn } from "@/lib/utils"

const mostrar = (v: number | null) => (v == null ? "" : String(v).replace(".", ","))

/** Campo numérico del editor manual. Vacío = sin dato. */
export function CampoNumero({
  etiqueta,
  valor,
  onCambio,
  entero = false,
  sufijo,
  className,
}: {
  etiqueta: string
  valor: number | null
  onCambio: (v: number | null) => void
  entero?: boolean
  sufijo?: string
  className?: string
}) {
  // Texto propio: deja escribir "3," sin que se borre la coma. Si el valor
  // cambia desde afuera ("Traer lo automático"), el editor vuelve a montar los campos.
  const [texto, setTexto] = useState(mostrar(valor))
  return (
    <label className={cn("flex min-w-0 flex-col gap-1 text-[11.5px] font-semibold text-muted-foreground", className)}>
      {etiqueta}
      <span className="flex items-center gap-1">
        <Input
          inputMode={entero ? "numeric" : "decimal"}
          value={texto}
          placeholder="—"
          onChange={(e) => {
            setTexto(e.target.value)
            onCambio(leerNumero(e.target.value, entero))
          }}
          className="font-mono"
        />
        {sufijo && <span className="text-sm">{sufijo}</span>}
      </span>
    </label>
  )
}

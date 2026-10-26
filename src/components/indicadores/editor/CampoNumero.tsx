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
    <label className={cn("flex min-w-0 flex-col gap-1 text-xs font-semibold text-muted-foreground", className)}>
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

/** Lo que el editor calcula solo (no se escribe): mismo lugar y etiqueta que un campo. */
export function DatoCalculado({ etiqueta, texto, className }: { etiqueta: string; texto: string; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1 text-xs font-semibold text-muted-foreground", className)}>
      {etiqueta}
      <span title="Se calcula solo" className="flex h-9 items-center rounded-md border border-dashed bg-muted/40 px-3 font-mono text-sm text-foreground">
        {texto}
      </span>
    </div>
  )
}

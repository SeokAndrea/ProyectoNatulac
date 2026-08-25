import { useState, type ReactNode } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

/** Tarjeta colapsada por defecto — un clic en el título la abre. Ver uso en Finalizar Turno y Panel de Producción. */
export function SeccionColapsable({
  titulo,
  descripcion,
  children,
  abiertoPorDefecto = false,
}: {
  titulo: string
  descripcion?: string
  children: ReactNode
  abiertoPorDefecto?: boolean
}) {
  const [abierto, setAbierto] = useState(abiertoPorDefecto)

  return (
    <Card>
      <button type="button" className="flex w-full items-center justify-between gap-2 p-5 text-left" onClick={() => setAbierto((v) => !v)}>
        <span className="flex items-center gap-2">
          {abierto ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
          <span className="font-medium leading-none text-foreground">{titulo}</span>
        </span>
      </button>
      {abierto && (
        <CardContent className="-mt-2">
          {descripcion && <p className="mb-3 text-sm text-muted-foreground">{descripcion}</p>}
          {children}
        </CardContent>
      )}
    </Card>
  )
}

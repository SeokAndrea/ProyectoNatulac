import { Eye } from "lucide-react"
import { useAuth } from "@/lib/auth"
import { esGestion } from "@/lib/rolVista"

/** Sistema de Gestión: aviso fijo arriba de que todo es de solo lectura (ver src/lib/soloLectura.ts). */
export function FranjaSoloLectura() {
  const { session } = useAuth()
  if (!esGestion(session)) return null
  return (
    <div className="border-b border-border/70 bg-muted px-4 py-1.5 text-sm text-muted-foreground">
      <div className="mx-auto flex max-w-6xl items-center gap-2">
        <Eye className="size-4 shrink-0" />
        <span>
          <b className="text-foreground">Solo lectura.</b> Puedes ver todas las pantallas, pero no se guarda ningún cambio.
        </span>
      </div>
    </div>
  )
}

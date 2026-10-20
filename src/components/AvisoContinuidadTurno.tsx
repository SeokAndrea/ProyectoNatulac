import { useState } from "react"
import { Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth"
import { continuidadReciente } from "@/lib/continuidadTurno"
import { useSesionTurno } from "@/lib/sesionTurno"

const CLAVE = "continuidad-vista:"

function yaVisto(turnoId: string): boolean {
  try {
    return localStorage.getItem(CLAVE + turnoId) === "1"
  } catch {
    return false
  }
}

/**
 * Aviso arriba de todas las pantallas cuando el sistema le abrió el turno al
 * supervisor como continuación del suyo (ver src/lib/continuidadTurno.ts).
 * Se cierra con «Entendido»; en Finalizar Turno el botón queda bloqueado igual.
 */
export function AvisoContinuidadTurno() {
  const { session } = useAuth()
  const sesion = useSesionTurno()
  const [cerrados, setCerrados] = useState<string[]>([])
  const continuidad = continuidadReciente(sesion, session?.username ?? null)

  if (!continuidad || !sesion.turnoId) return null
  const turnoId = sesion.turnoId
  if (cerrados.includes(turnoId) || yaVisto(turnoId)) return null

  function entendido() {
    try {
      localStorage.setItem(CLAVE + turnoId, "1")
    } catch {
      // Sin almacenamiento: se oculta solo en esta pestaña.
    }
    setCerrados((c) => [...c, turnoId])
  }

  return (
    <div
      role="alert"
      className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-primary/40 bg-primary/5 px-4 py-3.5 print:hidden"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Info className="size-5" />
      </span>
      <div className="min-w-[200px] flex-1">
        <p className="text-base font-semibold text-foreground">
          El sistema cerró tu turno anterior y abrió el {continuidad.codigo} a las {continuidad.hora}
        </p>
        <p className="text-sm text-muted-foreground">
          Sigues a cargo hasta el cambio de turno. No lo finalices ni vuelvas a cargar el PT del turno anterior: ya quedó
          guardado. Si falta algo de ese turno, cárgalo en Producto Terminado con «Cargar en el turno anterior», durante la
          primera media hora.
        </p>
      </div>
      <Button size="sm" onClick={entendido}>
        Entendido
      </Button>
    </div>
  )
}

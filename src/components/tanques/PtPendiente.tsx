import { Link } from "react-router-dom"
import { PackageCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Corrida } from "@/lib/produccion/tipos"

/** "LINEA_2" → "Línea 2", "LINEA_T2" → "Línea T2". */
const nombreLinea = (codigo: string) => `Línea ${codigo.replace(/^LINEA_/, "")}`

/** Lleva a cargar el PT que falta (en lugar de un aviso que nadie lee). Ver paradasSinPt en estadoTanque.ts. */
export function BotonCargarPt({ corridas }: { corridas: Corrida[] }) {
  if (corridas.length === 0) return null
  const lineas = [...new Set(corridas.map((c) => nombreLinea(c.linea)))].join(", ")
  return (
    <Button asChild size="sm">
      <Link to="/producto-terminado">
        <PackageCheck className="size-3.5" />
        Cargar PT · {lineas}
      </Link>
    </Button>
  )
}

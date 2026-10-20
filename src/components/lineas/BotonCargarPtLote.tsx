import { Link } from "react-router-dom"
import { PackageCheck } from "lucide-react"
import { Button } from "@/components/ui/button"

/** Corrida que espera su PT: un botón directo a cargarlo, en vez de un aviso. */
export function BotonCargarPtLote({ lote }: { lote: string | null }) {
  return (
    <Button asChild size="sm" variant="outline" className="self-start border-warning/50">
      <Link to="/producto-terminado">
        <PackageCheck className="size-3.5" />
        Cargar PT{lote ? ` · Lote ${lote}` : ""}
      </Link>
    </Button>
  )
}

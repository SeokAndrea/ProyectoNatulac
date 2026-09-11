import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { RegistroParadas } from "@/components/RegistroParadas"
import { listarParadas, type Parada } from "@/lib/paradas"

/*
 * Registro de Paradas — el supervisor elige una de sus 3 líneas y carga
 * las paradas PROGRAMADA y el TIEMPO OCIOSO (la pestaña NO PROGRAMADA es
 * solo lectura, llega del Sheet de Mantenimiento). La vista vive en
 * <RegistroParadas> (compartida con el preview /paradas-demo).
 * FASE A′: listarParadas() lee el fixture y el registro no persiste.
 */
export default function Paradas() {
  const [paradas, setParadas] = useState<Parada[] | null>(null)

  useEffect(() => {
    let vivo = true
    // rango amplio: la vista de registro trabaja sobre lo del turno, no filtra por fecha
    listarParadas({ desde: "2000-01-01", hasta: "2999-12-31" }).then((filas) => {
      if (vivo) setParadas(filas)
    })
    return () => {
      vivo = false
    }
  }, [])

  return (
    <AppShell title="Registrar Paradas" description="Paradas programadas y tiempo ocioso, por línea">
      <div className="mx-auto w-full max-w-3xl">
        {paradas === null ? (
          <div className="flex justify-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <RegistroParadas paradas={paradas} />
        )}
      </div>
    </AppShell>
  )
}

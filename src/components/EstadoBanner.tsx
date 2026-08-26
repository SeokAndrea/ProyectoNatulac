import { CircleAlert } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/lib/auth"
import { useTurno } from "@/lib/turno"
import { useCatalogosLive } from "@/lib/catalogosLive"
import { AREAS, GRUPOS, TURNO_TIPOS, nombrePorCodigo } from "@/lib/catalogos"

/*
 * Franja fija debajo del header con Área, Supervisor activo y el
 * estado del turno en curso. Se muestra en todas las páginas internas
 * (Hub y AppShell) para que esa información nunca se pierda de vista,
 * incluso si el supervisor navega entre apps.
 *
 * "Supervisor" solo se muestra cuando hay turno activo (ahí sí es el
 * del turno EN CURSO, turnoActivo.supervisorNombre — importa sobre
 * todo en el Panel de Producción, que puede mostrar el turno de
 * cualquier supervisor, no solo el propio). Sin turno activo cae a
 * mostrar el usuario logueado, y ese SÍ puede no ser un supervisor
 * (Administrador de Área, Super Administrador) — por eso ahí la
 * etiqueta pasa a decir "Usuario".
 */
export function EstadoBanner() {
  const { session } = useAuth()
  const { turnoActivo, cargando } = useTurno()
  const { lineas } = useCatalogosLive()

  if (!session) return null

  return (
    <div className="border-b border-border/70 bg-muted/40">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-1.5 px-4 py-2 text-xs sm:px-6 sm:text-sm">
        <span>
          <span className="text-muted-foreground">Área: </span>
          <span className="font-medium text-foreground">
            {session.area ? nombrePorCodigo(AREAS, session.area) : "Todas las áreas"}
          </span>
        </span>
        <span>
          <span className="text-muted-foreground">{turnoActivo ? "Supervisor: " : "Usuario: "}</span>
          <span className="font-medium text-foreground">{turnoActivo ? turnoActivo.supervisorNombre : session.nombre}</span>
        </span>

        {cargando ? null : turnoActivo ? (
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span className="text-muted-foreground">Turno:</span>
            <span className="font-medium text-foreground">
              {nombrePorCodigo(TURNO_TIPOS, turnoActivo.turnoTipo)} · {nombrePorCodigo(GRUPOS, turnoActivo.grupo)} ·{" "}
              {(() => {
                const activas = turnoActivo.lineas.filter((l) => l.activa)
                return activas.length === 0 ? "sin líneas (parada)" : activas.map((l) => nombrePorCodigo(lineas, l.linea)).join(", ")
              })()}
            </span>
            <Badge variant="secondary">{turnoActivo.codigo}</Badge>
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-500">
            <CircleAlert className="size-3.5" />
            Sin turno iniciado
          </span>
        )}
      </div>
    </div>
  )
}

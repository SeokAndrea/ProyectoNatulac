import { Boxes, Loader2 } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { EmptyState } from "@/components/EmptyState"
import { MensajeError } from "@/components/MensajeError"
import { TarjetaLineaRobot, type AccionesRobot } from "@/components/robot-tavil/TarjetaLineaRobot"
import { useAuth } from "@/lib/auth"
import { useCatalogosLive } from "@/lib/catalogosLive"
import { guardarResto, iniciarLote, restarPaleta, sumarPaleta, useRobotTavil } from "@/lib/robotTavil"

/*
 * Robot Tavil: el operador ve las líneas activas de la planta y, cuando sale
 * una paleta, toca «+» en la suya. Es la precarga del Producto Terminado: el
 * supervisor la confirma o la corrige en su tarjeta. No hace falta turno.
 * Reglas en src/lib/robotTavil.ts y en la migración 20261114690000.
 */
export default function RobotTavil() {
  const { session } = useAuth()
  const usuario = session?.username ?? null
  const { lineas, cargando, error, apagado, ejecutar } = useRobotTavil(usuario)
  const { presentaciones } = useCatalogosLive()

  const acciones: AccionesRobot = {
    sumar: (linea) => ejecutar(() => sumarPaleta(usuario!, linea)),
    restar: (linea) => ejecutar(() => restarPaleta(usuario!, linea)),
    guardarResto: (linea, cajas) => ejecutar(() => guardarResto(usuario!, linea, cajas)),
    iniciar: (linea) => ejecutar(() => iniciarLote(usuario!, linea)),
  }

  return (
    <AppShell title="Robot Tavil" description="Paletas que salen del robot">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-3">
        {cargando ? (
          <div className="flex justify-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : apagado ? (
          <EmptyState icon={Boxes} title="El Robot Tavil no está habilitado" description="La administración lo activa cuando esté listo para usar." />
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Toca <b>+</b> cuando sale una paleta de la línea que corresponde. Si te equivocas, toca <b>−</b>. El Resto se escribe directamente.
            </p>
            <MensajeError error={error} />
            {lineas.length === 0 ? (
              <EmptyState icon={Boxes} title="No hay líneas activas" description="Cuando el supervisor active una corrida en Líneas, aparece aquí." />
            ) : (
              lineas.map((l) => <TarjetaLineaRobot key={l.lineaCodigo} linea={l} presentaciones={presentaciones} acciones={acciones} />)
            )}
          </>
        )}
      </div>
    </AppShell>
  )
}

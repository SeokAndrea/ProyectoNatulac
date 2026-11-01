import { useRef, type ComponentProps } from "react"
import { AppShell } from "@/components/AppShell"
import { useAjusteAPantalla } from "@/components/panel-paradas/useAjusteAPantalla"

/**
 * El marco de un panel en vivo: con su AppShell de siempre o, en el modo TV
 * (src/pages/apps/ModoTv.tsx), solo el contenido a todo lo ancho, sin
 * encabezado ni menú, y agrandado o achicado para que entre en la pantalla.
 */
export function MarcoPanel({ enTv = false, children, ...props }: ComponentProps<typeof AppShell> & { enTv?: boolean }) {
  const contenidoRef = useRef<HTMLDivElement>(null)
  // Lo que no es contenido: arriba el lugar del recuadro del modo TV (56) y el margen de abajo (12).
  const escala = useAjusteAPantalla(contenidoRef, enTv, 68)
  if (!enTv) return <AppShell {...props}>{children}</AppShell>
  return (
    <div className="h-svh overflow-hidden bg-background p-3 pt-14">
      <div ref={contenidoRef} style={{ zoom: escala }}>
        {children}
      </div>
    </div>
  )
}

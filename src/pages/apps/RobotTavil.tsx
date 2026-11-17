import { useState } from "react"
import { Boxes, Loader2, Printer, X } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { EmptyState } from "@/components/EmptyState"
import { MensajeError } from "@/components/MensajeError"
import { TarjetaLineaRobot, type AccionesRobot } from "@/components/robot-tavil/TarjetaLineaRobot"
import { TicketsSistema } from "@/components/robot-tavil/TicketsSistema"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth"
import { useCatalogosLive } from "@/lib/catalogosLive"
import { imprimirYRegistrar } from "@/lib/imprimirEtiqueta"
import { puede } from "@/lib/permisos"
import {
  cambiarManual,
  configurarTickets,
  editarPaleta,
  guardarResto,
  iniciarLote,
  restarPaleta,
  sumarPaleta,
  useRobotTavil,
  type ConfigTickets,
} from "@/lib/robotTavil"
import { numeroPaleta4 } from "@/lib/ticketPaleta"
import type { Paleta } from "@/lib/trazabilidadPaletizado"
import { cn } from "@/lib/utils"

/*
 * Robot Tavil: el operador ve las líneas activas de la planta y, cuando sale
 * una paleta, toca «+» en la suya. Es la precarga del Producto Terminado: el
 * supervisor la confirma o la corrige en su tarjeta. No hace falta turno.
 * Reglas en src/lib/robotTavil.ts y en la migración 20261114690000.
 *
 * «Tickets por sistema» (prueba, migración 20261116590000): encendido, el «+»
 * crea el ticket en el servidor y esta pantalla lo imprime (src/lib/imprimirEtiqueta.tsx).
 */

const SIN_CONFIG: ConfigTickets = { activo: false, copias: 1, cambiadoEn: null, cambiadoPor: null }

interface AvisoTicket {
  tono: "info" | "ok" | "error" | "warning"
  texto: string
  /** Con paleta, el aviso ofrece «Reimprimir». */
  paleta: Paleta | null
}

export default function RobotTavil() {
  const { session } = useAuth()
  const usuario = session?.username ?? null
  const { lineas, tickets, setTickets, cargando, error, ejecutar, intentar } = useRobotTavil(usuario)
  const config = tickets ?? SIN_CONFIG
  const { presentaciones } = useCatalogosLive()
  const puedeTickets = !!session?.esDueno || puede(session, "ROBOT_TAVIL_TICKETS")
  const [aviso, setAviso] = useState<AvisoTicket | null>(null)

  /** Nueva: las copias del interruptor. Reimpresión: una. */
  async function imprimir(p: Paleta, nueva: boolean) {
    setAviso({ tono: "info", texto: `Enviando el ticket ${p.ticket ?? ""} a la impresora…`, paleta: null })
    const r = await imprimirYRegistrar(usuario!, p, nueva ? config.copias : 1, "Robot Tavil")
    if (r.error) setAviso({ tono: "error", texto: r.error, paleta: p })
    else
      setAviso({
        tono: "ok",
        texto: `${nueva ? `Paleta Nº ${numeroPaleta4(p.numero)} creada. ` : ""}Ticket ${p.ticket ?? ""} enviado a la impresora.`,
        paleta: r.paleta ?? p,
      })
  }

  const acciones: AccionesRobot = {
    crear: (linea, d) =>
      intentar(
        () => sumarPaleta(usuario!, linea, d),
        (pantalla) => {
          if (pantalla.creada?.ticketSistema) void imprimir(pantalla.creada, true)
        },
      ),
    editar: (paletaId, d) =>
      intentar(
        () => editarPaleta(usuario!, paletaId, d),
        (pantalla) => {
          const p = pantalla.editada
          if (p?.ticketSistema)
            setAviso({
              tono: "warning",
              texto: `Paleta Nº ${numeroPaleta4(p.numero)} corregida. Si cambió algo que sale en el ticket ${p.ticket ?? ""}, reimprímelo y cambia el que está pegado.`,
              paleta: p,
            })
        },
      ),
    cambiarManual: (linea, manual) => intentar(() => cambiarManual(usuario!, linea, manual)),
    restar: (linea) =>
      ejecutar(
        () => restarPaleta(usuario!, linea),
        (pantalla) => {
          const p = pantalla.anulada
          if (p?.ticketSistema)
            setAviso({ tono: "warning", texto: `Paleta Nº ${numeroPaleta4(p.numero)} anulada: retira y bota su ticket ${p.ticket ?? ""}.`, paleta: null })
        },
      ),
    guardarResto: (linea, cajas) => ejecutar(() => guardarResto(usuario!, linea, cajas)),
    iniciar: (linea) => ejecutar(() => iniciarLote(usuario!, linea)),
  }

  async function guardarConfig(activo: boolean, copias: number): Promise<string | null> {
    const r = await configurarTickets(usuario!, activo, copias)
    if (!r.ok) return r.error
    setTickets(r.data)
    return null
  }

  return (
    <AppShell title="Robot Tavil" description="Paletas que salen del robot">
      <div className="mx-auto flex w-full max-w-lg flex-col gap-3">
        {cargando ? (
          <div className="flex justify-center py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <>
            <TicketsSistema config={config} puedeCambiar={puedeTickets} onGuardar={guardarConfig} />
            <p className="text-sm text-muted-foreground">
              {config.activo ? (
                <>
                  Toca <b>+</b> cuando sale una paleta y marca si es conforme: el sistema crea el ticket y lo imprime. Si te equivocas, toca{" "}
                  <b>−</b> y retira el ticket de la paleta, o corrige la paleta en «Paletas de hoy». El Resto se escribe directamente.
                </>
              ) : (
                <>
                  Toca <b>+</b> cuando sale una paleta de la línea que corresponde y escribe su ticket. Si te equivocas, toca <b>−</b> o
                  corrige la paleta en «Paletas de hoy». El Resto se escribe directamente.
                </>
              )}
            </p>
            <MensajeError error={error} />
            {aviso && (
              <AvisoImpresion
                aviso={aviso}
                onReimprimir={aviso.paleta ? () => void imprimir(aviso.paleta!, false) : undefined}
                onCerrar={() => setAviso(null)}
              />
            )}
            {lineas.length === 0 ? (
              <EmptyState icon={Boxes} title="No hay líneas activas" description="Cuando el supervisor active una corrida en Líneas, aparece aquí." />
            ) : (
              lineas.map((l) => (
                <TarjetaLineaRobot
                  key={l.lineaCodigo}
                  linea={l}
                  presentaciones={presentaciones}
                  acciones={acciones}
                  ticketsSistema={config.activo}
                  onReimprimir={(p) => void imprimir(p, false)}
                />
              ))
            )}
          </>
        )}
      </div>
    </AppShell>
  )
}

function AvisoImpresion({ aviso, onReimprimir, onCerrar }: { aviso: AvisoTicket; onReimprimir?: () => void; onCerrar: () => void }) {
  return (
    <div
      role={aviso.tono === "error" ? "alert" : "status"}
      className={cn(
        "flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm",
        aviso.tono === "ok" && "border-success/35 bg-success-soft text-success-foreground",
        aviso.tono === "info" && "border-info/35 bg-info-soft text-info-foreground",
        aviso.tono === "warning" && "border-warning/50 bg-warning-soft text-warning-foreground",
        aviso.tono === "error" && "border-danger/40 bg-danger-soft text-danger-foreground",
      )}
    >
      <span className="flex min-w-0 items-start gap-2">
        {aviso.tono === "info" ? <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" /> : <Printer className="mt-0.5 size-4 shrink-0" />}
        <span>{aviso.texto}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        {onReimprimir && aviso.tono !== "info" && (
          <Button size="sm" variant="outline" className="bg-card" onClick={onReimprimir}>
            Reimprimir
          </Button>
        )}
        <Button size="icon" variant="ghost" className="size-8" aria-label="Cerrar el aviso" onClick={onCerrar}>
          <X className="size-4" />
        </Button>
      </span>
    </div>
  )
}

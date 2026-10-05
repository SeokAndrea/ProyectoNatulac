import { useState, type ReactNode } from "react"
import { Factory } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { LineaVisual } from "@/components/LineaVisual"
import { CintaEstadoLinea } from "@/components/CintaEstadoLinea"
import type { ModoEstadoPlanta } from "@/components/EstadoPlantaTabs"
import type { LineaCodigo } from "@/lib/catalogos"
import type { PresentacionLive, VelocidadLive } from "@/lib/catalogosLive"
import { colorSabor } from "@/lib/coloresSabor"
import type { TanqueRecepcion } from "@/lib/preparacion/tipos"
import type { Corrida, LineaEstado, ParadaQueDetiene } from "@/lib/produccion/tipos"
import { ConfirmarInicioLinea } from "./ConfirmarInicioLinea"
import { EstadoCipLinea } from "./EstadoCipLinea"
import { aspectoLinea } from "./estadoLinea"
import { FormArrancarLinea } from "./FormArrancarLinea"
import { FormCipLinea } from "./FormCipLinea"
import { FormDetenerLinea } from "./FormDetenerLinea"
import { FormParadaLinea } from "./FormParadaLinea"
import { PanelCambioLote } from "./PanelCambioLote"
import { PanelCipConLote } from "./PanelCipConLote"
import { PanelCorriendo } from "./PanelCorriendo"
import { PanelEsperandoPt } from "./PanelEsperandoPt"
import { PanelLineaLibre } from "./PanelLineaLibre"
import { PanelLoteTerminado } from "./PanelLoteTerminado"
import { PanelPausada } from "./PanelPausada"
import type { AccionesLinea } from "./tipos"

/** Formulario/confirmación abierto en la tarjeta. Uno a la vez; al terminar bien (o Cancelar) se cierra. */
type Panel = "arrancar" | "parada" | "detener" | "cipConCorrida" | "cipSinCorrida" | "cambioLote" | null

/**
 * Tarjeta de una línea: cabecera, animación, datos de la corrida y el
 * panel que toca según el estado. Cada panel/formulario vive en su propio
 * archivo de esta carpeta y lleva su propio "mandando…" y error.
 */
export function LineaCard({
  lineaCodigo,
  nombreLinea,
  modo,
  areaCodigo,
  lineaTurno,
  corridaEsperandoPt,
  lineaEstado,
  tanquesListos,
  presentaciones,
  velocidades,
  paradaQueDetiene,
  acciones,
}: {
  lineaCodigo: LineaCodigo
  nombreLinea: string
  modo: ModoEstadoPlanta
  areaCodigo: string | null
  /** Corrida activa de la línea (corriendo, en pausa o con el lote terminado). */
  lineaTurno: Corrida | null
  /** Corrida detenida que espera que se cargue su Producto Terminado. */
  corridaEsperandoPt: Corrida | null
  lineaEstado: LineaEstado | null
  tanquesListos: TanqueRecepcion[]
  presentaciones: PresentacionLive[]
  velocidades: VelocidadLive[]
  /** Parada (+1) sin completar que tiene detenida a esta línea (la del CIP). */
  paradaQueDetiene: ParadaQueDetiene | null
  acciones: AccionesLinea
}) {
  const [panel, setPanel] = useState<Panel>(null)
  const cerrar = () => setPanel(null)

  const condicion = lineaEstado?.condicion ?? "DETENIDA"
  const enCip = condicion === "CIP"
  /** Sin corrida activa, pero quedó una corrida detenida esperando que se cargue su Producto Terminado. */
  const esperandoPt = lineaTurno === null && corridaEsperandoPt !== null
  const aspecto = aspectoLinea(lineaTurno, condicion, esperandoPt)

  const formCip = (corrida: Corrida | null) => (
    <FormCipLinea lineaCodigo={lineaCodigo} corrida={corrida} ponerEnCip={acciones.ponerEnCip} onCerrar={cerrar} />
  )

  function cuerpo(): ReactNode {
    if (modo === "status" && lineaTurno && !lineaTurno.confirmadoInicioEn && panel !== "arrancar") {
      return (
        <ConfirmarInicioLinea
          nombreLinea={nombreLinea}
          corrida={lineaTurno}
          confirmarEstado={acciones.confirmarEstado}
          onCorregir={() => setPanel("arrancar")}
        />
      )
    }
    if (panel === "arrancar") {
      return (
        <FormArrancarLinea
          lineaCodigo={lineaCodigo}
          nombreLinea={nombreLinea}
          areaCodigo={areaCodigo}
          corridaActual={lineaTurno}
          confirmarInicio={modo === "status"}
          tanquesListos={tanquesListos}
          presentaciones={presentaciones}
          velocidades={velocidades}
          activar={acciones.activar}
          onCerrar={cerrar}
        />
      )
    }

    if (lineaTurno) {
      if (panel === "parada") return <FormParadaLinea corridaId={lineaTurno.id} pausar={acciones.pausar} onCerrar={cerrar} />
      if (panel === "detener") return <FormDetenerLinea corrida={lineaTurno} detener={acciones.detener} onCerrar={cerrar} />
      if (lineaTurno.loteTerminado != null) {
        return (
          <PanelLoteTerminado
            corrida={lineaTurno}
            tanquesListos={tanquesListos}
            seguirMismoLote={acciones.seguirMismoLote}
            continuarSiguienteLote={acciones.continuarSiguienteLote}
            onDetener={() => setPanel("detener")}
          />
        )
      }
      if (panel === "cipConCorrida") return formCip(lineaTurno)
      if (lineaTurno.pausadaEn != null) {
        return enCip ? (
          <PanelCipConLote
            lineaCodigo={lineaCodigo}
            corrida={lineaTurno}
            lineaEstado={lineaEstado}
            paradaQueDetiene={paradaQueDetiene}
            terminarCip={acciones.terminarCip}
            terminarLinea={acciones.terminarLinea}
          />
        ) : (
          <PanelPausada
            corrida={lineaTurno}
            paradaQueDetiene={paradaQueDetiene}
            continuar={acciones.continuar}
            onCip={() => setPanel("cipConCorrida")}
            onDetener={() => setPanel("detener")}
          />
        )
      }
      if (panel === "cambioLote") {
        return (
          <PanelCambioLote
            nombreLinea={nombreLinea}
            corrida={lineaTurno}
            tanquesListos={tanquesListos}
            continuarSiguienteLote={acciones.continuarSiguienteLote}
            onCerrar={cerrar}
          />
        )
      }
      return (
        <PanelCorriendo
          corregible={modo === "status"}
          onCorregir={() => setPanel("arrancar")}
          onParada={() => setPanel("parada")}
          onCip={() => setPanel("cipConCorrida")}
          onCambiarLote={() => setPanel("cambioLote")}
        />
      )
    }

    if (corridaEsperandoPt && enCip) {
      // CIP en el que el lote terminó: falta su PT y terminar el CIP (en cualquier orden).
      return (
        <div className="flex flex-col gap-2">
          <p className="rounded-lg border border-warning/40 bg-warning-soft/40 p-2 text-xs text-foreground">
            La corrida{corridaEsperandoPt.lote ? ` del Lote ${corridaEsperandoPt.lote}` : ""} espera su Producto Terminado.
          </p>
          <EstadoCipLinea
            lineaCodigo={lineaCodigo}
            lineaEstado={lineaEstado}
            paradaQueDetiene={paradaQueDetiene}
            terminarCip={acciones.terminarCip}
          />
        </div>
      )
    }
    if (corridaEsperandoPt) {
      return (
        <PanelEsperandoPt
          corrida={corridaEsperandoPt}
          continuarCorridaDetenida={acciones.continuarCorridaDetenida}
          onArrancarOtro={() => setPanel("arrancar")}
        />
      )
    }
    return (
      <PanelLineaLibre
        lineaCodigo={lineaCodigo}
        condicion={condicion}
        lineaEstado={lineaEstado}
        paradaQueDetiene={paradaQueDetiene}
        formCip={panel === "cipSinCorrida" ? formCip(null) : null}
        cambiarCondicion={acciones.cambiarCondicion}
        terminarCip={acciones.terminarCip}
        onArrancar={() => setPanel("arrancar")}
        onIniciarCip={() => setPanel("cipSinCorrida")}
      />
    )
  }

  return (
    <Card className="overflow-hidden border-border shadow-sm">
      <CardContent className="flex flex-col gap-3 px-2 py-4">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <p className="flex min-w-0 items-center gap-1.5 truncate text-sm font-semibold">
            <Factory className="size-4 shrink-0 text-muted-foreground" />
            {nombreLinea}
          </p>
          <Badge variant={aspecto.variante} className="shrink-0">
            {aspecto.badge}
          </Badge>
        </div>

        {aspecto.cinta ? (
          <CintaEstadoLinea
            estado={aspecto.cinta}
            saborNombre={lineaTurno?.saborNombre}
            presentacion={lineaTurno?.presentacion}
            escala={1.8}
            className="w-full"
          />
        ) : (
          <LineaVisual
            numeroLinea={Number(lineaCodigo.replace("LINEA_", "")) || 0}
            estado={aspecto.visual}
            color={colorSabor(lineaTurno?.saborNombre ?? null)}
            square
            saborNombre={lineaTurno?.saborNombre ?? null}
            presentacion={lineaTurno?.presentacion ?? null}
          />
        )}

        {lineaTurno && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm [&>div]:min-w-0">
            <div>
              <p className="text-xs text-muted-foreground">Presentación</p>
              <p className="font-medium text-foreground">{lineaTurno.presentacion} ml</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Velocidad</p>
              <p className="num font-medium text-foreground">{lineaTurno.envasesHora} env/h</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Sabor / Lote</p>
              <p className="font-medium break-words text-foreground">
                {lineaTurno.saborNombre ?? "—"}
                {lineaTurno.lote ? ` · ${lineaTurno.lote}` : ""}
              </p>
            </div>
          </div>
        )}

        {/* Tras "Continuar al siguiente lote" la corrida vieja queda esperando su PT
            aunque la línea ya corra con otra: sin este aviso, Finalizar Turno la
            rechaza y el supervisor no ve por qué. */}
        {lineaTurno && corridaEsperandoPt && (
          <p className="rounded-lg border border-warning/40 bg-warning-soft/40 px-3 py-2 text-xs text-foreground">
            La corrida anterior{corridaEsperandoPt.lote ? ` del Lote ${corridaEsperandoPt.lote}` : ""} espera su Producto
            Terminado. Cárgalo en Producto Terminado.
          </p>
        )}

        {cuerpo()}
      </CardContent>
    </Card>
  )
}

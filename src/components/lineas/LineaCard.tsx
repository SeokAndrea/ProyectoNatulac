import { useState, type ReactNode } from "react"
import { Factory, ListPlus } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { LineaVisual } from "@/components/LineaVisual"
import { CintaEstadoLinea } from "@/components/CintaEstadoLinea"
import type { ModoEstadoPlanta } from "@/components/EstadoPlantaTabs"
import type { LineaCodigo } from "@/lib/catalogos"
import type { PresentacionLive, VelocidadLive } from "@/lib/catalogosLive"
import { colorSabor } from "@/lib/coloresSabor"
import type { Parada } from "@/lib/paradas"
import type { TanqueRecepcion } from "@/lib/preparacion/tipos"
import type { Corrida, LineaEstado, ParadaQueDetiene, Resultado } from "@/lib/produccion/tipos"
import { BotonCargarPtLote } from "./BotonCargarPtLote"
import { ConfirmarInicioLinea, type NoCorre } from "./ConfirmarInicioLinea"
import { EstadoCipLinea } from "./EstadoCipLinea"
import { aspectoLinea } from "./estadoLinea"
import { FormArrancarLinea } from "./FormArrancarLinea"
import { FormCipLinea } from "./FormCipLinea"
import { FormDetenerLinea } from "./FormDetenerLinea"
import { FilaAcciones } from "./FilaAcciones"
import { FormParadaLinea } from "./FormParadaLinea"
import { PanelCambioLote } from "./PanelCambioLote"
import { PanelCipConLote } from "./PanelCipConLote"
import { PanelCorriendo } from "./PanelCorriendo"
import { PanelEsperandoPt } from "./PanelEsperandoPt"
import { PanelLineaLibre } from "./PanelLineaLibre"
import { PanelLoteTerminado } from "./PanelLoteTerminado"
import { PanelParadasLinea } from "./PanelParadasLinea"
import { PanelPausada } from "./PanelPausada"
import type { AccionesLinea } from "./tipos"

/** Formulario/confirmación abierto en la tarjeta. Uno a la vez; al terminar bien (o Cancelar) se cierra. */
type Panel = "arrancar" | "parada" | "detener" | "cipConCorrida" | "cipSinCorrida" | "cambioLote" | "paradas" | null

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
  paradaDeLinea,
  acciones,
  paradas,
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
  /** La parada ligada a la línea: la abierta de una Parada, o el +1 del CIP. */
  paradaDeLinea?: ParadaQueDetiene | null
  acciones: AccionesLinea
  /**
   * Paradas de la línea desde su tarjeta (dueña, 2026-10-25): sus +1 pendientes
   * y anotar una que ya pasó. Sin esto (sin permiso), no hay botón de Paradas.
   */
  paradas?: { usuario: string; pendientes: Parada[]; onCambio: () => Promise<void> }
}) {
  const [panel, setPanel] = useState<Panel>(null)
  const cerrar = () => setPanel(null)

  const condicion = lineaEstado?.condicion ?? "DETENIDA"
  const enCip = condicion === "CIP"
  /** Sin corrida activa, pero quedó una corrida detenida esperando que se cargue su Producto Terminado. */
  const esperandoPt = lineaTurno === null && corridaEsperandoPt !== null
  const aspecto = aspectoLinea(lineaTurno, condicion, esperandoPt)

  /** Status: corrida heredada que todavía no se revisó. */
  const sinConfirmar = modo === "status" && lineaTurno !== null && !lineaTurno.confirmadoInicioEn
  /** «No está corriendo»: se confirma al mandar la Parada, el Detener o el CIP (la base no deja seguir sin confirmar). */
  function antesConfirmar<A extends unknown[]>(fn: (...args: A) => Promise<Resultado>) {
    return async (...args: A): Promise<Resultado> => {
      if (sinConfirmar && lineaTurno) {
        const r = await acciones.confirmarEstado(lineaTurno.id)
        if (!r.ok) return r
      }
      return fn(...args)
    }
  }
  const noCorre: Record<NoCorre, Panel> = { parada: "parada", detener: "detener", cip: "cipConCorrida" }

  const formCip = (corrida: Corrida | null) => (
    <FormCipLinea lineaCodigo={lineaCodigo} corrida={corrida} ponerEnCip={antesConfirmar(acciones.ponerEnCip)} onCerrar={cerrar} />
  )

  const botonParadas = paradas && (
    <Button variant="outline" size="sm" onClick={() => setPanel("paradas")}>
      <ListPlus className="size-3.5" />
      Paradas
      {paradas.pendientes.length > 0 && (
        <span className="num rounded-sm bg-warning-soft px-1.5 text-xs font-semibold text-warning-foreground" aria-label={`${paradas.pendientes.length} pendientes`}>
          {paradas.pendientes.length}
        </span>
      )}
    </Button>
  )
  /** El botón de Paradas va en la fila del panel de "corriendo" o de "línea libre"; en los demás estados, en una fila propia debajo. */
  const paradasEnFila =
    panel === null &&
    ((lineaTurno !== null && !sinConfirmar && lineaTurno.loteTerminado == null && lineaTurno.pausadaEn == null) ||
      (lineaTurno === null && corridaEsperandoPt === null))

  function cuerpo(): ReactNode {
    if (panel === "paradas" && paradas) {
      return (
        <PanelParadasLinea
          lineaCodigo={lineaCodigo}
          nombreLinea={nombreLinea}
          areaCodigo={areaCodigo}
          usuario={paradas.usuario}
          presentacionMl={Number(lineaTurno?.presentacion) || null}
          pendientes={paradas.pendientes}
          onCambio={paradas.onCambio}
          onCerrar={cerrar}
        />
      )
    }
    if (sinConfirmar && lineaTurno && (panel === null || panel === "cambioLote" || panel === "cipSinCorrida")) {
      return (
        <ConfirmarInicioLinea
          nombreLinea={nombreLinea}
          corrida={lineaTurno}
          confirmarEstado={acciones.confirmarEstado}
          onCorregir={() => setPanel("arrancar")}
          onNoCorre={(como) => setPanel(noCorre[como])}
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
      if (panel === "parada") {
        return (
          <FormParadaLinea
            corridaId={lineaTurno.id}
            lineaCodigo={lineaCodigo}
            areaCodigo={areaCodigo}
            presentacionMl={Number(lineaTurno.presentacion) || null}
            desdeAntes={sinConfirmar}
            pausar={antesConfirmar(acciones.pausar)}
            onCerrar={cerrar}
          />
        )
      }
      if (panel === "detener") return <FormDetenerLinea corrida={lineaTurno} detener={antesConfirmar(acciones.detener)} onCerrar={cerrar} />
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
            paradaDeLinea={paradaDeLinea ?? null}
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
          extra={botonParadas}
        />
      )
    }

    if (corridaEsperandoPt && enCip) {
      // CIP en el que el lote terminó: falta su PT y terminar el CIP (en cualquier orden).
      return (
        <div className="flex flex-col gap-2">
          <BotonCargarPtLote lote={corridaEsperandoPt.lote} />
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
        extra={botonParadas}
      />
    )
  }

  const contenido = cuerpo()

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
            aunque la línea ya corra con otra: sin esto, Finalizar Turno la
            rechaza y el supervisor no ve por qué. */}
        {lineaTurno && corridaEsperandoPt && <BotonCargarPtLote lote={corridaEsperandoPt.lote} />}

        {contenido}
        {panel === null && !paradasEnFila && botonParadas && <FilaAcciones>{botonParadas}</FilaAcciones>}
      </CardContent>
    </Card>
  )
}

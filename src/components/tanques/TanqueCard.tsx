import { useState } from "react"
import { CheckCircle2, Container, Loader2, PenLine } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ConfirmarEstadoTanque } from "@/components/ConfirmarEstadoTanque"
import type { ModoEstadoPlanta } from "@/components/EstadoPlantaTabs"
import { MensajeError } from "@/components/MensajeError"
import { TanqueEditForm } from "@/components/TanqueEditForm"
import { TanqueVisual } from "@/components/TanqueVisual"
import type { AnalisisCalidad } from "@/lib/calidad"
import { colorSabor } from "@/lib/coloresSabor"
import type { ModoTransferencia, PreparacionRegistro, TanqueRecepcion } from "@/lib/preparacion/tipos"
import type { Corrida } from "@/lib/produccion/tipos"
import type { Sabor } from "@/lib/sabores"
import { useAccion } from "@/lib/useAccion"
import { CierreTransferencia } from "./CierreTransferencia"
import { TANK_CAPACITY } from "./constantes"
import { DescripcionTanque } from "./DescripcionTanque"
import { DialogTransferir } from "./DialogTransferir"
import { badgeVariantCondicion, conLiquido, nombreCondicionTanque, saborDibujado } from "./estadoTanque"
import { PanelAccionesTanque } from "./PanelAccionesTanque"
import { PanelEnPreparacion } from "./PanelEnPreparacion"
import type { AccionesTanque } from "./tipos"

/** Transferencia hecha que falta cerrar con lo medido. */
interface TransferenciaHecha {
  origen: 1 | 2 | 3
  destino: 1 | 2 | 3
  modo: ModoTransferencia
}

/**
 * Tarjeta de un tanque: cabecera, dibujo, qué tiene y el panel que toca
 * según el modo y la condición. Cada panel/formulario vive en su propio
 * archivo de esta carpeta y lleva su propio "mandando…" y error.
 */
export function TanqueCard({
  tanque,
  sabores,
  modo,
  preparaciones,
  tanquesDelTurno,
  corridasDelTurno,
  areaCodigo,
  usuarioSesion,
  analisisPorLote,
  calidadLibera,
  puedeIrACalidad,
  turnoId,
  acciones,
}: {
  tanque: TanqueRecepcion
  sabores: Sabor[]
  modo: ModoEstadoPlanta
  /** Lotes de ESTE tanque. */
  preparaciones: PreparacionRegistro[]
  tanquesDelTurno: TanqueRecepcion[]
  corridasDelTurno: Corrida[]
  areaCodigo: string | null
  usuarioSesion: string
  /** Análisis de Calidad de los lotes abiertos (el más nuevo primero). */
  analisisPorLote: Map<string, AnalisisCalidad[]>
  /** true = en esta área libera Calidad; false = libera el supervisor; null = cargando. */
  calidadLibera: boolean | null
  puedeIrACalidad: boolean
  turnoId: string | null
  acciones: AccionesTanque
}) {
  const [editando, setEditando] = useState(false)
  const [transfiriendo, setTransfiriendo] = useState(false)
  const [transferencia, setTransferencia] = useState<TransferenciaHecha | null>(null)
  const terminarCip = useAccion()

  const loteAbierto = preparaciones.find((p) => !p.liberadoEn && !p.cerradoEn) ?? null
  const loteActivo = preparaciones.find((p) => p.liberadoEn && !p.cerradoEn) ?? null
  const loteActivoSinCorrida =
    loteActivo !== null && loteActivo.turnoId === turnoId && !corridasDelTurno.some((c) => c.loteId === loteActivo.id)
  const hayCorridaEnEsteTanque = loteActivo !== null && corridasDelTurno.some((c) => c.loteId === loteActivo.id && c.activa)
  const destinos = tanquesDelTurno.filter(
    (t) =>
      t.numeroTanque !== tanque.numeroTanque &&
      (t.condicion === "LIMPIO" || (conLiquido(t) && t.saborId !== null && t.saborId === tanque.saborId)),
  )
  /** Tanque destino tal como quedó DESPUÉS de la transferencia (dato fresco del turno). */
  const destinoTransferido = transferencia ? tanquesDelTurno.find((t) => t.numeroTanque === transferencia.destino) : undefined

  return (
    <Card className="overflow-hidden border-border shadow-sm">
      <CardContent className="flex flex-col gap-3 px-2 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 rounded-lg border-2 border-foreground/25 px-2.5 py-1 text-lg font-bold tracking-wide">
            <Container className="size-4.5 text-muted-foreground" />
            Tanque {tanque.numeroTanque}
          </span>
          <Badge variant={badgeVariantCondicion[tanque.condicion]} className="shrink-0">
            {nombreCondicionTanque(tanque.condicion, tanque.volumenL)}
          </Badge>
        </div>

        <div className="flex items-center gap-3">
          <TanqueVisual
            numeroTanque={tanque.numeroTanque}
            condicion={tanque.condicion}
            volumenL={tanque.volumenL}
            volumenInicialL={tanque.volumenInicialL}
            color={colorSabor(saborDibujado(tanque, loteAbierto))}
            capacidad={TANK_CAPACITY}
            square
          />
          <div className="min-w-0 flex-1">
            {conLiquido(tanque) && (
              <p className="num text-xl font-bold text-foreground">{(tanque.volumenL ?? 0).toLocaleString("es-CO")} L</p>
            )}
          </div>
        </div>

        <div className="min-w-0">
          <DescripcionTanque tanque={tanque} loteAbierto={loteAbierto} />
        </div>

        {/* También en modo "status": si al editar el tanque queda En Preparación, se debe poder liberar aquí mismo sin ir a Preparación. */}
        {tanque.condicion === "EN_PREPARACION" && loteAbierto && (
          <PanelEnPreparacion
            lote={loteAbierto}
            calidadLibera={calidadLibera}
            ultimoAnalisis={analisisPorLote.get(loteAbierto.id)?.[0] ?? null}
            puedeIrACalidad={puedeIrACalidad}
            liberarLote={acciones.liberarLote}
            ajustar={acciones.ajustar}
          />
        )}

        {modo === "preparacion" && tanque.condicion === "CIP" && (
          <>
            <Button
              size="sm"
              className="self-start"
              disabled={terminarCip.enviando}
              onClick={() =>
                terminarCip.ejecutar(() =>
                  acciones.cambiarCondicion({ numeroTanque: tanque.numeroTanque, condicion: "LIMPIO", saborId: null, volumenL: null, lote: null }),
                )
              }
            >
              {terminarCip.enviando ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
              Terminó CIP
            </Button>
            <MensajeError error={terminarCip.error} />
          </>
        )}

        {modo === "preparacion" && tanque.condicion !== "EN_PREPARACION" && tanque.condicion !== "CIP" && (
          <PanelAccionesTanque
            tanque={tanque}
            sabores={sabores}
            loteActivo={loteActivo}
            loteActivoSinCorrida={loteActivoSinCorrida}
            puedeTransferir={destinos.length > 0}
            areaCodigo={areaCodigo}
            usuarioSesion={usuarioSesion}
            acciones={acciones}
            onTransferir={() => setTransfiriendo(true)}
          />
        )}

        {modo === "preparacion" && transfiriendo && (
          <DialogTransferir
            tanque={tanque}
            destinos={destinos}
            hayCorridaEnEsteTanque={hayCorridaEnEsteTanque}
            medirTanque={acciones.medirTanque}
            transferir={acciones.transferir}
            onCerrar={() => setTransfiriendo(false)}
            onTransferido={(destino, modoTransferido) => {
              setTransfiriendo(false)
              setTransferencia({ origen: tanque.numeroTanque, destino, modo: modoTransferido })
            }}
          />
        )}

        {modo === "preparacion" && transferencia && destinoTransferido && (
          <CierreTransferencia
            origen={transferencia.origen}
            destino={destinoTransferido}
            puedeCapturarResto={transferencia.modo !== "LOTE"}
            capturarRestoOrigen={acciones.capturarRestoOrigen}
            medirTanque={acciones.medirTanque}
            onCerrar={() => setTransferencia(null)}
          />
        )}

        {modo === "status" && (
          <ConfirmarEstadoTanque
            tanque={tanque}
            sabores={sabores}
            momento="INICIO"
            onConfirmar={() => acciones.confirmarEstado(tanque.numeroTanque, "INICIO")}
            onGuardarEdicion={(datos) => acciones.cambiarCondicion({ ...datos, momento: "INICIO" })}
            calidadLibera={calidadLibera}
          />
        )}

        {!editando ? (
          <Button variant="ghost" size="sm" className="self-start text-muted-foreground" onClick={() => setEditando(true)}>
            <PenLine className="size-3.5" />
            Editar
          </Button>
        ) : (
          <TanqueEditForm
            tanque={tanque}
            sabores={sabores}
            sinVolumen
            calidadLibera={calidadLibera}
            onGuardar={async (datos) => {
              const resultado = await acciones.cambiarCondicion(datos)
              if (resultado.ok) setEditando(false)
              return resultado
            }}
            onCancelar={() => setEditando(false)}
          />
        )}
      </CardContent>
    </Card>
  )
}

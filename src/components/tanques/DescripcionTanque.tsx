import { unidadPreparacion } from "@/lib/sabores"
import { horaCortaPlanta } from "@/lib/tiempoPlanta"
import type { PreparacionRegistro, TanqueRecepcion } from "@/lib/preparacion/tipos"
import { textoUltimoLote } from "./estadoTanque"

/** Qué tiene el tanque, en una línea, según su condición. */
export function DescripcionTanque({ tanque, loteAbierto }: { tanque: TanqueRecepcion; loteAbierto: PreparacionRegistro | null }) {
  const lote = tanque.lote ? ` · Lote ${tanque.lote}` : ""
  switch (tanque.condicion) {
    case "LISTO":
      return (
        <p className="text-sm break-words text-muted-foreground">
          {tanque.saborNombre ?? "Sin sabor"}
          {lote}
        </p>
      )
    case "STANDBY":
      return (
        <p className="text-sm break-words text-muted-foreground">
          Resto de {tanque.saborNombre ?? "sabor sin datos"}
          {lote} — ninguna línea lo toma. Si quedó producto: Medir, Transferir, Desvasar o preparar encima (se suma al lote
          nuevo). Si quedó vacío: Iniciar CIP.
        </p>
      )
    case "EN_PREPARACION":
      return (
        <p className="text-sm break-words text-muted-foreground">
          {loteAbierto
            ? `${loteAbierto.saborNombre ?? "Sin sabor"}${loteAbierto.lote ? ` · Lote ${loteAbierto.lote}` : ""} · ${loteAbierto.tambores} ${unidadPreparacion(loteAbierto.saborNombre)}${loteAbierto.volumenActualL ? ` · ${loteAbierto.volumenActualL} L` : ""}`
            : "Sin datos de la preparación."}
        </p>
      )
    case "SUCIO":
      return (
        <p className="text-sm break-words text-muted-foreground">
          {tanque.ultimoSaborNombre
            ? `Último: ${tanque.ultimoSaborNombre}${tanque.ultimoLote ? textoUltimoLote(tanque.ultimoLote) : ""}`
            : "Sin datos del sabor anterior."}
        </p>
      )
    case "LIMPIO":
      return <p className="text-sm text-muted-foreground">Disponible para preparación.</p>
    case "CIP":
      return (
        <p className="text-sm text-muted-foreground">
          Proceso de limpieza
          {tanque.cipIniciadoEn ? ` desde las ${horaCortaPlanta(tanque.cipIniciadoEn, tanque.cipIniciadoEn)}` : ""}.
        </p>
      )
  }
}

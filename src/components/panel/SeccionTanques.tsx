import { Link } from "react-router-dom"
import { Container } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { TanqueVisual } from "@/components/TanqueVisual"
import { TANK_CAPACITY } from "@/components/tanques/constantes"
import { colorSabor } from "@/lib/coloresSabor"
import type { LecturaServiciosIndustriales } from "@/lib/panelProduccion"
import type { PreparacionRegistro, TanqueRecepcion } from "@/lib/preparacion/tipos"
import { horaCortaPlanta } from "@/lib/tiempoPlanta"
import { cn } from "@/lib/utils"
import { PanelCard } from "./PanelCard"
import { ServiciosIndustrialesFranja } from "./ServiciosIndustrialesFranja"

/** Tarjeta "Tanques": Servicios Industriales arriba y los 3 tanques. Para el supervisor, cada tanque lleva a Preparación. */
export function SeccionTanques({
  tanques,
  preparaciones,
  servIndustriales,
  ahora,
  conLinks,
}: {
  tanques: TanqueRecepcion[]
  preparaciones: PreparacionRegistro[]
  servIndustriales: LecturaServiciosIndustriales | null
  ahora: Date
  conLinks: boolean
}) {
  const listos = tanques.filter((t) => t.condicion === "LISTO").length
  return (
    <PanelCard icon={Container} titulo="Tanques" meta={`${listos}/${tanques.length} listos`}>
      <ServiciosIndustrialesFranja lectura={servIndustriales} ahora={ahora} />
      <div className="grid grid-cols-3 gap-3">
        {tanques.map((t) =>
          conLinks ? (
            <Link
              key={t.numeroTanque}
              to="/preparacion"
              className="block min-w-0 rounded-xl outline-none transition-transform hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-ring"
              title="Ir a Preparación"
            >
              <TanquePanel tanque={t} preparaciones={preparaciones} />
            </Link>
          ) : (
            <TanquePanel key={t.numeroTanque} tanque={t} preparaciones={preparaciones} />
          ),
        )}
      </div>
    </PanelCard>
  )
}

/** Un tanque del Panel: dibujo + volumen, sabor y lote (o en qué está). Solo lectura. */
function TanquePanel({ tanque, preparaciones }: { tanque: TanqueRecepcion; preparaciones: PreparacionRegistro[] }) {
  const ultimaPrep = preparaciones
    .filter((p) => p.numeroTanque === tanque.numeroTanque)
    .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))[0]

  const enPreparacion = tanque.condicion === "EN_PREPARACION"
  const listo = tanque.condicion === "LISTO"
  const standby = tanque.condicion === "STANDBY"
  const tieneLiquido = listo || standby
  const color = colorSabor(
    tanque.condicion === "SUCIO"
      ? tanque.ultimoSaborNombre
      : enPreparacion
        ? (ultimaPrep?.saborNombre ?? null)
        : tieneLiquido
          ? tanque.saborNombre
          : null,
  )

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col overflow-hidden rounded-xl border bg-background/60 transition-shadow duration-300",
        listo ? "border-border hover:shadow-panel" : standby ? "border-secondary/50" : enPreparacion ? "border-warning/40" : "border-border",
      )}
    >
      <TanqueVisual
        numeroTanque={tanque.numeroTanque}
        condicion={tanque.condicion}
        volumenL={tanque.volumenL}
        volumenInicialL={tanque.volumenInicialL}
        color={color}
        capacidad={TANK_CAPACITY}
      />

      {/* Pie del tanque */}
      <div className="flex min-w-0 flex-col gap-1 border-t border-border/70 px-2.5 py-2">
        {tieneLiquido ? (
          <>
            <p className="num truncate text-base font-bold leading-none">
              {(tanque.volumenL ?? 0).toLocaleString("es-CO")}
              <span className="text-[11px] font-medium text-muted-foreground"> L</span>
            </p>
            {(tanque.volumenL ?? 0) > TANK_CAPACITY && (
              <span className="w-fit max-w-full truncate rounded-md bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-warning">
                En espera de corte
              </span>
            )}
            <span
              className="w-fit max-w-full truncate rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-background"
              style={{ backgroundColor: color }}
            >
              {tanque.saborNombre ?? "Sabor"}
            </span>
            {tanque.lote && (
              <p className="truncate text-[10px] text-muted-foreground">
                {standby ? "Resto del lote " : "Lote "}
                {tanque.lote}
              </p>
            )}
          </>
        ) : enPreparacion ? (
          <>
            <Badge variant="warning" className="w-fit">
              En Preparación
            </Badge>
            <p className="truncate text-[10px] text-muted-foreground">
              {ultimaPrep
                ? `${ultimaPrep.tambores}t · ${ultimaPrep.saborNombre ?? "Sin sabor"}${tanque.lote ? ` · Lote ${tanque.lote}` : ""}`
                : "Sin registrar aún."}
            </p>
          </>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            {tanque.condicion === "SUCIO"
              ? "Pendiente de limpieza."
              : tanque.condicion === "CIP"
                ? `Proceso de limpieza${tanque.cipIniciadoEn ? ` desde las ${horaCortaPlanta(tanque.cipIniciadoEn, tanque.cipIniciadoEn)}` : ""}.`
                : "Disponible para llenar."}
          </p>
        )}
      </div>
    </div>
  )
}

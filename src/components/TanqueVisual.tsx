import { Clock3, Droplets, Sparkle } from "lucide-react"
import type { CondicionTanque } from "@/lib/preparacion/tipos"
import { cn } from "@/lib/utils"

/** Posiciones fijas de las gotas/pegostes de Sucio — variadas para que no se vean en fila prolija, pero estables (no cambian en cada render). */
const GOTAS_SUCIO = [
  { left: "18%", bottom: "6%", size: 10 },
  { left: "62%", bottom: "14%", size: 7 },
  { left: "40%", bottom: "3%", size: 13 },
  { left: "80%", bottom: "8%", size: 6 },
  { left: "8%", bottom: "22%", size: 5 },
  { left: "55%", bottom: "30%", size: 6 },
]

/** Burbujas de espuma del CIP — posiciones fijas, mismo criterio que GOTAS_SUCIO. */
const BURBUJAS_CIP = [
  { left: "12%", bottom: "20%", size: 7 },
  { left: "30%", bottom: "45%", size: 5 },
  { left: "52%", bottom: "25%", size: 9 },
  { left: "70%", bottom: "50%", size: 5 },
  { left: "86%", bottom: "22%", size: 7 },
]

/** Brillitos de Limpio — mismo criterio de posiciones fijas que GOTAS_SUCIO. */
const BRILLITOS_LIMPIO = [
  { left: "22%", bottom: "58%", size: 9 },
  { left: "68%", bottom: "68%", size: 6 },
  { left: "45%", bottom: "35%", size: 7 },
  { left: "78%", bottom: "40%", size: 5 },
]

/**
 * "Vidrio" del tanque: líquido con olas/burbujas + marcas de nivel +
 * reflejo — nació en el Panel de Producción (src/pages/apps/PanelProduccion.tsx)
 * y se comparte acá para poder usarse también en Status/Preparación
 * (src/components/EstadoPlantaTabs.tsx), con `square` para el tamaño
 * compacto que necesita esa grilla de 3 columnas. Las animaciones
 * (liquid-wave, liquid-bubble, tank-glass, alert-pulse) son clases
 * CSS globales — ver el final de src/index.css.
 *
 * LLENADO (sensor / PLC): si se pasa `llenado`, encima del dibujo normal
 * aparece una animación secundaria — el chorro que entra por arriba,
 * una capa más clara que sube con los litros que van entrando, y una
 * barrita a la derecha con el avance hacia el setpoint. Los datos son los
 * mismos que manda el plc-bridge (litros_actuales, setpoint_l,
 * caudal_l_min — ver src/pages/apps/PreparacionPLC.tsx). Si no se pasa,
 * el tanque se ve exactamente igual que antes.
 */

/** Lo que manda el sensor mientras el tanque se está llenando. */
export interface LlenadoTanque {
  /** Litros que ya entraron en este llenado. */
  litros: number
  /** Litros a los que tiene que llegar (setpoint del PLC), si se sabe. */
  setpointL?: number | null
  /** Caudal en litros por minuto, si se sabe. */
  caudalLMin?: number | null
}
export function TanqueVisual({
  numeroTanque,
  condicion,
  volumenL,
  volumenInicialL = null,
  color,
  capacidad = 20000,
  square = false,
  llenado = null,
}: {
  numeroTanque: number
  condicion: CondicionTanque
  volumenL: number | null
  /** Volumen con el que arrancó el lote actual — si se pasa, el % de TEXTO muestra cuánto queda DEL LOTE en vez de la capacidad del tanque (el líquido dibujado sigue siendo siempre respecto a la capacidad, es el nivel físico real). */
  volumenInicialL?: number | null
  color: string
  capacidad?: number
  square?: boolean
  /** Datos del sensor mientras se llena — activa la animación de llenado. null = no se está llenando. */
  llenado?: LlenadoTanque | null
}) {
  const tieneLiquido = condicion === "LISTO" || condicion === "STANDBY"
  const pct = tieneLiquido ? Math.min(100, ((volumenL ?? 0) / capacidad) * 100) : 0
  const pctTexto =
    tieneLiquido && volumenInicialL && volumenInicialL > 0 ? Math.min(100, ((volumenL ?? 0) / volumenInicialL) * 100) : pct

  // ---- Llenado en curso (sensor) ----
  const llenando = llenado != null
  const litrosEntrando = Math.max(0, llenado?.litros ?? 0)
  // Nivel total = lo que ya había + lo que va entrando (nunca más que el tanque)
  const pctTotal = llenando ? Math.min(100, pct + (litrosEntrando / capacidad) * 100) : pct
  // Avance hacia el setpoint (0 a 100), para la barrita de la derecha
  const setpoint = llenado?.setpointL ?? null
  const pctSetpoint = setpoint && setpoint > 0 ? Math.min(100, (litrosEntrando / setpoint) * 100) : null

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden bg-muted",
        square ? "size-32 rounded-xl border border-border" : "h-44 w-full",
      )}
    >
      {/* Capa de lo que va ENTRANDO (llenado): más clara, con rayitas que suben.
          Va debajo del líquido normal, que tapa la parte que ya había. */}
      {llenando && (
        <div
          className="fill-rise absolute inset-x-0 bottom-0 transition-[height] duration-1000 ease-linear"
          style={{
            height: `${pctTotal}%`,
            backgroundColor: `color-mix(in oklab, ${color} 55%, white)`,
            backgroundImage: `repeating-linear-gradient(0deg, transparent 0 6px, color-mix(in oklab, ${color} 30%, white) 6px 8px)`,
          }}
        >
          <div
            className="liquid-wave absolute -top-1.5 h-3 w-[150%] rounded-[50%]"
            style={{ backgroundColor: `color-mix(in oklab, ${color} 55%, white)` }}
          />
          {/* Salpicadura donde cae el chorro */}
          <span
            className="fill-splash absolute -top-1 left-1/2 h-2 w-6 -translate-x-1/2 rounded-[50%] border"
            style={{ borderColor: color }}
          />
        </div>
      )}

      {/* Chorro que entra por arriba, desde la boquilla hasta la superficie */}
      {llenando && (
        <>
          <span className="absolute left-1/2 top-0 z-10 h-1.5 w-3 -translate-x-1/2 rounded-b-sm bg-foreground/40" />
          <span
            className="fill-stream absolute left-1/2 top-1.5 w-1 -translate-x-1/2 rounded-full transition-[bottom] duration-1000 ease-linear"
            style={{
              bottom: `${pctTotal}%`,
              backgroundImage: `repeating-linear-gradient(180deg, ${color} 0 6px, color-mix(in oklab, ${color} 45%, white) 6px 10px)`,
            }}
          />
        </>
      )}

      {tieneLiquido && (
        <div
          className="absolute inset-x-0 bottom-0 transition-[height] duration-1000 ease-out"
          style={{ height: `${pct}%`, backgroundColor: color, opacity: condicion === "STANDBY" ? 0.55 : 0.92 }}
        >
          <div className="liquid-wave absolute -top-1.5 h-3 w-[150%] rounded-[50%]" style={{ backgroundColor: color }} />
          <div
            className="liquid-wave-2 absolute -top-1 h-2.5 w-[170%] rounded-[50%]"
            style={{ backgroundColor: color, opacity: 0.55 }}
          />
          <span className="liquid-bubble absolute bottom-2 left-1/3 size-1 rounded-full bg-white/70" />
          <span
            className="liquid-bubble absolute bottom-3 left-2/3 size-1.5 rounded-full bg-white/60"
            style={{ animationDelay: "1.4s" }}
          />
        </div>
      )}

      {condicion === "EN_PREPARACION" && !llenando && (
        <div
          className="absolute inset-0 grid place-items-center"
          style={{ backgroundColor: `color-mix(in oklab, ${color} 22%, var(--muted))` }}
        >
          <div
            className={cn("mixing-vortex rounded-full border-2", square ? "size-10" : "size-14")}
            style={{
              borderColor: color,
              background: `conic-gradient(from 20deg, transparent 0 16%, ${color} 18% 31%, transparent 34% 52%, ${color} 55% 68%, transparent 72%)`,
            }}
          />
          <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full border border-warning/40 bg-background/85 text-warning">
            <Clock3 className="size-3" aria-hidden="true" />
          </span>
        </div>
      )}

      {condicion === "SUCIO" && (
        <>
          {GOTAS_SUCIO.map((g, i) => (
            <span
              key={i}
              className="absolute rounded-full"
              style={{ left: g.left, bottom: g.bottom, width: g.size, height: g.size, backgroundColor: color, opacity: 0.65 }}
            />
          ))}
          <span className="absolute inset-x-0 top-2 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Sucio
          </span>
        </>
      )}

      {condicion === "LIMPIO" && (
        <div className="absolute inset-0 grid place-items-center">
          {BRILLITOS_LIMPIO.map((b, i) => (
            <Sparkle
              key={i}
              className="liquid-bubble absolute fill-current text-warning/70"
              style={{ left: b.left, bottom: b.bottom, width: b.size, height: b.size, animationDelay: `${i * 0.4}s` }}
              aria-hidden="true"
            />
          ))}
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Limpio</span>
        </div>
      )}

      {condicion === "CIP" && (
        <div
          className="absolute inset-0"
          style={{ backgroundColor: `color-mix(in oklab, var(--info) 14%, var(--muted))` }}
        >
          {/* Agua de lavado bajando por las paredes */}
          {["left-1", "right-1"].map((lado) => (
            <span
              key={lado}
              className={cn("fill-stream absolute bottom-0 top-3 w-1 opacity-70", lado)}
              style={{ backgroundImage: "repeating-linear-gradient(180deg, var(--info) 0 4px, transparent 4px 10px)" }}
            />
          ))}

          {/* Bola de spray arriba, girando y tirando chorritos */}
          <div className="absolute left-1/2 top-3 -translate-x-1/2">
            <div className="cip-spin relative size-3.5 rounded-full border border-foreground/30 bg-background">
              {[0, 45, 90, 135, 180, 225, 270, 315].map((angulo) => (
                <span
                  key={angulo}
                  className="absolute left-1/2 top-1/2 h-0.5 w-3 origin-left rounded-full bg-info/70"
                  style={{ transform: `rotate(${angulo}deg) translateX(9px)` }}
                />
              ))}
            </div>
          </div>

          {/* Espuma en el fondo, con burbujas que suben */}
          <div className="absolute inset-x-0 bottom-0 h-[22%] bg-info/25">
            <div className="liquid-wave absolute -top-1.5 h-3 w-[150%] rounded-[50%] bg-info/25" />
            {BURBUJAS_CIP.map((b, i) => (
              <span
                key={i}
                className="liquid-bubble absolute rounded-full border border-info/40 bg-white/90"
                style={{ left: b.left, bottom: b.bottom, width: b.size, height: b.size, animationDelay: `${i * 0.5}s` }}
              />
            ))}
          </div>

          <span className="absolute inset-x-0 top-9 text-center text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            CIP · lavando
          </span>
        </div>
      )}

      {/* Marcas de nivel + reflejo */}
      {[25, 50, 75].map((m) => (
        <div
          key={m}
          className="pointer-events-none absolute inset-x-0 border-t border-dashed border-border/70"
          style={{ bottom: `${m}%` }}
        />
      ))}
      <div className="tank-glass pointer-events-none absolute inset-0" />

      <span className="absolute left-2 top-2 rounded-md border border-border bg-background/80 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-foreground">
        T{numeroTanque}
      </span>

      {tieneLiquido && !llenando && (
        <span className="num absolute inset-x-0 bottom-1.5 text-center text-sm font-bold text-foreground drop-shadow">
          {pctTexto.toFixed(0)}%
        </span>
      )}

      {llenando && (
        <>
          {/* Aviso "Llenando" arriba a la derecha */}
          <span className="absolute right-1.5 top-1.5 z-20 flex items-center gap-1 rounded-md border border-info/40 bg-background/85 px-1.5 py-0.5 text-[10px] font-bold text-info">
            <Droplets className="alert-pulse size-3" aria-hidden="true" />
            {pctSetpoint != null ? `${pctSetpoint.toFixed(0)}%` : "Llenando"}
          </span>

          {/* Barrita del sensor: avance hacia el setpoint */}
          {pctSetpoint != null && (
            <div className="absolute bottom-2 right-1.5 top-8 z-10 w-1.5 overflow-hidden rounded-full bg-background/70">
              <div
                className="fill-rise absolute inset-x-0 bottom-0 rounded-full bg-info transition-[height] duration-1000 ease-linear"
                style={{ height: `${pctSetpoint}%` }}
              />
            </div>
          )}

          {/* Litros que van entrando (y caudal, en el tamaño grande) */}
          <span className="num absolute bottom-1.5 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-md bg-background/80 px-1.5 py-0.5 text-center text-xs font-bold text-foreground">
            +{Math.round(litrosEntrando).toLocaleString("es-CO")}
            {setpoint ? ` / ${Math.round(setpoint).toLocaleString("es-CO")}` : ""} L
            {!square && llenado?.caudalLMin != null && (
              <span className="font-medium text-muted-foreground"> · {llenado.caudalLMin.toFixed(0)} L/min</span>
            )}
          </span>
        </>
      )}
    </div>
  )
}

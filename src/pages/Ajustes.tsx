import type { ReactNode } from "react"
import { Check, Monitor, Moon, Sun } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { ESCALA_LETRA, NOMBRE_TAMANO_LETRA, useTamanoLetra, type TamanoLetra } from "@/lib/tamanoLetra"
import { useTema, type Tema } from "@/lib/tema"

/*
 * Ajustes de este dispositivo (se guardan en el navegador, no en la cuenta):
 * tamaño de letra y tema. Se aplican al instante en toda la app. Se llega
 * tocando las iniciales del encabezado.
 */
export default function Ajustes() {
  const { tamano, elegir: elegirTamano } = useTamanoLetra()
  const { tema, elegir: elegirTema } = useTema()

  return (
    <AppShell title="Ajustes" description="Cómo se ve la app en este dispositivo">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <Seccion titulo="Tamaño de letra" ayuda="Agranda el texto y los espacios en todas las pantallas, como el zoom del navegador.">
          {(Object.keys(ESCALA_LETRA) as TamanoLetra[]).map((t) => (
            <Opcion key={t} grupo="tamano-letra" elegida={tamano === t} onElegir={() => elegirTamano(t)} nombre={NOMBRE_TAMANO_LETRA[t]}>
              {/* "Aa" en la proporción de cada tamaño, para comparar sin elegir. */}
              <span aria-hidden className="font-semibold leading-none" style={{ fontSize: `calc(1.5rem * ${parseFloat(ESCALA_LETRA[t]) / 100} / ${parseFloat(ESCALA_LETRA[tamano]) / 100})` }}>
                Aa
              </span>
            </Opcion>
          ))}
        </Seccion>

        <Seccion titulo="Tema" ayuda="«Según el equipo» sigue el modo claro u oscuro del teléfono o la computadora.">
          {(
            [
              ["claro", "Claro", Sun],
              ["oscuro", "Oscuro", Moon],
              ["sistema", "Según el equipo", Monitor],
            ] as [Tema, string, typeof Sun][]
          ).map(([t, nombre, Icono]) => (
            <Opcion key={t} grupo="tema" elegida={tema === t} onElegir={() => elegirTema(t)} nombre={nombre}>
              <Icono aria-hidden className="size-6" />
            </Opcion>
          ))}
        </Seccion>
      </div>
    </AppShell>
  )
}

function Seccion({ titulo, ayuda, children }: { titulo: string; ayuda: string; children: ReactNode }) {
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
      <legend className="mb-1 p-0">
        <span className="block text-base font-semibold text-foreground">{titulo}</span>
        <span className="mt-0.5 block text-sm text-muted-foreground">{ayuda}</span>
      </legend>
      <div className="grid grid-cols-3 gap-2 sm:gap-3">{children}</div>
    </fieldset>
  )
}

/** Una opción: radio nativo (flechas y Tab funcionan solos) con forma de tarjeta tocable. */
function Opcion({ grupo, nombre, elegida, onElegir, children }: { grupo: string; nombre: string; elegida: boolean; onElegir: () => void; children: ReactNode }) {
  return (
    <label className="relative block cursor-pointer">
      <input type="radio" name={grupo} checked={elegida} onChange={onElegir} className="peer sr-only" />
      <span className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-lg bg-card px-2 py-4 text-center text-sm sm:px-4 font-medium text-card-foreground ring-1 ring-foreground/10 transition-shadow hover:ring-foreground/25 peer-checked:ring-2 peer-checked:ring-primary peer-checked:hover:ring-primary peer-focus-visible:ring-3 peer-focus-visible:ring-ring">
        {children}
        {nombre}
      </span>
      {elegida && <Check aria-hidden className="absolute top-2.5 right-2.5 size-4 text-primary" />}
    </label>
  )
}

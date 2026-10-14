import { useEffect, useMemo, useState } from "react"
import { Loader2 } from "lucide-react"
import { AppShell } from "@/components/AppShell"
import { MensajeError } from "@/components/MensajeError"
import { BarraIndicadores } from "@/components/indicadores/BarraIndicadores"
import { useFlechas, type Seccion } from "@/components/indicadores/secciones"
import { EditorManual } from "@/components/indicadores/editor/EditorManual"
import { Observacion } from "@/components/indicadores/Observacion"
import { useIndicadores } from "@/components/indicadores/useIndicadores"
import { VistaLinea } from "@/components/indicadores/VistaLinea"
import { VistaSemielaborado, type VistaSemi } from "@/components/indicadores/VistaSemielaborado"
import { useAuth } from "@/lib/auth"
import { useCatalogosLive } from "@/lib/catalogosLive"
import { capital, nombreMes, presentacionesDeLinea, sumarMeses } from "@/lib/indicadores/calculos"
import { guardarMes, guardarObservacion } from "@/lib/indicadores/datos"
import { mesVacio, type DatosMes, type ModoMes } from "@/lib/indicadores/tipos"
import { esSoloLectura } from "@/lib/rolVista"
import { listarSabores, type Sabor } from "@/lib/sabores"
import { franjaDeHora } from "@/lib/tiempoPlanta"
import { useAccion } from "@/lib/useAccion"

/*
 * Indicadores (prototipo aprobado 2026-10-14): una pantalla, sin scroll en
 * PC. Por línea (eficiencia, paradas y una columna por presentación) o
 * semielaborado; cada mes AUTOMÁTICO (solo jornadas validadas) o MANUAL. Cuentas en
 * src/lib/indicadores/, piezas en src/components/indicadores/.
 */
export default function Indicadores() {
  const { session } = useAuth()
  const { lineas, presentaciones, velocidades, cargando: cargandoCatalogos } = useCatalogosLive()
  const area = session?.area === "PRUEBAS" ? "PRUEBAS" : "ASEPTICO"
  const usuario = session?.username ?? ""
  const puedeEditar = !esSoloLectura(session)
  // El modo del mes y la carga a mano: solo la analista y la dueña. El superadmin (Jorge) expone
  // los Indicadores y no debe ver nada del modo manual (dueña, 2026-10-14). La base lo exige igual.
  const puedeCargar = puedeEditar && (session?.rol === "ANALISTA" || session?.esDueno === true)
  const mesActual = `${franjaDeHora().fecha.slice(0, 7)}-01`
  // Por defecto, el último mes cerrado.
  const [mes, setMes] = useState(() => sumarMeses(mesActual, -1))
  const [seccion, setSeccion] = useState<Seccion>("1")
  const [vistaSemi, setVistaSemi] = useState<VistaSemi>("graficas")
  const [editando, setEditando] = useState(false)
  const [sabores, setSabores] = useState<Sabor[] | null>(null)
  const accionModo = useAccion()
  // ← → cambian de pantalla, para exponer.
  useFlechas(seccion, setSeccion, !editando)

  useEffect(() => {
    listarSabores().then(setSabores)
  }, [])

  const cat = useMemo(
    () =>
      cargandoCatalogos || !sabores
        ? null
        : { lineas: lineas.map((l) => l.codigo), presentaciones, velocidades, familiaDeSabor: new Map(sabores.map((s) => [s.id, s.familiaNombre])) },
    [cargandoCatalogos, sabores, lineas, presentaciones, velocidades],
  )
  const ind = useIndicadores(usuario, area, mes, cat)
  const elegido = ind.meses[ind.meses.length - 1]
  const calculando = ind.cargando || (elegido.modo === "AUTO" && !elegido.datos && !elegido.error)
  const d = elegido.datos
  const sinValidadas = elegido.modo === "AUTO" && !!d && [d.eficiencia, d.presentaciones, d.semielaborado].every((x) => Object.keys(x).length === 0)
  const opcionesMes = Array.from({ length: 12 }, (_, i) => sumarMeses(mesActual, -i))
  const familias = [...new Set([...(sabores ?? []).filter((s) => s.activo).map((s) => s.familiaNombre), ...Object.keys(elegido.datos?.semielaborado ?? {})])]
  const claves = ind.meses.flatMap((m) => Object.keys(m.datos?.presentaciones ?? {}))

  async function cambiarModo(modo: ModoMes) {
    let datos: DatosMes | null = null
    // La primera vez que un mes pasa a manual, arranca con lo que calculó la app.
    if (modo === "MANUAL" && !ind.manualDelMes) {
      const auto = await ind.obtenerAuto(mes)
      datos = "error" in auto ? mesVacio() : auto
    }
    if (await accionModo.ejecutar(() => guardarMes(usuario, area, mes, modo, datos))) ind.recargar()
  }

  async function guardarObs(clave: string, texto: string) {
    const r = await guardarObservacion(usuario, area, mes, clave, texto)
    if (r.ok) ind.recargar()
    return r
  }

  const observacion = (clave: string) => (
    <Observacion
      texto={ind.observaciones[clave]}
      nombreMes={nombreMes(mes)}
      placeholder="Qué pasó en el mes con este producto"
      puedeEditar={puedeEditar}
      onGuardar={(texto) => guardarObs(clave, texto)}
    />
  )

  return (
    <AppShell title="Indicadores" description="Por línea y presentación" fullWidth ocultarEstadoBanner sinMenuLateral>
      {/* En PC entra todo en una pantalla, sin scroll (dueña, 2026-10-13): alto de la ventana menos el encabezado. */}
      <div className="flex flex-col gap-2.5 lg:h-[calc(100svh-7.25rem)]">
        <BarraIndicadores
          seccion={seccion}
          onSeccion={setSeccion}
          mes={mes}
          opcionesMes={opcionesMes}
          onMes={setMes}
          modo={elegido.modo}
          onModo={cambiarModo}
          onCargar={() => setEditando(true)}
          puedeEditar={puedeCargar}
          cambiandoModo={accionModo.enviando}
        />
        <MensajeError error={ind.error ?? elegido.error ?? accionModo.error} />
        {calculando ? (
          <p className="m-auto flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Calculando {nombreMes(mes)} con las jornadas validadas…
          </p>
        ) : sinValidadas ? (
          <p className="m-auto max-w-md text-center text-sm text-muted-foreground">
            {/* Quien no carga datos no ve nada del modo manual (se expone en reuniones, dueña 2026-10-14). */}
            {puedeCargar
              ? `${capital(nombreMes(mes))} no tiene jornadas validadas todavía. El modo automático cuenta solo lo validado en Validar jornada; mientras tanto, se puede pasar el mes a MANUAL.`
              : `${capital(nombreMes(mes))} todavía no tiene datos.`}
          </p>
        ) : seccion === "semi" ? (
          <VistaSemielaborado meses={ind.meses} vista={vistaSemi} onVista={setVistaSemi} renderObservacion={observacion} />
        ) : (
          <VistaLinea
            linea={seccion}
            meses={ind.meses}
            velocidades={velocidades}
            observaciones={ind.observaciones}
            puedeEditar={puedeEditar}
            onGuardarObservacion={guardarObs}
          />
        )}
      </div>
      {editando && (
        <EditorManual
          mes={mes}
          inicial={ind.manualDelMes ?? elegido.datos ?? mesVacio()}
          seccionInicial={seccion}
          presentacionesDe={(l) => presentacionesDeLinea(l, velocidades, claves)}
          familias={familias}
          obtenerAuto={() => ind.obtenerAuto(mes)}
          onGuardar={async (datos) => {
            const r = await guardarMes(usuario, area, mes, "MANUAL", datos)
            if (r.ok) ind.recargar()
            return r
          }}
          onCerrar={() => setEditando(false)}
        />
      )}
    </AppShell>
  )
}

import { useCallback, useEffect, useState } from "react"
import { cargarMesAutomatico, type CatalogosIndicadores } from "@/lib/indicadores/automatico"
import { finDeMes, mesesVentana } from "@/lib/indicadores/calculos"
import { cargarRegistros } from "@/lib/indicadores/datos"
import { mesVacio, type DatosMes, type ModoMes, type RegistroMes } from "@/lib/indicadores/tipos"

/*
 * Los 3 meses de la ventana (el elegido y los 2 anteriores), cada uno con
 * su modo: MANUAL lee lo guardado; AUTO lo calcula con las jornadas validadas del mes.
 * Lo automático se guarda en memoria mientras la app está abierta: un mes
 * se calcula una sola vez.
 */

export interface MesIndicadores {
  mes: string
  modo: ModoMes
  /** null = todavía calculando. */
  datos: DatosMes | null
  error: string | null
}

type Auto = DatosMes | { error: string }
const cacheAuto = new Map<string, Promise<Auto>>()

export function useIndicadores(usuario: string, area: string, mes: string, cat: CatalogosIndicadores | null) {
  const [registros, setRegistros] = useState<{ mes: string; filas: RegistroMes[] } | null>(null)
  const [errorRegistros, setErrorRegistros] = useState<string | null>(null)
  const [autos, setAutos] = useState<Record<string, Auto>>({})
  const [version, setVersion] = useState(0)
  const ventana = mesesVentana(mes)

  useEffect(() => {
    if (!usuario) return
    let vivo = true
    cargarRegistros(usuario, area, ventana[0], finDeMes(mes)).then((r) => {
      if (!vivo) return
      setErrorRegistros("error" in r ? r.error : null)
      setRegistros({ mes, filas: "error" in r ? [] : r })
    })
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario, area, mes, version])

  /** Lo automático de un mes (también para "Traer lo automático" del editor). */
  const obtenerAuto = useCallback(
    (m: string): Promise<Auto> => {
      if (!cat) return Promise.resolve({ error: "Cargando catálogos…" })
      const clave = `${area}|${m}`
      if (!cacheAuto.has(clave)) {
        // Si falla, no queda guardado: la próxima vez se vuelve a intentar.
        const p = cargarMesAutomatico(usuario, area, m, cat).then((r) => {
          if ("error" in r) cacheAuto.delete(clave)
          return r
        })
        cacheAuto.set(clave, p)
      }
      return cacheAuto.get(clave)!
    },
    [usuario, area, cat],
  )

  const vigentes = registros?.mes === mes ? registros.filas : null
  const registroDe = (m: string) => vigentes?.find((r) => r.mes === m) ?? null
  const modoDe = (m: string): ModoMes => registroDe(m)?.modo ?? "AUTO"

  useEffect(() => {
    if (!vigentes || !cat) return
    let vivo = true
    for (const m of mesesVentana(mes)) {
      if ((vigentes.find((r) => r.mes === m)?.modo ?? "AUTO") !== "AUTO") continue
      obtenerAuto(m).then((d) => vivo && setAutos((a) => (a[m] === d ? a : { ...a, [m]: d })))
    }
    return () => {
      vivo = false
    }
  }, [vigentes, cat, mes, obtenerAuto])

  const meses: MesIndicadores[] = ventana.map((m) => {
    if (modoDe(m) === "MANUAL") return { mes: m, modo: "MANUAL", datos: registroDe(m)?.datos ?? mesVacio(), error: null }
    const a = autos[m]
    return { mes: m, modo: "AUTO", datos: a && !("error" in a) ? a : null, error: a && "error" in a ? a.error : null }
  })

  return {
    meses,
    cargando: vigentes === null,
    error: errorRegistros,
    observaciones: registroDe(mes)?.observaciones ?? {},
    /** Lo guardado a mano de cada mes de la ventana. Ausentismo e incidencias salen siempre de acá, aunque el mes sea automático. */
    aMano: ventana.map((m) => ({ mes: m, datos: registroDe(m)?.datos ?? null })),
    /** Lo cargado a mano del mes elegido (aunque esté en AUTO), para el editor. */
    manualDelMes: registroDe(mes)?.datos ?? null,
    obtenerAuto,
    recargar: () => setVersion((v) => v + 1),
  }
}

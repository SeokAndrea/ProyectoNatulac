import { useCallback, useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { AppShell } from "@/components/AppShell"
import { AjustesDuena } from "@/components/edicion-datos/AjustesDuena"
import { MenuSecciones, type ItemMenuSeccion } from "@/components/edicion-datos/MenuSecciones"
import { SeccionCatalogo } from "@/components/edicion-datos/SeccionCatalogo"
import { GRUPOS_MENU, SECCIONES_CATALOGO, contarActivos, seccionPorId } from "@/components/edicion-datos/secciones"
import type { OpcionesExternas } from "@/components/edicion-datos/tabla"
import { useAuth } from "@/lib/auth"
import { useCatalogosLive } from "@/lib/catalogosLive"
import { listarCatalogo, type CatalogoId, type FilaCatalogo } from "@/lib/edicionDatos"
import { listarFamilias, type Familia } from "@/lib/sabores"

/*
 * Edición de Datos (rework 2026-10-21, para la Analista en PC): pantalla
 * completa, secciones a la izquierda, tabla al centro y panel de edición a
 * la derecha. Todo pasa por listar/guardar/cambiar_activo_catalogo
 * (permiso EDICION_DATOS, con autor en Auditoría). La sección se recuerda en
 * la URL (?s=velocidades). Personal tiene su propia pantalla.
 */
const AJUSTES = "ajustes"

export default function EdicionDatos() {
  const { session } = useAuth()
  const { lineas: lineasDelArea, recargar: recargarCatalogosApp } = useCatalogosLive()
  const usuario = session?.username ?? ""
  const [params, setParams] = useSearchParams()
  const actual = params.get("s") ?? "sabores"

  const [filas, setFilas] = useState<Partial<Record<CatalogoId, FilaCatalogo[]>>>({})
  const [errores, setErrores] = useState<Partial<Record<CatalogoId, string>>>({})
  const [familias, setFamilias] = useState<Familia[]>([])

  const cargar = useCallback(
    async (id: CatalogoId) => {
      const r = await listarCatalogo(usuario, id)
      setFilas((f) => ({ ...f, [id]: r.ok ? r.valor : (f[id] ?? []) }))
      setErrores((e) => ({ ...e, [id]: r.ok ? undefined : r.error }))
    },
    [usuario],
  )

  useEffect(() => {
    if (!usuario) return
    for (const s of SECCIONES_CATALOGO) cargar(s.id)
    listarFamilias().then(setFamilias)
  }, [usuario, cargar])

  // Solo las líneas del área de la sesión (y sus velocidades): las de Pruebas solo las ve Pruebas.
  // Mismo criterio que el resto de la app (`lineas` de catalogosLive.tsx, que trae también las inactivas).
  const filasVisibles = useMemo(() => {
    const delArea = new Set(lineasDelArea.map((l) => l.id))
    return {
      ...filas,
      lineas: filas.lineas?.filter((l) => delArea.has(l.id)),
      velocidades: filas.velocidades?.filter((v) => delArea.has(String(v.linea_id))),
    }
  }, [filas, lineasDelArea])

  // Opciones que salen de otros catálogos (familia de un sabor, línea y presentación de una velocidad).
  const externas = useMemo<OpcionesExternas>(
    () => ({
      familias: familias.map((f, i) => ({ valor: f.id, etiqueta: f.nombre, orden: i })),
      lineas: (filasVisibles.lineas ?? []).map((l, i) => ({ valor: l.id, etiqueta: String(l.nombre), orden: i })),
      presentaciones: [...(filas.presentaciones ?? [])]
        .sort((a, b) => Number(b.volumen_ml) - Number(a.volumen_ml))
        .map((p) => ({ valor: p.id, etiqueta: `${p.volumen_ml} ml`, orden: Number(p.volumen_ml) })),
    }),
    [familias, filasVisibles.lineas, filas.presentaciones],
  )

  const grupos: { titulo: string; items: ItemMenuSeccion[] }[] = GRUPOS_MENU.map((g) => ({
    titulo: g.titulo,
    items: g.secciones.map((id) => ({ id, titulo: seccionPorId(id)!.titulo, cantidad: contarActivos(filasVisibles[id as CatalogoId]) })),
  }))
  if (session?.esDueno) grupos.push({ titulo: "Solo dueña", items: [{ id: AJUSTES, titulo: "Ajustes de planta" }] })

  const seccion = seccionPorId(actual) ?? (actual === AJUSTES && session?.esDueno ? null : SECCIONES_CATALOGO[0])

  async function recargar(id: CatalogoId) {
    await cargar(id)
    // Presentaciones, velocidades y líneas también las usa el resto de la app (Comenzar Turno, Líneas…).
    if (id === "presentaciones" || id === "velocidades" || id === "lineas") await recargarCatalogosApp()
  }

  return (
    <AppShell title="Edición de Datos" description="Catálogos de la planta" fullWidth>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <MenuSecciones grupos={grupos} actual={seccion?.id ?? AJUSTES} onElegir={(id) => setParams({ s: id }, { replace: true })} />
        <div className="min-w-0 flex-1">
          {seccion ? (
            <SeccionCatalogo
              key={seccion.id}
              seccion={seccion}
              filas={filasVisibles[seccion.id] ?? null}
              error={errores[seccion.id] ?? null}
              externas={externas}
              usuario={usuario}
              onRecargar={() => recargar(seccion.id)}
            />
          ) : (
            <AjustesDuena usuario={usuario} />
          )}
        </div>
      </div>
    </AppShell>
  )
}

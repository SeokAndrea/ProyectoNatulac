import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import type { AreaCodigo, CargoCodigo, RolCodigo } from "@/lib/catalogos"
import { cedulaValida, claveCumplePolitica } from "@/lib/credenciales"
import type { Permiso } from "@/lib/permisos"
import { supabase } from "@/lib/supabase"

/** Permisos efectivos (rol + extras). null = no se pudieron consultar (se conserva lo que había). */
async function cargarPermisos(usuario: string): Promise<Permiso[] | null> {
  const { data, error } = await supabase.rpc("permisos_de", { p_usuario: usuario })
  if (error || !Array.isArray(data)) return null
  return data as Permiso[]
}

interface PerfilActual {
  activo: boolean
  rol: RolCodigo
  area: AreaCodigo | null
  esDueno: boolean
  permisos: Permiso[]
  /** Rótulo del puesto (usuarios.cargo): solo visual, lo usa el inicio para ordenar las tarjetas. */
  cargo: CargoCodigo | null
}

/**
 * Rol, área, dueño y permisos ACTUALES (ver perfil_sesion, migración
 * 20261084): la sesión se guarda en el navegador desde el login, así que un
 * cambio de rol o una baja no se notaban hasta volver a entrar.
 * null = la persona ya no existe; undefined = no se pudo consultar.
 */
async function cargarPerfil(usuario: string): Promise<PerfilActual | null | undefined> {
  const { data, error } = await supabase.rpc("perfil_sesion", { p_usuario: usuario })
  if (error) return undefined
  if (!data) return null
  const f = data as { activo: boolean; rol: string; area: string | null; es_dueno: boolean; cargo?: string | null; permisos: string[] | null }
  return {
    activo: Boolean(f.activo),
    rol: f.rol as RolCodigo,
    area: f.area as AreaCodigo | null,
    esDueno: Boolean(f.es_dueno),
    permisos: (f.permisos ?? []) as Permiso[],
    cargo: (f.cargo ?? null) as CargoCodigo | null,
  }
}

export interface Session {
  username: string
  nombre: string
  cedula: string | null
  /** null = todas las áreas (solo aplica a SuperAdministrador). */
  area: AreaCodigo | null
  rol: RolCodigo
  /** Dueño: por encima de Super Administrador (intocable, gestiona Super Admins, ve Errores y ajustes). Flag aparte del rol, columna usuarios.ve_errores — ver migración 20261079090000_dueno.sql. */
  esDueno: boolean
  /** Permisos efectivos (rol + extras). Se refrescan al abrir la app. Ver src/lib/permisos.ts. */
  permisos: Permiso[]
  /**
   * true = la persona todavía no pasó el primer ingreso: tiene que
   * confirmar Nombre y Apellido + Cédula y definir una clave propia de
   * 4 dígitos (no 1234) antes de usar la app. También se prende si la
   * clave escrita no cumple la política. Ver App.tsx y PrimerIngreso.tsx.
   */
  debeCompletarPerfil: boolean
  /** Rótulo del puesto (Supervisor, Jefe de Producción…). Solo visual: no da permisos. Llega con perfil_sesion al abrir la app. */
  cargo?: CargoCodigo | null
}

export interface DatosPrimerIngreso {
  passwordNueva: string
  nombre: string
  cedula: string
}

/** «Ver como» (solo el dueño): la app se muestra con el rol y los permisos de otro. Lo que se hace sigue con el usuario real. */
export interface VistaComo {
  rol: RolCodigo
  permisos: Permiso[]
}

/** Área con la que se mira cada rol en «Ver como». */
const AREA_DE_VISTA: Partial<Record<RolCodigo, AreaCodigo>> = {
  SUPERVISOR: "ASEPTICO",
  ANALISTA: "ASEPTICO",
  JEFE_PRODUCCION: "ASEPTICO",
  MANTENIMIENTO: "MANTENIMIENTO",
  CALIDAD: "CALIDAD",
  SUPERVISOR_CALIDAD: "CALIDAD",
}

/** Cargo con el que se mira cada rol (el inicio ordena las tarjetas por cargo). */
const CARGO_DE_VISTA: Partial<Record<RolCodigo, CargoCodigo>> = {
  SUPERVISOR: "SUPERVISOR",
  ANALISTA: "ANALISTA_PRODUCCION",
  JEFE_PRODUCCION: "JEFE_PRODUCCION",
}

interface AuthContextValue {
  /** La sesión con la que se muestra la app (la de «Ver como» si el dueño eligió una). */
  session: Session | null
  /** La sesión de verdad (sin «Ver como»). */
  sessionReal: Session | null
  vistaComo: VistaComo | null
  /** null = volver a la vista propia. */
  verComo: (rol: RolCodigo | null) => Promise<{ ok: true } | { ok: false; error: string }>
  login: (username: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>
  completarPrimerIngreso: (datos: DatosPrimerIngreso) => Promise<{ ok: true } | { ok: false; error: string }>
  logout: () => void
}

const STORAGE_KEY = "natulac.session"
const STORAGE_VISTA = "natulac.verComo"

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    try {
      // Sesiones guardadas antes del rework traían veErrores en vez de esDueno.
      const guardada = JSON.parse(raw) as Session & { veErrores?: boolean }
      return { ...guardada, esDueno: guardada.esDueno ?? guardada.veErrores ?? false, permisos: guardada.permisos ?? [] }
    } catch {
      return null
    }
  })
  /*
   * La contraseña recién escrita en el login, solo en memoria (NUNCA
   * en localStorage). completar_primer_ingreso() la necesita como
   * "contraseña actual". Si la persona recarga la página en medio del
   * primer ingreso, se pierde y hay que iniciar sesión de nuevo.
   */
  const [passwordLogin, setPasswordLogin] = useState<string | null>(null)
  const [vistaComo, setVistaComo] = useState<VistaComo | null>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_VISTA)
      return raw ? (JSON.parse(raw) as VistaComo) : null
    } catch {
      return null
    }
  })

  useEffect(() => {
    if (vistaComo) localStorage.setItem(STORAGE_VISTA, JSON.stringify(vistaComo))
    else localStorage.removeItem(STORAGE_VISTA)
  }, [vistaComo])

  async function verComo(rol: RolCodigo | null) {
    if (rol === null) {
      setVistaComo(null)
      return { ok: true as const }
    }
    if (!session?.esDueno) return { ok: false as const, error: "Solo el dueño puede usar «Ver como»." }
    const { data, error } = await supabase.rpc("permisos_de_rol", { p_usuario: session.username, p_rol_codigo: rol })
    if (error || !Array.isArray(data)) return { ok: false as const, error: error?.message || "No se pudieron leer los permisos de ese rol." }
    setVistaComo({ rol, permisos: data as Permiso[] })
    return { ok: true as const }
  }

  // Solo el dueño puede tener «Ver como»; si deja de serlo, no se aplica.
  const vistaActiva = session?.esDueno ? vistaComo : null
  const sessionVista = useMemo<Session | null>(
    () =>
      session && vistaActiva
        ? { ...session, rol: vistaActiva.rol, permisos: vistaActiva.permisos, esDueno: false, area: AREA_DE_VISTA[vistaActiva.rol] ?? session.area, cargo: CARGO_DE_VISTA[vistaActiva.rol] ?? null }
        : session,
    [session, vistaActiva],
  )

  useEffect(() => {
    if (session) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [session])

  /*
   * Al abrir la app (y al entrar) se piden rol, área y permisos actuales:
   * la sesión guardada puede ser vieja. Si la persona fue desactivada o
   * eliminada, se cierra su sesión. Si no hay conexión, se conserva lo que
   * había (no se borran los permisos por un corte).
   */
  const usuarioSesion = session?.username
  useEffect(() => {
    if (!usuarioSesion) return
    let cancelado = false
    const actualizar = (cambios: Partial<Session>) =>
      setSession((s) => (s && s.username === usuarioSesion ? { ...s, ...cambios } : s))

    cargarPerfil(usuarioSesion).then(async (perfil) => {
      if (cancelado) return
      if (perfil === undefined) {
        // Sin conexión o sin la función nueva en la base: al menos los permisos.
        const permisos = await cargarPermisos(usuarioSesion)
        if (!cancelado && permisos) actualizar({ permisos })
        return
      }
      if (perfil === null || !perfil.activo) {
        setPasswordLogin(null)
        setSession(null)
        return
      }
      actualizar({ rol: perfil.rol, area: perfil.area, esDueno: perfil.esDueno, permisos: perfil.permisos, cargo: perfil.cargo })
    })
    return () => {
      cancelado = true
    }
  }, [usuarioSesion])

  /*
   * Login contra la tabla "usuarios" de Supabase (NO Supabase Auth,
   * por decisión explícita). La verificación de la contraseña pasa
   * entera adentro de la función verificar_login() en Postgres — acá
   * nunca se ve el hash, solo el resultado. Ver
   * supabase/migrations/20260822090000_usuarios_tabla_propia.sql.
   *
   * Lo que queda en localStorage (STORAGE_KEY de arriba) es la
   * SESIÓN ya autenticada, para no tener que loguearse de nuevo en
   * cada refresh — no es donde vive la contraseña.
   */
  async function login(username: string, password: string) {
    if (!username.trim() || !password.trim()) {
      return { ok: false as const, error: "Ingresa tu usuario y contraseña." }
    }

    const { data, error } = await supabase.rpc("verificar_login", {
      p_usuario: username.trim(),
      p_password: password,
    })

    if (error) {
      return { ok: false as const, error: "No se pudo validar el usuario. Intenta de nuevo." }
    }
    const perfil = data?.[0]
    if (!perfil) {
      return { ok: false as const, error: "Usuario o contraseña incorrectos." }
    }

    const permisos = (await cargarPermisos(perfil.usuario)) ?? []
    setPasswordLogin(password)
    setSession({
      permisos,
      username: perfil.usuario,
      nombre: perfil.nombre ?? perfil.usuario,
      cedula: perfil.cedula ?? null,
      area: perfil.area_codigo as AreaCodigo | null,
      rol: perfil.rol_codigo as RolCodigo,
      esDueno: Boolean(perfil.ve_errores),
      // Fuerza el primer ingreso si la base lo marca, o si la clave
      // escrita no cumple la política — esto último el hash no lo
      // puede saber, solo se ve aquí con el texto plano.
      debeCompletarPerfil: Boolean(perfil.debe_completar_perfil) || !claveCumplePolitica(password),
    })
    return { ok: true as const }
  }

  async function completarPrimerIngreso(datos: DatosPrimerIngreso) {
    if (!session) return { ok: false as const, error: "No hay una sesión iniciada." }
    if (!passwordLogin) {
      return { ok: false as const, error: "Se perdió la sesión. Inicia sesión de nuevo para continuar." }
    }
    if (!datos.nombre.trim()) {
      return { ok: false as const, error: "Ingresa tu nombre y apellido." }
    }
    if (!cedulaValida(datos.cedula)) {
      return { ok: false as const, error: "La cédula debe ser X.XXX.XXX o XX.XXX.XXX." }
    }
    if (!claveCumplePolitica(datos.passwordNueva)) {
      return { ok: false as const, error: "La contraseña nueva debe ser de 4 dígitos y distinta de 1234." }
    }

    const { error } = await supabase.rpc("completar_primer_ingreso", {
      p_usuario: session.username,
      p_password_actual: passwordLogin,
      p_password_nueva: datos.passwordNueva,
      p_nombre: datos.nombre.trim(),
      p_cedula: datos.cedula,
    })
    if (error) {
      return { ok: false as const, error: error.message || "No se pudo guardar. Intenta de nuevo." }
    }

    setPasswordLogin(datos.passwordNueva)
    setSession({ ...session, nombre: datos.nombre.trim(), cedula: datos.cedula, debeCompletarPerfil: false })
    return { ok: true as const }
  }

  function logout() {
    setPasswordLogin(null)
    setVistaComo(null)
    setSession(null)
  }

  return (
    <AuthContext.Provider value={{ session: sessionVista, sessionReal: session, vistaComo: vistaActiva, verComo, login, completarPrimerIngreso, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider")
  return ctx
}

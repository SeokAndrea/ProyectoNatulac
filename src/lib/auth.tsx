import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import type { AreaCodigo, RolCodigo } from "@/lib/catalogos"
import { cedulaValida, claveCumplePolitica } from "@/lib/credenciales"
import { supabase } from "@/lib/supabase"

export interface Session {
  username: string
  nombre: string
  cedula: string | null
  /** null = todas las áreas (solo aplica a SuperAdministrador). */
  area: AreaCodigo | null
  rol: RolCodigo
  /**
   * true = la persona todavía no pasó el primer ingreso: tiene que
   * confirmar Nombre y Apellido + Cédula y definir una clave propia de
   * 4 dígitos (no 1234) antes de usar la app. También se prende si la
   * clave escrita no cumple la política. Ver App.tsx y PrimerIngreso.tsx.
   */
  debeCompletarPerfil: boolean
}

export interface DatosPrimerIngreso {
  passwordNueva: string
  nombre: string
  cedula: string
}

interface AuthContextValue {
  session: Session | null
  login: (username: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>
  completarPrimerIngreso: (datos: DatosPrimerIngreso) => Promise<{ ok: true } | { ok: false; error: string }>
  logout: () => void
}

const STORAGE_KEY = "natulac.session"

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as Session
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

  useEffect(() => {
    if (session) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [session])

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

    setPasswordLogin(password)
    setSession({
      username: perfil.usuario,
      nombre: perfil.nombre ?? perfil.usuario,
      cedula: perfil.cedula ?? null,
      area: perfil.area_codigo as AreaCodigo | null,
      rol: perfil.rol_codigo as RolCodigo,
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
    setSession(null)
  }

  return (
    <AuthContext.Provider value={{ session, login, completarPrimerIngreso, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider")
  return ctx
}

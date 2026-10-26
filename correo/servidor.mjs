// ============================================================
// CORREO — manda los avisos que la base deja en correos_pendientes
// ============================================================
// La base no manda correos sola: cada Solicitud de Inspección nueva y cada
// subida a Intervención (migración 20261111690000) dejan una fila en
// correos_pendientes. Este servicio la revisa cada CORREO_INTERVALO_MS, manda
// lo nuevo por SMTP y lo marca enviado. Si falla, reintenta hasta
// MAX_INTENTOS y deja el error en ultimo_error.
//
// A quién: lo que la dueña puso en Ajustes de planta (configuracion_app
// 'correo_mantenimiento_para', migración 20261112490000), leído en cada
// vuelta; si está vacío, CORREO_PARA de .env.local.
// La base con las mismas DB_* del servicio "api", y la cuenta que manda con
// SMTP_* de .env.local (ver .env.example). Sin SMTP_HOST o sin nadie a quién
// mandar, no manda nada: los correos esperan en la cola.
// ============================================================

import nodemailer from "nodemailer"
import pg from "pg"

const INTERVALO_MS = Number(process.env.CORREO_INTERVALO_MS ?? 30_000)
const MAX_INTENTOS = 5
// Un aviso más viejo que esto ya no se manda (dueña, 2026-10-26): si el correo estuvo
// sin configurar, al encenderlo no le llega a Mantenimiento todo lo acumulado.
// Mismo número en estado_correos() (migración 20261112490000).
const MAX_HORAS = 24
const LOTE = 20

const lista = (texto) =>
  (texto ?? "")
    .split(/[\s,;]+/)
    .map((c) => c.trim())
    .filter(Boolean)
const PARA_ENV = lista(process.env.CORREO_PARA)
const DE = process.env.CORREO_DE || process.env.SMTP_USUARIO
const APP_URL = (process.env.APP_URL ?? "").replace(/\/$/, "")
const configurado = Boolean(process.env.SMTP_HOST)

// Las PG* (PGHOST, PGUSER…) las arma docker-compose.yml desde las DB_*.
const base = new pg.Pool({ max: 2 })

const smtp = configurado
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PUERTO ?? 587),
      // 465 = TLS directo (Gmail); 587 = STARTTLS (Office 365).
      secure: Number(process.env.SMTP_PUERTO ?? 587) === 465,
      auth: process.env.SMTP_USUARIO ? { user: process.env.SMTP_USUARIO, pass: process.env.SMTP_CLAVE } : undefined,
    })
  : null

function cuerpoCon(correo) {
  return correo.enlace && APP_URL ? `${correo.cuerpo}\n\nAbrir en la app: ${APP_URL}${correo.enlace}` : correo.cuerpo
}

let paraAnterior = ""

async function vaciarCola() {
  const cliente = await base.connect()
  try {
    const { rows: ajuste } = await cliente.query("select valor from configuracion_app where clave = 'correo_mantenimiento_para'")
    const deAjustes = lista(ajuste[0]?.valor)
    const PARA = deAjustes.length > 0 ? deAjustes : PARA_ENV
    if (PARA.join(", ") !== paraAnterior) {
      paraAnterior = PARA.join(", ")
      console.log(PARA.length > 0 ? `correo: manda ${DE} a ${paraAnterior}` : "correo: nadie a quién mandar (Ajustes de planta vacío y sin CORREO_PARA) — los correos esperan en la cola.")
    }
    if (PARA.length === 0) return
    await cliente.query("begin")
    const { rows } = await cliente.query(
      `select id, asunto, cuerpo, enlace from correos_pendientes
       where enviado_en is null and intentos < $1
         and creado_en > now() - make_interval(hours => $3)
       order by creado_en
       limit $2
       for update skip locked`,
      [MAX_INTENTOS, LOTE, MAX_HORAS],
    )
    for (const correo of rows) {
      try {
        await smtp.sendMail({ from: DE, to: PARA, subject: `Natulac · ${correo.asunto}`, text: cuerpoCon(correo) })
        await cliente.query("update correos_pendientes set enviado_en = now(), intentos = intentos + 1, ultimo_error = null where id = $1", [correo.id])
        console.log(`correo: enviado "${correo.asunto}"`)
      } catch (e) {
        await cliente.query("update correos_pendientes set intentos = intentos + 1, ultimo_error = $2 where id = $1", [correo.id, String(e.message ?? e)])
        console.error(`correo: no se pudo mandar "${correo.asunto}": ${e.message ?? e}`)
      }
    }
    await cliente.query("commit")
  } catch (e) {
    await cliente.query("rollback").catch(() => {})
    console.error(`correo: no se pudo leer la cola: ${e.message ?? e}`)
  } finally {
    cliente.release()
  }
}

if (!configurado) {
  console.log("correo: sin SMTP_HOST en .env.local — no se manda nada, los correos esperan en la cola.")
  // Queda vivo sin hacer nada: si terminara, Docker lo reiniciaría en bucle.
  setInterval(() => {}, 24 * 60 * 60 * 1000)
} else {
  console.log(`correo: revisando la cola cada ${INTERVALO_MS / 1000} s`)
  let ocupado = false
  const vuelta = async () => {
    if (ocupado) return
    ocupado = true
    await vaciarCola()
    ocupado = false
  }
  void vuelta()
  setInterval(vuelta, INTERVALO_MS)
}

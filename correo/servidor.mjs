// ============================================================
// CORREO — manda los avisos que la base deja en correos_pendientes
// ============================================================
// La base no manda correos sola: cada Solicitud de Inspección nueva y cada
// subida a Intervención (migración 20261111690000) dejan una fila en
// correos_pendientes. Este servicio la revisa cada CORREO_INTERVALO_MS, manda
// lo nuevo por SMTP a CORREO_PARA y lo marca enviado. Si falla, reintenta
// hasta MAX_INTENTOS y deja el error en ultimo_error.
//
// Todo sale de .env.local (ver .env.example): la base con las mismas DB_*
// del servicio "api", y la cuenta que manda con SMTP_*. Para cambiar de la
// cuenta de prueba a la de @natulac.com basta con cambiar esas variables.
// Sin SMTP_HOST o sin CORREO_PARA no manda nada: los correos esperan en la
// cola hasta que se configure.
// ============================================================

import nodemailer from "nodemailer"
import pg from "pg"

const INTERVALO_MS = Number(process.env.CORREO_INTERVALO_MS ?? 30_000)
const MAX_INTENTOS = 5
const LOTE = 20

const PARA = (process.env.CORREO_PARA ?? "")
  .split(",")
  .map((c) => c.trim())
  .filter(Boolean)
const DE = process.env.CORREO_DE || process.env.SMTP_USUARIO
const APP_URL = (process.env.APP_URL ?? "").replace(/\/$/, "")
const configurado = Boolean(process.env.SMTP_HOST) && PARA.length > 0

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

async function vaciarCola() {
  const cliente = await base.connect()
  try {
    await cliente.query("begin")
    const { rows } = await cliente.query(
      `select id, asunto, cuerpo, enlace from correos_pendientes
       where enviado_en is null and intentos < $1
       order by creado_en
       limit $2
       for update skip locked`,
      [MAX_INTENTOS, LOTE],
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
  console.log("correo: sin SMTP_HOST o CORREO_PARA en .env.local — no se manda nada, los correos esperan en la cola.")
  // Queda vivo sin hacer nada: si terminara, Docker lo reiniciaría en bucle.
  setInterval(() => {}, 24 * 60 * 60 * 1000)
} else {
  console.log(`correo: revisando la cola cada ${INTERVALO_MS / 1000} s, manda ${DE} a ${PARA.join(", ")}`)
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

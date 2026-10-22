import type { IncomingMessage, ServerResponse } from "node:http"

/** Ver manejador.mjs. */
export function crearManejador(carpeta: string): (req: IncomingMessage, res: ServerResponse) => void

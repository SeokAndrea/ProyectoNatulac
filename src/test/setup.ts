import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

// Desmonta lo renderizado entre tests para que no se pisen.
afterEach(cleanup)

// jsdom no trae ResizeObserver; el Switch y el Checkbox de Radix lo usan para medirse.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

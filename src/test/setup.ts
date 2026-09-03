import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

// Desmonta lo renderizado entre tests para que no se pisen.
afterEach(cleanup)

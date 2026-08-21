import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { LogoMark } from "@/components/Logo"
import { AppHeader } from "@/components/AppHeader"

export function AppShell({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <AppHeader
        title={title}
        description={description}
        left={
          <>
            <Button variant="ghost" size="icon" className="shrink-0" asChild>
              <Link to="/hub" aria-label="Volver al hub">
                <ArrowLeft className="size-4.5" />
              </Link>
            </Button>
            <Link to="/hub" className="hidden shrink-0 items-center sm:flex">
              <LogoMark className="size-7" />
            </Link>
          </>
        }
      />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8 print:max-w-none print:p-0">
        {children}
      </main>
    </div>
  )
}

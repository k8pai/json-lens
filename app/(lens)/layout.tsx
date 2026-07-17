import type { ReactNode } from "react"

import { JsonLensProvider } from "@/components/json-lens/json-lens-provider"
import { JsonLensShell } from "@/components/json-lens/json-lens-shell"

export default function LensLayout({ children }: { children: ReactNode }) {
  return (
    <JsonLensProvider>
      <JsonLensShell>{children}</JsonLensShell>
    </JsonLensProvider>
  )
}

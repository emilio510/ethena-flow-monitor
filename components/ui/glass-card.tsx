import type { HTMLAttributes } from "react"
import { RefractiveGlass } from "@/components/ui/refractive-glass"

export function GlassCard({
  className = "",
  children,
  refractive = false,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { refractive?: boolean }) {
  if (refractive) {
    return (
      <RefractiveGlass className={className} {...rest}>
        {children}
      </RefractiveGlass>
    )
  }
  return (
    <div className={`glass ${className}`} {...rest}>
      {children}
    </div>
  )
}

import * as React from "react"
import { cn } from "@/lib/utils"

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

interface TooltipContextType {
  open: boolean
  setOpen: (open: boolean) => void
}

const TooltipContext = React.createContext<TooltipContextType>({
  open: false,
  setOpen: () => {},
})

export function Tooltip({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  return (
    <TooltipContext.Provider value={{ open, setOpen }}>
      <div
        className="relative inline-flex"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {children}
      </div>
    </TooltipContext.Provider>
  )
}

export function TooltipTrigger({
  children,
  className,
  asChild: _asChild,
  ...props
}: React.HTMLAttributes<HTMLElement> & { asChild?: boolean; [key: string]: any }) {
  return (
    <div className={className} {...props}>
      {children}
    </div>
  )
}

export function TooltipContent({
  children,
  className,
  side = "top",
}: {
  children: React.ReactNode
  className?: string
  side?: "top" | "bottom" | "left" | "right" | string
}) {
  const { open } = React.useContext(TooltipContext)
  if (!open) return null

  const sideStyles: Record<string, string> = {
    top: "bottom-full mb-1.5 left-1/2 -translate-x-1/2",
    bottom: "top-full mt-1.5 left-1/2 -translate-x-1/2",
    left: "right-full mr-1.5 top-1/2 -translate-y-1/2",
    right: "left-full ml-1.5 top-1/2 -translate-y-1/2",
  }

  return (
    <div
      data-slot="tooltip-content"
      className={cn(
        "absolute z-50 overflow-hidden rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground shadow-md animate-in fade-in-0 zoom-in-95 pointer-events-none whitespace-nowrap",
        sideStyles[side] || sideStyles.top,
        className
      )}
    >
      {children}
    </div>
  )
}

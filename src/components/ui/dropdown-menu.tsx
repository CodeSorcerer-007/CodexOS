import * as React from "react"
import { cn } from "@/lib/utils"

interface DropdownContextType {
  open: boolean
  setOpen: (open: boolean) => void
}

const DropdownContext = React.createContext<DropdownContextType>({
  open: false,
  setOpen: () => {},
})

export function DropdownMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  const menuRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [open])

  return (
    <DropdownContext.Provider value={{ open, setOpen }}>
      <div ref={menuRef} className="relative inline-block text-left">
        {children}
      </div>
    </DropdownContext.Provider>
  )
}

export function DropdownMenuTrigger({
  children,
  className,
  asChild: _asChild,
  ...props
}: React.HTMLAttributes<HTMLElement> & { asChild?: boolean; [key: string]: any }) {
  const { open, setOpen } = React.useContext(DropdownContext)
  return (
    <div
      className={cn("inline-flex cursor-pointer", className)}
      onClick={() => setOpen(!open)}
      {...props}
    >
      {children}
    </div>
  )
}

export function DropdownMenuContent({
  align = "start",
  side: _side,
  sideOffset: _sideOffset,
  className,
  children,
}: {
  align?: "start" | "end" | "center"
  side?: "top" | "bottom" | "left" | "right" | string
  sideOffset?: number
  className?: string
  children: React.ReactNode
}) {
  const { open } = React.useContext(DropdownContext)

  if (!open) return null

  const alignStyles = {
    start: "left-0",
    end: "right-0",
    center: "left-1/2 -translate-x-1/2",
  }

  return (
    <div
      data-slot="dropdown-menu-content"
      className={cn(
        "absolute z-50 mt-2 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95",
        alignStyles[align],
        className
      )}
    >
      {children}
    </div>
  )
}

export function DropdownMenuItem({
  className,
  children,
  onClick,
  variant: _variant,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: string }) {
  const { setOpen } = React.useContext(DropdownContext)

  return (
    <div
      className={cn(
        "relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className
      )}
      onClick={(e) => {
        onClick?.(e)
        setOpen(false)
      }}
      {...props}
    >
      {children}
    </div>
  )
}

export function DropdownMenuLabel({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "px-2 py-1.5 text-xs font-semibold text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

export function DropdownMenuSeparator({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("-mx-1 my-1 h-px bg-muted", className)} {...props} />
  )
}

export function DropdownMenuGroup({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return <div className={className}>{children}</div>
}

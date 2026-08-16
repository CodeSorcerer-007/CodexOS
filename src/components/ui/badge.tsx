/* oxlint-disable react/only-export-components */
import * as React from "react"
import { cn } from "@/lib/utils"

export function badgeVariants({
  variant = "default",
  className = "",
}: {
  variant?: "default" | "secondary" | "destructive" | "outline"
  className?: string
} = {}) {
  const base =
    "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"

  const variants = {
    default:
      "border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80",
    secondary:
      "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
    destructive:
      "border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80",
    outline: "text-foreground",
  }

  return cn(base, variants[variant] || variants.default, className)
}

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "destructive" | "outline"
  asChild?: boolean
}

export function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  return (
    <div className={badgeVariants({ variant, className })} {...props} />
  )
}

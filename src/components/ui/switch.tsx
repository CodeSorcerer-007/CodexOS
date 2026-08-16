import * as React from "react"
import { cn } from "@/lib/utils"

export interface SwitchProps {
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  className?: string
  id?: string
  size?: "default" | "sm" | string
  "aria-label"?: string
}

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  (
    {
      checked: controlledChecked,
      defaultChecked = false,
      onCheckedChange,
      disabled = false,
      className,
      id,
      size = "default",
      "aria-label": ariaLabel,
    },
    ref
  ) => {
    const [uncontrolledChecked, setUncontrolledChecked] =
      React.useState(defaultChecked)
    const isControlled = controlledChecked !== undefined
    const checked = isControlled ? controlledChecked : uncontrolledChecked

    const toggle = () => {
      if (disabled) return
      const next = !checked
      if (!isControlled) {
        setUncontrolledChecked(next)
      }
      onCheckedChange?.(next)
    }

    const isSm = size === "sm"

    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        id={id}
        aria-label={ariaLabel}
        aria-checked={checked}
        disabled={disabled}
        onClick={toggle}
        className={cn(
          "peer inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
          isSm ? "h-4 w-7" : "h-5 w-9",
          checked ? "bg-primary" : "bg-input",
          className
        )}
      >
        <span
          className={cn(
            "pointer-events-none block rounded-full bg-background shadow-lg ring-0 transition-transform",
            isSm ? "h-3 w-3" : "h-4 w-4",
            checked
              ? isSm
                ? "translate-x-3"
                : "translate-x-4"
              : "translate-x-0"
          )}
        />
      </button>
    )
  }
)
Switch.displayName = "Switch"

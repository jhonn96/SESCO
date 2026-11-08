import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap transition-colors [&>svg]:pointer-events-none [&>svg]:size-3.5",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground",
        outline: "border-border text-foreground",
        destructive:
          "border-destructive/25 bg-destructive/10 text-destructive dark:border-destructive/40 dark:bg-destructive/20",
        success:
          "border-success/30 bg-success/10 text-success dark:border-success/40 dark:bg-success/15",
        warning:
          "border-amber-500/30 bg-amber-500/15 text-amber-700 dark:border-amber-400/40 dark:bg-amber-400/15 dark:text-amber-300",
        info: "border-primary/25 bg-primary/10 text-primary dark:border-primary/40 dark:bg-primary/15",
        calendario:
          "border-violet-500/30 bg-violet-500/15 text-violet-700 dark:border-violet-400/40 dark:bg-violet-400/15 dark:text-violet-300",
        muted:
          "border-border bg-muted/60 text-muted-foreground dark:bg-muted/40",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge }

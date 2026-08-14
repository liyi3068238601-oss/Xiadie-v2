import { Slot } from "radix-ui";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils.js";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly asChild?: boolean;
  readonly variant?: "default" | "ghost" | "outline" | "danger";
  readonly size?: "default" | "sm" | "icon";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { asChild, className, variant = "default", size = "default", ...props }, ref,
) {
  const Component = asChild ? Slot.Root : "button";
  return <Component ref={ref} className={cn("ui-button", `ui-button--${variant}`, `ui-button--${size}`, className)} {...props} />;
});

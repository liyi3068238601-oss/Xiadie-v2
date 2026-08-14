import { Tooltip as TooltipPrimitive } from "radix-ui";
import type { PropsWithChildren, ReactNode } from "react";

export function Tooltip({ children, content }: PropsWithChildren<{ content: ReactNode }>) {
  return <TooltipPrimitive.Provider><TooltipPrimitive.Root><TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger><TooltipPrimitive.Portal><TooltipPrimitive.Content className="tooltip-content" sideOffset={6}>{content}</TooltipPrimitive.Content></TooltipPrimitive.Portal></TooltipPrimitive.Root></TooltipPrimitive.Provider>;
}

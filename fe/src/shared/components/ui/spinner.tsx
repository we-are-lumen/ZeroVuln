import { cn } from "@/shared/lib/utils";
import { HugeiconsIcon } from "@hugeicons/react";
import { Loading03Icon } from "@hugeicons/core-free-icons";
import React from "react";
interface SpinnerProps extends Omit<
  React.ComponentProps<"svg">,
  "strokeWidth"
> {
  strokeWidth?: number;
}

function Spinner({ className, strokeWidth = 2, ...props }: SpinnerProps) {
  return (
    <HugeiconsIcon
      icon={Loading03Icon}
      strokeWidth={strokeWidth}
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };

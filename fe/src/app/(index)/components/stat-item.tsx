"use client";

import { HugeiconsIcon, IconSvgElement } from "@hugeicons/react";
import { useRef } from "react";
import CountUp from "./count-up";

function StatItem({
  icon,
  label,
  value,
}: {
  icon: IconSvgElement;
  label: string;
  value: number;
}) {
  const ref = useRef(null);

  return (
    <div ref={ref} className="flex flex-col items-center space-y-3">
      <div className="text-center">
        <h5 className="text-8xl font-bold tracking-tighter text-white tabular-nums">
          <CountUp
            from={0}
            to={value}
            separator=","
            direction="up"
            duration={1}
            className="count-up-text"
            delay={0}
          />
        </h5>
        <p className="mt-1 font-bold text-mist-500 uppercase">{label}</p>
      </div>
    </div>
  );
}

export default StatItem;

"use client";

import { Skeleton } from "@/shared/components/ui/skeleton";
import { cn } from "@/shared/lib/utils";
import { useLayoutEffect, useState } from "react";

interface Line {
  width: number;
  indent: number;
}

const getIndentClass = (level: number) => {
  switch (level) {
    case 1:
      return "pl-4";
    case 2:
      return "pl-8";
    default:
      return "pl-0";
  }
};

const CodeSkeleton = ({ totalLines = 30 }: { totalLines?: number }) => {
  const [lines, setLines] = useState<Line[]>([]);

  useLayoutEffect(() => {
    const generatedLines = [...Array(totalLines)].map(() => ({
      width: Math.floor(Math.random() * (95 - 40 + 1) + 40),
      indent: Math.floor(Math.random() * 3),
    }));

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLines(generatedLines);
  }, [totalLines]);

  if (lines.length === 0) return;

  return (
    <div className="flex h-full flex-col space-y-2 p-6">
      {lines.map((line, i) => (
        <div
          key={i}
          className={cn("flex flex-col space-y-2", getIndentClass(line.indent))}
        >
          {i % 6 === 0 && <Skeleton className="h-3 w-16 bg-mist-700/30" />}

          <Skeleton
            className="h-3 bg-mist-800/40"
            style={{ width: `${line.width}%` }}
          />
        </div>
      ))}
    </div>
  );
};

export default CodeSkeleton;

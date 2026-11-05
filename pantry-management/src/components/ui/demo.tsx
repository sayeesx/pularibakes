"use client";

import { CountUp } from "@/components/ui/count-up";

export default function CountUpDemo() {
  return (
    <div className="flex min-h-64 flex-wrap items-end justify-center gap-12 bg-background p-8 text-foreground">
      <div className="flex flex-col items-center gap-1">
        <CountUp
          to={1000000}
          separator=","
          digitEffect="slide"
          className="text-5xl font-bold tabular-nums tracking-tight"
        />
        <span className="text-xs text-muted-foreground">users</span>
      </div>

      <div className="flex flex-col items-center gap-1">
        <CountUp
          to={99.9}
          digitEffect="blur"
          className="text-5xl font-bold tabular-nums tracking-tight"
        />
        <span className="text-xs text-muted-foreground">uptime %</span>
      </div>

      <div className="flex flex-col items-center gap-1">
        <CountUp
          to={0}
          from={5}
          direction="down"
          separator=","
          digitEffect="slide"
          className="text-5xl font-bold tabular-nums tracking-tight"
        />
        <span className="text-xs text-muted-foreground">issues</span>
      </div>
    </div>
  );
}

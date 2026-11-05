"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type DigitEffect = "none" | "fade" | "blur" | "slide";

interface CountUpProps {
  to: number;
  from?: number;
  direction?: "up" | "down";
  delay?: number;
  duration?: number;
  digitEffect?: DigitEffect;
  className?: string;
  startWhen?: boolean;
  separator?: string;
  onStart?: () => void;
  onEnd?: () => void;
}

/**
 * Ultra-smooth, mathematically accurate odometer digit reel (0-9).
 * Fluidly translates vertical position on value changes.
 */
function OdometerDigit({ digit }: { digit: number }) {
  const safeDigit = Math.max(0, Math.min(9, Math.floor(digit)));

  return (
    <span
      className="inline-block relative overflow-hidden align-baseline"
      style={{
        width: "1ch",
        height: "1.18em",
        lineHeight: "1.18em",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <span
        className="flex flex-col will-change-transform"
        style={{
          transform: `translateY(-${safeDigit * 10}%)`,
          transition: "transform 0.28s cubic-bezier(0.2, 0.9, 0.3, 1)",
        }}
      >
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <span
            key={n}
            className="flex items-center justify-center select-none"
            style={{ height: "1.18em" }}
          >
            {n}
          </span>
        ))}
      </span>
    </span>
  );
}

export function CountUp({
  to,
  from = 0,
  direction = "up",
  delay = 0,
  duration = 0.3,
  digitEffect = "slide",
  className,
  startWhen = true,
  separator = "",
  onStart,
  onEnd,
}: CountUpProps) {
  const [currentValue, setCurrentValue] = React.useState<number>(
    startWhen ? to : from
  );

  React.useEffect(() => {
    if (!startWhen) return;
    onStart?.();

    if (delay > 0) {
      const timer = setTimeout(() => {
        setCurrentValue(to);
        onEnd?.();
      }, delay * 1000);
      return () => clearTimeout(timer);
    } else {
      setCurrentValue(to);
      onEnd?.();
    }
  }, [to, delay, startWhen, onStart, onEnd]);

  // Format value to string respecting decimals and optional thousand separator
  const formatNumber = (num: number): string => {
    // If num has decimals, format with 1 or matching decimals
    const str = num.toString();
    const hasDecimal = str.includes(".");
    const decimals = hasDecimal ? str.split(".")[1].length : 0;

    const formatted = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      useGrouping: Boolean(separator),
    }).format(num);

    return separator ? formatted.replace(/,/g, separator) : formatted;
  };

  const formattedStr = formatNumber(currentValue);

  if (digitEffect === "slide") {
    return (
      <span
        className={cn("inline-flex items-center select-none", className)}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {formattedStr.split("").map((ch, idx) => {
          if (/\d/.test(ch)) {
            return (
              <OdometerDigit
                key={`digit-${idx}`}
                digit={parseInt(ch, 10)}
              />
            );
          }
          return (
            <span key={`sep-${idx}`} className="inline-block px-0.5">
              {ch}
            </span>
          );
        })}
      </span>
    );
  }

  return (
    <span
      className={cn("inline-flex items-center", className)}
      style={{ fontVariantNumeric: "tabular-nums" }}
    >
      {formattedStr}
    </span>
  );
}

export default CountUp;

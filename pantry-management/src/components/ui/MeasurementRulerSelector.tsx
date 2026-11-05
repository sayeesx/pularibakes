import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { CountUp } from './count-up';
import { Check, X, Minus, Plus, ChevronLeft, AlertCircle } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

export interface UnitConfig {
  type: 'weight_kg' | 'weight_g' | 'volume_l' | 'volume_ml' | 'count' | 'generic';
  min: number;
  step: number;
  decimals: number;
  presets: number[];
}

export function getUnitConfig(unitStr?: string): UnitConfig {
  const u = (unitStr || '').toLowerCase().trim();
  if (['g', 'gm', 'gms', 'gram', 'grams'].includes(u)) {
    return {
      type: 'weight_g',
      min: 1,
      step: 1,
      decimals: 0,
      presets: [1, 2, 5, 10, 15, 20],
    };
  }
  if (['ml', 'mls', 'milliliter', 'millilitre'].includes(u)) {
    return {
      type: 'volume_ml',
      min: 1,
      step: 1,
      decimals: 0,
      presets: [1, 2, 5, 10, 15, 20],
    };
  }
  if (['kg', 'kgs', 'kilogram', 'kilograms'].includes(u)) {
    return {
      type: 'weight_kg',
      min: 0,
      step: 0.5,
      decimals: 1,
      presets: [0.5, 1, 2, 5, 10, 20],
    };
  }
  if (['l', 'ltr', 'ltrs', 'liter', 'liters', 'litre', 'litres'].includes(u)) {
    return {
      type: 'volume_l',
      min: 0.1,
      step: 0.1,
      decimals: 1,
      presets: [0.5, 1, 2, 5, 10, 20],
    };
  }
  if (['pcs', 'piece', 'pieces', 'packs', 'pack', 'packet', 'packets', 'rolls', 'roll', 'box', 'boxes', 'bottle', 'bottles', 'pkt'].includes(u)) {
    return {
      type: 'count',
      min: 1,
      step: 1,
      decimals: 0,
      presets: [1, 2, 5, 10, 15, 20],
    };
  }
  return {
    type: 'generic',
    min: 0.1,
    step: 0.1,
    decimals: 1,
    presets: [0.5, 1, 2, 5, 10, 20],
  };
}

export interface MeasurementRulerSelectorProps {
  value: number;
  onChange: (value: number) => void;
  unit: string;
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  min?: number;
  max?: number;
  step?: number;
  presets?: number[];
  isZeroStock?: boolean;
  availableStock?: number;
  onConfirm?: () => void;
  onClose?: () => void;
  confirmLabel?: string;
  backLabel?: string;
  className?: string;
  hideHeader?: boolean;
}

export const MeasurementRulerSelector: React.FC<MeasurementRulerSelectorProps> = ({
  value,
  onChange,
  unit,
  title,
  subtitle,
  icon,
  min,
  max = 20,
  step,
  presets: customPresets,
  isZeroStock = false,
  availableStock,
  onConfirm,
  onClose,
  confirmLabel = 'Done / Set Quantity',
  backLabel = 'Back',
  className = '',
  hideHeader = false,
}) => {
  const { language } = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const isProgrammaticScrollRef = useRef<boolean>(false);
  const programmaticTimerRef = useRef<any>(null);

  // Unit configuration with fallback
  const unitConfig = useMemo(() => getUnitConfig(unit), [unit]);
  const effectiveMin = min ?? unitConfig.min;
  const effectiveMax = max ?? 20;
  const effectiveStep = step ?? unitConfig.step;
  const decimals = effectiveStep < 1 ? 1 : 0;

  // Manual typing mode state
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [typedValue, setTypedValue] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Spacing between each tick mark in pixels (24px for 0.5 steps to clearly fit 0.5, 1.5 labels)
  const TICK_SPACING = effectiveStep === 0.5 ? 24 : 14;

  // Calculate starting tick count to accommodate current value plus scroll runway
  const initialTicks = useMemo(() => {
    const valStep = Math.ceil((Math.max(value, effectiveMin) - effectiveMin) / effectiveStep);
    return Math.max(500, valStep + 300);
  }, [effectiveMin, effectiveStep]);

  const [totalTicks, setTotalTicks] = useState<number>(initialTicks);

  // Keep a ref of latest value to prevent redundant onChange calls
  const latestValueRef = useRef<number>(value);
  latestValueRef.current = value;

  // Scroll to a target value programmatically (smoothly or instantly)
  const scrollToValue = useCallback(
    (targetVal: number, smooth: boolean = true) => {
      const el = containerRef.current;
      if (!el) return;

      const stepIndex = Math.max(0, Math.round((targetVal - effectiveMin) / effectiveStep));
      const targetScrollLeft = Math.round(stepIndex * TICK_SPACING);

      // Expand track if target is near or beyond current tick ceiling
      if (stepIndex >= totalTicks - 100) {
        setTotalTicks((prev) => Math.max(prev, stepIndex + 400));
      }

      isProgrammaticScrollRef.current = true;
      if (programmaticTimerRef.current) clearTimeout(programmaticTimerRef.current);
      programmaticTimerRef.current = setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, smooth ? 450 : 50);

      el.scrollTo({
        left: targetScrollLeft,
        behavior: smooth ? 'smooth' : 'auto',
      });
    },
    [effectiveMin, effectiveStep, totalTicks, TICK_SPACING]
  );

  // Initial setup: ensure keyboard is closed and ruler is positioned at starting value
  useEffect(() => {
    setIsEditing(false);
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const target = isZeroStock ? 0 : value !== undefined ? Math.max(effectiveMin, value) : effectiveMin;
    if (!isZeroStock && value < effectiveMin) {
      onChange(effectiveMin);
    }
    const timer = setTimeout(() => {
      scrollToValue(target, false);
    }, 40);
    return () => {
      clearTimeout(timer);
      if (programmaticTimerRef.current) clearTimeout(programmaticTimerRef.current);
    };
  }, []);

  // When user enters manual editing mode, focus and select input
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Handle native scroll events from ruler track
  const handleScroll = () => {
    if (isZeroStock) return;
    const el = containerRef.current;
    if (!el) return;

    // If programmatic smooth scroll is running, refresh timer and do not override
    if (isProgrammaticScrollRef.current) {
      if (programmaticTimerRef.current) clearTimeout(programmaticTimerRef.current);
      programmaticTimerRef.current = setTimeout(() => {
        isProgrammaticScrollRef.current = false;
      }, 150);
      return;
    }

    const scrollLeft = el.scrollLeft;
    const stepIndex = Math.max(0, Math.round(scrollLeft / TICK_SPACING));
    const rawVal = Number((effectiveMin + stepIndex * effectiveStep).toFixed(decimals));
    const calculatedValue = Math.min(effectiveMax, rawVal);

    if (calculatedValue !== latestValueRef.current) {
      latestValueRef.current = calculatedValue;
      onChange(calculatedValue);
    }

    // Add more ticks as the user scrolls right, unless capped by effectiveMax
    if (stepIndex >= totalTicks - 120 && (!effectiveMax || totalTicks * effectiveStep < effectiveMax)) {
      setTotalTicks((prev) => prev + 300);
    }
  };

  // Adjust by increment stepper
  const adjustBy = (delta: number) => {
    if (isZeroStock) return;
    const raw = Number((value + delta).toFixed(decimals || 3));
    const newVal = Math.min(effectiveMax, Math.max(effectiveMin, raw));
    onChange(newVal);
    scrollToValue(newVal, true);
  };

  // Commit typed value
  const commitTypedValue = useCallback(() => {
    if (isZeroStock) {
      setIsEditing(false);
      return;
    }
    const num = parseFloat(typedValue);
    if (!isNaN(num) && num >= effectiveMin) {
      const cleanNum = Math.min(effectiveMax, Math.max(effectiveMin, Number(num.toFixed(3))));
      onChange(cleanNum);
      scrollToValue(cleanNum, true);
    }
    setIsEditing(false);
  }, [typedValue, isZeroStock, effectiveMax, effectiveMin, onChange, scrollToValue]);

  // Unit-aware preset buttons (custom presets take priority, capped at effectiveMax)
  const presets = useMemo(() => {
    const list = customPresets ?? unitConfig.presets;
    return list.filter((p) => p <= effectiveMax && p >= effectiveMin);
  }, [customPresets, unitConfig.presets, effectiveMax, effectiveMin]);

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className={`bg-transparent select-none flex flex-col items-center w-full transition-colors relative ${className}`}
    >
      {/* Top Header Card with Close Button (only if not hideHeader and has title/subtitle) */}
      {!hideHeader && (title || subtitle || onClose) && (
        <div className="w-full flex items-center justify-between pb-3 mb-2">
        <div className="flex items-center gap-3 min-w-0 pr-2">
          {icon ? (
            <div className="w-11 h-11 rounded-2xl bg-orange-50 dark:bg-orange-950/40 text-epso-orange flex items-center justify-center shrink-0">
              {icon}
            </div>
          ) : null}
          <div className="min-w-0">
            {title && (
              <h4 className="text-base font-extrabold text-stone-900 dark:text-white leading-tight font-malayalam truncate">
                {title}
              </h4>
            )}
            {subtitle && (
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5 font-medium truncate">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right pr-1">
            <span className="text-[10px] font-bold text-stone-400 dark:text-stone-500 uppercase tracking-wider block">
              Unit
            </span>
            <span className="text-xs font-black text-epso-orange dark:text-amber-400">
              {unit}
            </span>
          </div>
        </div>
      </div>
      )}

      {/* RULER CONTAINER WITH THEME ORANGE CENTER INDICATOR */}
      <div
        className={`relative w-full py-2 my-1 overflow-hidden flex flex-col items-center transition-all ${
          isZeroStock ? 'opacity-30 grayscale pointer-events-none select-none cursor-not-allowed' : ''
        }`}
      >
        {/* Center Vertical Marker Line */}
        <div
          className={`absolute top-0 bottom-8 left-1/2 -translate-x-1/2 w-0.5 z-20 pointer-events-none rounded-full ${
            isZeroStock
              ? 'bg-stone-400 dark:bg-stone-600'
              : 'bg-epso-orange dark:bg-orange-500'
          }`}
        >
          <div
            className={`w-2.5 h-2.5 rounded-full -ml-[4px] -top-1 absolute ${
              isZeroStock ? 'bg-stone-400 dark:bg-stone-600' : 'bg-epso-orange dark:bg-orange-500'
            }`}
          />
        </div>

        {/* Scrollable / Draggable Ruler Track (Native hardware momentum touch scroll) */}
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="w-full overflow-x-scroll no-scrollbar touch-pan-x flex items-end h-20 relative select-none"
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          {/* Left Padding Spacer so first tick reaches center needle */}
          <div className="shrink-0 w-1/2" />

          {/* Calibrated Ticks */}
          <div className="flex items-end shrink-0" style={{ gap: `${TICK_SPACING - 2}px` }}>
            {Array.from({ length: totalTicks + 1 }).map((_, idx) => {
              const currentStepVal = Number((effectiveMin + idx * effectiveStep).toFixed(decimals));
              if (effectiveMax && currentStepVal > effectiveMax) return null;

              let isMajor = false;
              let isMedium = false;
              let label: string | null = null;

              if (effectiveStep === 0.5) {
                // 0, 0.5, 1, 1.5, 2, 2.5 ...
                const isWhole = Math.abs(Math.round(currentStepVal) - currentStepVal) < 0.001;
                if (isWhole) {
                  isMajor = true;
                  label = String(Math.round(currentStepVal));
                } else {
                  isMedium = true;
                  label = String(currentStepVal);
                }
              } else if (effectiveStep <= 0.1) {
                // Kilograms, Liters (0.1, 0.2, 0.3 ... 1.0, 1.1 ... 2.0)
                const isWhole = Math.abs(Math.round(currentStepVal) - currentStepVal) < 0.001;
                const isStart = idx === 0 && effectiveMin < 1;
                const isHalf = Math.abs((currentStepVal * 2) % 1) < 0.001 && !isWhole;

                if (isWhole) {
                  isMajor = true;
                  label = String(Math.round(currentStepVal));
                } else if (isStart && currentStepVal < 1) {
                  isMajor = true;
                  label = String(currentStepVal);
                } else if (isHalf) {
                  isMedium = true;
                  if (currentStepVal === 0.5) {
                    label = '0.5';
                  }
                }
              } else if (effectiveStep === 1) {
                // Grams, Milliliters, Pcs
                const isStart = idx === 0;
                const majorInterval = totalTicks > 500 ? 50 : 25;
                const mediumInterval = 10;

                if (currentStepVal % majorInterval === 0 || (isStart && currentStepVal === 1)) {
                  isMajor = true;
                  label = String(currentStepVal);
                } else if (currentStepVal % mediumInterval === 0) {
                  isMedium = true;
                }
              } else {
                const isWhole = Math.abs(Math.round(currentStepVal) - currentStepVal) < 0.001;
                if (isWhole || idx === 0) {
                  isMajor = true;
                  label = String(Math.round(currentStepVal));
                }
              }

              return (
                <div
                  key={idx}
                  onClick={() => {
                    if (isZeroStock) return;
                    onChange(currentStepVal);
                    scrollToValue(currentStepVal, true);
                  }}
                  className="flex flex-col items-center justify-end shrink-0 cursor-pointer h-16 pb-0.5"
                  style={{ width: '2px' }}
                >
                  <div
                    className={`rounded-full transition-colors ${
                      isMajor
                        ? 'h-9 bg-stone-600/60 dark:bg-stone-300/60 w-[2px]'
                        : isMedium
                        ? 'h-5 bg-stone-400/40 dark:bg-stone-500/35 w-[1.5px]'
                        : 'h-3 bg-stone-300/25 dark:bg-stone-600/20 w-[1px]'
                    }`}
                  />
                  {label ? (
                    <span className="text-[10px] font-mono font-bold text-stone-500 dark:text-stone-400 mt-1 select-none pointer-events-none whitespace-nowrap leading-none">
                      {label}
                    </span>
                  ) : (
                    <span className="text-[10px] opacity-0 mt-1 select-none pointer-events-none leading-none">
                      -
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Right Padding Spacer so last tick reaches center needle */}
          <div className="shrink-0 w-1/2" />
        </div>

        {/* Gradient edge fades for horizontal depth - matching modal background */}
        <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-white dark:from-[#1E1B1B] to-transparent pointer-events-none z-10" />
        <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-white dark:from-[#1E1B1B] to-transparent pointer-events-none z-10" />
      </div>

      {/* LARGE VALUE DISPLAY WITH SMOOTH STEPPERS (-) AND (+) - FIXED POSITION */}
      <div className="my-1 flex items-center justify-center gap-3 w-full">
        <button
          type="button"
          onClick={() => adjustBy(-effectiveStep)}
          disabled={isZeroStock || value <= effectiveMin}
          className="w-11 h-11 shrink-0 rounded-2xl bg-stone-100 hover:bg-stone-200 dark:bg-[#282323] dark:hover:bg-[#342D2D] disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center text-stone-700 dark:text-stone-200 transition-all active:scale-95 cursor-pointer press-apple"
          title={`Decrease by ${effectiveStep}`}
        >
          <Minus className="w-5 h-5 stroke-[2.5]" />
        </button>

        <div className="w-44 sm:w-52 shrink-0 flex items-center justify-center">
          {isEditing && !isZeroStock ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                commitTypedValue();
              }}
              className="flex items-baseline justify-center gap-2 w-full"
            >
              <input
                ref={inputRef}
                type="number"
                step="any"
                min={effectiveMin}
                value={typedValue}
                onChange={(e) => {
                  setTypedValue(e.target.value);
                }}
                onBlur={commitTypedValue}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitTypedValue();
                  } else if (e.key === 'Escape') {
                    setIsEditing(false);
                  }
                }}
                className="text-4xl sm:text-5xl font-black text-stone-900 dark:text-white tabular-nums tracking-tight w-28 text-center bg-stone-100 dark:bg-[#282323] rounded-2xl px-1 py-1 border-2 border-epso-orange focus:outline-none"
              />
              <span className="text-xl sm:text-2xl font-extrabold text-epso-orange dark:text-amber-400">
                {unit}
              </span>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (isZeroStock) return;
                setTypedValue(String(value));
                setIsEditing(true);
              }}
              disabled={isZeroStock}
              className={`flex items-baseline justify-center gap-2 px-3 py-1 rounded-2xl transition-all press-apple border border-transparent w-full ${
                isZeroStock
                  ? 'cursor-not-allowed opacity-40'
                  : 'cursor-pointer group hover:bg-stone-100 dark:hover:bg-[#282323] hover:border-charcoal-border/40'
              }`}
              title={isZeroStock ? 'Stock is 0' : 'Click to manually type custom quantity'}
            >
              <div className="text-4xl sm:text-5xl font-black text-stone-900 dark:text-white tabular-nums tracking-tight">
                <CountUp
                  to={value}
                  digitEffect="slide"
                  duration={0.2}
                  separator=","
                  className="text-4xl sm:text-5xl font-black text-stone-900 dark:text-white tabular-nums"
                />
              </div>
              <span
                className={`text-xl sm:text-2xl font-extrabold ${
                  isZeroStock ? 'text-stone-400 dark:text-stone-500' : 'text-epso-orange dark:text-amber-400'
                }`}
              >
                {unit}
              </span>
              {!isZeroStock && (
                <span className="text-xs text-stone-400 group-hover:text-epso-orange font-bold ml-1 transition-colors">
                  ✏️
                </span>
              )}
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => adjustBy(effectiveStep)}
          disabled={isZeroStock || value >= effectiveMax}
          className="w-11 h-11 shrink-0 rounded-2xl bg-stone-100 hover:bg-stone-200 dark:bg-[#282323] dark:hover:bg-[#342D2D] disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center text-stone-700 dark:text-stone-200 transition-all active:scale-95 cursor-pointer press-apple"
          title={`Increase by ${effectiveStep}`}
        >
          <Plus className="w-5 h-5 stroke-[2.5]" />
        </button>
      </div>

      <p className="text-[10px] text-stone-400 dark:text-stone-500 font-semibold mb-1 font-malayalam">
        {isZeroStock
          ? (language === 'ml' ? 'സ്റ്റോക്ക് ലഭ്യമല്ല' : 'Out of Stock')
          : isEditing
          ? (language === 'ml' ? 'Enter അമർത്തി സ്ഥിരീകരിക്കുക' : 'Press Enter to save')
          : (language === 'ml' ? 'റൂളർ നീക്കുകയോ നമ്പറിൽ തൊട്ട് ടൈപ്പ് ചെയ്യുകയോ ചെയ്യാം' : 'Drag ruler or tap number to type')}
      </p>

      {/* Alert when selected measurement exceeds available stock */}
      {availableStock !== undefined && value > availableStock && (
        <div className="w-full my-1.5 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 text-amber-800 dark:text-amber-200 text-xs font-bold flex items-center justify-center gap-2 animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <span className="font-malayalam">
            {language === 'ml'
              ? `ബാക്കി ${availableStock} ${unit} മാത്രമേ ഉള്ളൂ..`
              : `Only ${availableStock} ${unit} remaining..`}
          </span>
        </div>
      )}

      {/* QUICK PRESET BUTTONS */}
      {presets.length > 0 && (
        <div
          className={`flex items-center justify-center gap-2 my-1.5 w-full ${
            isZeroStock ? 'opacity-30 pointer-events-none' : ''
          }`}
        >
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              disabled={isZeroStock}
              onClick={() => {
                if (isZeroStock) return;
                onChange(preset);
                scrollToValue(preset, true);
              }}
              className={`flex-1 py-2 rounded-xl text-xs sm:text-sm font-black transition-all active:scale-95 press-apple cursor-pointer ${
                value === preset && !isZeroStock
                  ? 'bg-gradient-to-r from-epso-red to-epso-orange text-white ring-2 ring-epso-orange/30'
                  : 'bg-stone-100 hover:bg-stone-200 dark:bg-[#282323] dark:hover:bg-[#342D2D] text-stone-700 dark:text-stone-300'
              }`}
            >
              {preset} {unit}
            </button>
          ))}
        </div>
      )}

      {/* BOTTOM ACTION BUTTONS: Back & Done in single line */}
      {(onConfirm || onClose) && (
        <div className="flex items-center justify-between w-full mt-3 pt-3 border-t border-charcoal-border/50 dark:border-[#2E2828]/50 gap-3">
          {onClose && (
            <button
              type="button"
              onClick={() => {
                if (isEditing) commitTypedValue();
                onClose();
              }}
              className="inline-flex items-center justify-center font-bold text-sm px-4 py-2.5 gap-1.5 rounded-xl text-charcoal dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-[#1E1B1B] transition-all duration-150 active:scale-[0.97] cursor-pointer select-none press-apple"
            >
              <ChevronLeft className="w-4 h-4 stroke-[2.5]" />
              <span>{backLabel}</span>
            </button>
          )}

          {onConfirm && (
            <button
              type="button"
              onClick={() => {
                if (isEditing) {
                  commitTypedValue();
                }
                onConfirm();
              }}
              className={`inline-flex items-center justify-center font-bold text-sm px-6 py-2.5 gap-2 rounded-xl transition-all duration-150 active:scale-[0.97] cursor-pointer select-none press-apple shadow-sm ${
                !onClose ? 'w-full' : 'flex-1'
              } ${
                isZeroStock
                  ? 'bg-stone-200 dark:bg-[#2A2525] text-stone-600 dark:text-stone-300 cursor-pointer hover:bg-stone-300 dark:hover:bg-[#322C2C]'
                  : availableStock !== undefined && value > availableStock
                  ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-xs'
                  : 'bg-gradient-to-r from-epso-red to-epso-orange hover:bg-epso-red-hover text-white'
              }`}
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>
                {isZeroStock
                  ? 'Close / തിരികെ പോകുക'
                  : availableStock !== undefined && value > availableStock
                  ? language === 'ml'
                    ? `ബാക്കി ${availableStock} ${unit} മാത്രമേ ഉള്ളൂ..`
                    : `Only ${availableStock} ${unit} remaining..`
                  : confirmLabel}
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

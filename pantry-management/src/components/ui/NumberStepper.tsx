import React from 'react';
import { TbMinus, TbPlus } from 'react-icons/tb';

interface NumberStepperProps {
  value: number;
  onChange: (val: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  unit?: string;
  disabled?: boolean;
}

export const NumberStepper: React.FC<NumberStepperProps> = ({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  label,
  unit,
  disabled = false,
}) => {
  const [rawInput, setRawInput] = React.useState<string | null>(null);

  const handleDecrement = () => {
    setRawInput(null);
    const next = Math.max(min, Number((value - step).toFixed(3)));
    onChange(next);
  };

  const handleIncrement = () => {
    setRawInput(null);
    const next = max !== undefined ? Math.min(max, Number((value + step).toFixed(3))) : Number((value + step).toFixed(3));
    onChange(next);
  };

  const handleManualInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setRawInput(text);
    if (text === '') {
      onChange(min);
      return;
    }
    const parsed = parseFloat(text);
    if (!isNaN(parsed)) {
      if (max !== undefined && parsed > max) {
        onChange(max);
      } else if (parsed < min) {
        onChange(min);
      } else {
        onChange(Number(parsed.toFixed(3)));
      }
    }
  };

  const handleBlur = () => {
    setRawInput(null);
  };

  return (
    <div className="w-full">
      {label && (
        <label className="block text-xs font-semibold text-charcoal dark:text-stone-300 mb-1.5 uppercase tracking-wider">
          {label}
        </label>
      )}
      <div className="flex items-center gap-1.5 bg-white dark:bg-[#1E1B1B] border border-charcoal-border dark:border-[#2E2828] rounded-xl p-1 transition-colors">
        <button
          type="button"
          onClick={handleDecrement}
          disabled={disabled || value <= min}
          className="w-10 h-10 flex items-center justify-center rounded-lg bg-stone-100 hover:bg-stone-200 dark:bg-[#282323] dark:hover:bg-[#342D2D] text-stone-800 dark:text-stone-200 disabled:opacity-30 disabled:pointer-events-none transition-colors active:scale-95 press-apple cursor-pointer"
          aria-label="Decrease quantity"
        >
          <TbMinus className="w-4 h-4" />
        </button>

        <div className="flex-1 flex items-center justify-center text-center">
          <input
            type="number"
            step={step}
            value={rawInput !== null ? rawInput : (value === 0 ? '' : value)}
            onChange={handleManualInput}
            onFocus={(e) => e.target.select()}
            onBlur={handleBlur}
            disabled={disabled}
            className="w-full text-center font-bold text-base text-charcoal dark:text-white bg-transparent focus:outline-none"
          />
          {unit && <span className="text-xs text-charcoal-muted dark:text-stone-400 pr-2 font-medium">{unit}</span>}
        </div>

        <button
          type="button"
          onClick={handleIncrement}
          disabled={disabled || (max !== undefined && value >= max)}
          className="w-10 h-10 flex items-center justify-center rounded-lg bg-stone-100 hover:bg-stone-200 dark:bg-[#282323] dark:hover:bg-[#342D2D] text-stone-800 dark:text-stone-200 disabled:opacity-30 disabled:pointer-events-none transition-colors active:scale-95 press-apple"
          aria-label="Increase quantity"
        >
          <TbPlus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

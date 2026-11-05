import React, { forwardRef } from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftAddon?: React.ReactNode;
  rightAddon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, leftAddon, rightAddon, className = '', id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-semibold text-charcoal dark:text-stone-300 mb-1.5 uppercase tracking-wider"
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftAddon && (
            <div className="absolute left-3 flex items-center pointer-events-none text-charcoal-muted dark:text-stone-400">
              {leftAddon}
            </div>
          )}
          <input
            id={inputId}
            ref={ref}
            onFocus={(e) => {
              if (props.type === 'number') {
                e.target.select();
              }
              props.onFocus?.(e);
            }}
            className={`w-full bg-white dark:bg-[#1E1B1B] border text-charcoal dark:text-stone-100 text-sm rounded-xl transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-epso-red min-h-[44px] px-3.5 py-2.5 ${
              leftAddon ? 'pl-9' : ''
            } ${rightAddon ? 'pr-12' : ''} ${
              error
                ? 'border-red-400 dark:border-red-600 focus:border-red-500 focus:ring-red-300/40'
                : 'border-charcoal-border dark:border-[#2E2828] hover:border-stone-400 dark:hover:border-stone-600'
            } disabled:bg-stone-100 dark:disabled:bg-[#141212] disabled:opacity-60 ${className}`}
            {...props}
          />
          {rightAddon && (
            <div className="absolute right-3 flex items-center text-xs font-medium text-charcoal-muted dark:text-stone-400">
              {rightAddon}
            </div>
          )}
        </div>
        {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400 font-medium">{error}</p>}
        {!error && helperText && (
          <p className="mt-1 text-xs text-charcoal-muted dark:text-stone-400">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

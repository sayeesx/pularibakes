import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'accent' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  isLoading?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  isLoading = false,
  icon,
  className = '',
  disabled,
  ...props
}) => {
  const baseStyles =
    'inline-flex items-center justify-center font-medium transition-all duration-150 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/30 active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none select-none press-apple';

  const variants = {
    primary:
      'bg-epso-red hover:bg-[#B02A1F] text-white shadow-sm active:bg-[#902017]',
    secondary:
      'bg-white dark:bg-[#1E1B1B] text-charcoal dark:text-stone-100 hover:bg-stone-50 dark:hover:bg-[#282323] border border-charcoal-border dark:border-[#2E2828]',
    outline:
      'bg-transparent text-charcoal dark:text-stone-100 hover:bg-stone-50 dark:hover:bg-[#282323] border border-charcoal-border dark:border-[#2E2828]',
    accent:
      'bg-epso-amber hover:bg-amber-600 text-stone-900 font-bold shadow-sm',
    danger:
      'bg-red-600 hover:bg-red-700 text-white shadow-sm active:bg-red-800',
    ghost:
      'bg-transparent text-charcoal dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-[#1E1B1B]',
  };

  const sizes = {
    sm: 'text-xs px-3 py-2 gap-1.5 min-h-[36px]',
    md: 'text-sm px-4 py-2.5 gap-2 min-h-[44px]',
    lg: 'text-base px-5 py-3 gap-2.5 min-h-[50px] font-semibold',
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${
        fullWidth ? 'w-full' : ''
      } ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <svg
          className="animate-spin -ml-1 mr-2 h-4 w-4 text-current"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      ) : icon ? (
        <span className="shrink-0">{icon}</span>
      ) : null}
      {children}
    </button>
  );
};

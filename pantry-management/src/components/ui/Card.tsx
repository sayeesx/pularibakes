import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  bordered?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  padding = 'md',
  bordered = true,
  className = '',
  ...props
}) => {
  const paddings = {
    none: 'p-0',
    sm: 'p-3',
    md: 'p-4 sm:p-5',
    lg: 'p-5 sm:p-6',
  };

  return (
    <div
      className={`bg-white dark:bg-[#1E1B1B] text-charcoal dark:text-stone-100 rounded-2xl ${bordered ? 'border border-charcoal-border/70 dark:border-[#2E2828]' : ''
        } ${paddings[padding]} apple-card ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  label?: string;
  className?: string;
  fullScreen?: boolean;
  color?: 'default' | 'orange';
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  label,
  className = '',
  fullScreen = false,
  color = 'default',
}) => {
  const sizeMap = {
    sm: 'w-5 h-5 border-2',
    md: 'w-8 h-8 border-[3px]',
    lg: 'w-10 h-10 border-4',
    xl: 'w-14 h-14 border-4',
  };

  const colorClass =
    color === 'orange'
      ? 'border-orange-200 dark:border-orange-950/80 border-t-epso-orange dark:border-t-epso-orange'
      : 'border-stone-200 dark:border-stone-800 border-t-epso-red dark:border-t-epso-orange';

  const spinner = (
    <div className={`flex flex-col items-center justify-center gap-2.5 ${className}`}>
      {/* Clean, simple, modern circular loading spinner ring */}
      <div
        className={`${sizeMap[size]} rounded-full ${colorClass} animate-spin shrink-0`}
      />

      {label && (
        <p className="text-xs font-semibold text-stone-600 dark:text-stone-300 tracking-tight">
          {label}
        </p>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/95 dark:bg-canvas-dark/95 transition-all">
        {spinner}
      </div>
    );
  }

  return spinner;
};

export const SkeletonLine: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div
      className={`animate-pulse bg-stone-200 dark:bg-stone-800 rounded-lg ${className}`}
    />
  );
};

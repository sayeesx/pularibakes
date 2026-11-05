import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  label?: string;
  className?: string;
  fullScreen?: boolean;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  label,
  className = '',
  fullScreen = false,
}) => {
  const sizeMap = {
    sm: 'w-5 h-5 border-2',
    md: 'w-8 h-8 border-3',
    lg: 'w-10 h-10 border-3',
    xl: 'w-14 h-14 border-4',
  };

  const spinner = (
    <div className={`flex flex-col items-center justify-center gap-2.5 ${className}`}>
      {/* Clean, smooth circular loading spinner ring matching production */}
      <div
        className={`${sizeMap[size]} rounded-full border-stone-200 dark:border-stone-800 border-t-red-600 dark:border-t-amber-500 animate-spin shrink-0`}
      />

      {label && (
        <p className="text-xs font-semibold text-stone-600 dark:text-stone-300 tracking-tight font-malayalam">
          {label}
        </p>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/95 dark:bg-[#121010]/95 transition-all">
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

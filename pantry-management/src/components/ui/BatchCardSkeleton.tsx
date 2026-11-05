import React from 'react';

interface BatchCardSkeletonProps {
  count?: number;
}

export const BatchCardSkeleton: React.FC<BatchCardSkeletonProps> = ({ count = 3 }) => {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="bg-white dark:bg-[#1E1B1B] rounded-2xl border border-charcoal-border/70 dark:border-[#2E2828] p-4 space-y-3 shadow-2xs shimmer-wrapper select-none"
        >
          {/* Top row */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              {/* Batch number avatar skeleton */}
              <div className="w-10 h-10 rounded-xl bg-stone-200 dark:bg-[#282323] shrink-0" />
              <div className="space-y-2 pt-0.5">
                <div className="h-4 w-36 sm:w-48 bg-stone-200 dark:bg-[#282323] rounded-md" />
                <div className="h-3 w-44 sm:w-56 bg-stone-100 dark:bg-[#242020] rounded-md" />
              </div>
            </div>

            {/* Output Qty */}
            <div className="flex flex-col items-end space-y-1">
              <div className="h-5 w-16 bg-stone-200 dark:bg-[#282323] rounded-md" />
              <div className="h-2.5 w-9 bg-stone-100 dark:bg-[#242020] rounded-md" />
            </div>
          </div>

          {/* Middle packed packet summary strip skeleton */}
          <div className="h-10 bg-stone-50 dark:bg-[#141212] rounded-xl border border-charcoal-border/50 dark:border-[#282222]" />

          {/* Bottom actions skeleton */}
          <div className="flex items-center justify-between pt-1">
            <div className="h-3.5 w-20 bg-stone-100 dark:bg-[#242020] rounded-md" />
            <div className="h-8 w-28 bg-stone-200 dark:bg-[#282323] rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
};

interface GridCardSkeletonProps {
  count?: number;
  columns?: string;
}

export const GridCardSkeleton: React.FC<GridCardSkeletonProps> = ({
  count = 4,
  columns = 'grid-cols-1 sm:grid-cols-2',
}) => {
  return (
    <div className={`grid ${columns} gap-3`}>
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="bg-white dark:bg-[#1E1B1B] rounded-2xl border border-charcoal-border/70 dark:border-[#2E2828] p-4 space-y-3 shadow-2xs shimmer-wrapper select-none"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-stone-200 dark:bg-[#282323] shrink-0" />
              <div className="space-y-1.5">
                <div className="h-4 w-28 bg-stone-200 dark:bg-[#282323] rounded-md" />
                <div className="h-3 w-36 bg-stone-100 dark:bg-[#242020] rounded-md" />
              </div>
            </div>
            <div className="flex flex-col items-end space-y-1">
              <div className="h-5 w-14 bg-stone-200 dark:bg-[#282323] rounded-md" />
              <div className="h-2.5 w-8 bg-stone-100 dark:bg-[#242020] rounded-md" />
            </div>
          </div>
          <div className="h-8 bg-stone-50 dark:bg-[#141212] rounded-xl border border-charcoal-border/50 dark:border-[#282222]" />
        </div>
      ))}
    </div>
  );
};

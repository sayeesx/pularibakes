import React, { useEffect } from 'react';
import { RefreshCw, AlertTriangle, Sparkles } from 'lucide-react';

interface CompulsoryUpdateModalProps {
  isOpen: boolean;
  isUpdating: boolean;
  newVersion?: {
    buildId: string;
    commitHash?: string;
    builtAt?: string;
  } | null;
  onUpdate: () => void;
}

export const CompulsoryUpdateModal: React.FC<CompulsoryUpdateModalProps> = ({
  isOpen,
  isUpdating,
  newVersion,
  onUpdate,
}) => {
  // Prevent escape key dismissal and lock scrolling when modal is open
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[99999] bg-black/85 flex items-center justify-center p-4 select-none"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="compulsory-update-title"
      aria-describedby="compulsory-update-description"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Modal Card - strictly WITHOUT shadows and WITHOUT animation as requested */}
      <div
        className="w-full max-w-md bg-white dark:bg-[#181515] border-2 border-[#C6382B] rounded-2xl p-6 sm:p-7 text-center relative overflow-hidden"
        style={{ boxShadow: 'none' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Accent Stripe */}
        <div className="absolute top-0 inset-x-0 h-1 bg-[#C6382B]" />

        {/* Update Icon Badge (no drop shadows, no animation) */}
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 flex items-center justify-center text-[#C6382B]">
          <RefreshCw
            className={`w-8 h-8 ${isUpdating ? 'animate-spin' : ''}`}
            strokeWidth={2.2}
          />
        </div>

        {/* Status Badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100/70 dark:bg-red-950/60 border border-red-200 dark:border-red-900/50 text-[#C6382B] text-xs font-semibold mb-3">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Update Compulsory • അപ്‌ഡേറ്റ് നിർബന്ധമാണ്</span>
        </div>

        {/* Title */}
        <h2
          id="compulsory-update-title"
          className="text-xl sm:text-2xl font-black text-stone-900 dark:text-white font-malayalam leading-tight mb-2"
        >
          അപ്‌ഡേറ്റ് നിർബന്ധമാണ്
          <span className="block text-sm font-sans font-bold text-stone-600 dark:text-stone-300 mt-1">
            Update Compulsory
          </span>
        </h2>

        {/* Description */}
        <p
          id="compulsory-update-description"
          className="text-xs sm:text-sm text-stone-600 dark:text-stone-300 font-malayalam leading-relaxed mb-4"
        >
          സിസ്റ്റത്തിലേക്ക് പുതിയ മാറ്റങ്ങൾ വിന്യസിച്ചിരിക്കുന്നു. തുടർന്ന് പ്രവർത്തിക്കാൻ ദയവായി ഇപ്പോൾ അപ്‌ഡേറ്റ് ചെയ്യുക.
        </p>

        {/* Version metadata box */}
        <div className="mb-5 p-3 rounded-xl bg-stone-100 dark:bg-stone-900/70 border border-stone-200 dark:border-stone-800 text-left text-xs text-stone-700 dark:text-stone-300 space-y-1">
          <div className="flex items-center justify-between font-mono">
            <span className="text-stone-500 dark:text-stone-400">Status:</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              Live Deployment Ready
            </span>
          </div>
          {newVersion?.commitHash && newVersion.commitHash !== 'unknown' && (
            <div className="flex items-center justify-between font-mono">
              <span className="text-stone-500 dark:text-stone-400">Commit:</span>
              <span className="font-bold text-stone-900 dark:text-stone-100">{newVersion.commitHash}</span>
            </div>
          )}
          {newVersion?.builtAt && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-stone-500 dark:text-stone-400">Deployed:</span>
              <span className="text-stone-700 dark:text-stone-300">
                {new Date(newVersion.builtAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
          )}
        </div>

        {/* Compulsory warning alert */}
        <div className="flex items-center gap-2 p-2.5 mb-5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 text-amber-800 dark:text-amber-300 text-left text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="font-malayalam leading-tight">
            തുടർന്നു പ്രവർത്തിക്കാൻ അപ്‌ഡേറ്റ് നിർബന്ധമാണ് (Update Compulsory).
          </span>
        </div>

        {/* Action Button - STRICTLY WITHOUT SHADOWS */}
        <button
          type="button"
          disabled={isUpdating}
          onClick={onUpdate}
          className="w-full py-3.5 px-4 rounded-xl font-bold text-white bg-[#C6382B] hover:bg-[#b02f23] active:bg-[#99251a] disabled:opacity-75 disabled:cursor-wait transition-colors border border-[#a8291c] flex items-center justify-center gap-2 text-sm sm:text-base font-malayalam cursor-pointer"
          style={{ boxShadow: 'none' }}
        >
          <RefreshCw className={`w-5 h-5 ${isUpdating ? 'animate-spin' : ''}`} />
          <span>
            {isUpdating
              ? 'Updating...'
              : 'Update Now'}
          </span>
        </button>
      </div>
    </div>
  );
};

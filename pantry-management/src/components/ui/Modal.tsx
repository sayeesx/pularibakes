import React, { useEffect } from 'react';
import { TbX } from 'react-icons/tb';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  expanded?: boolean;
  overlay?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth,
  size,
  expanded = false,
  overlay,
}) => {
  const effectiveMaxWidth = maxWidth || size || 'md';
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      document.body.classList.add('modal-open');
      document.documentElement.classList.add('modal-open');
    } else {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      document.body.classList.remove('modal-open');
      document.documentElement.classList.remove('modal-open');
    }
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      document.body.classList.remove('modal-open');
      document.documentElement.classList.remove('modal-open');
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const maxWidths = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end landscape:items-center sm:items-center justify-center p-0 landscape:p-3 sm:p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 dark:bg-black/85"
        onClick={onClose}
      />

      {/* Sheet / Dialog */}
      <div
        className={`relative w-full ${maxWidths[effectiveMaxWidth]} bg-white dark:bg-[#1E1B1B] text-charcoal dark:text-stone-100 border border-charcoal-border dark:border-[#2E2828] rounded-t-3xl landscape:rounded-2xl sm:rounded-2xl ${
          expanded ? 'h-[94dvh] landscape:h-[88dvh] sm:h-[88dvh] max-h-[94dvh]' : 'max-h-[90dvh] landscape:max-h-[88dvh]'
        } flex flex-col z-10 overflow-hidden`}
      >
        {/* Mobile handle indicator */}
        <div className="w-12 h-1 bg-stone-300 dark:bg-stone-700 rounded-full mx-auto mt-2.5 landscape:hidden sm:hidden" />

        {/* Header */}
        <div className="flex items-start justify-between p-3.5 sm:p-5 border-b border-charcoal-border/70 dark:border-[#2E2828] shrink-0">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-charcoal dark:text-white leading-snug">{title}</h3>
            {description && (
              <p className="text-xs text-charcoal-muted dark:text-stone-400 mt-0.5">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-charcoal-muted dark:text-stone-400 hover:text-charcoal dark:hover:text-white hover:bg-stone-100 dark:hover:bg-[#282323] transition-colors"
          >
            <TbX className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div
          className="p-3.5 sm:p-6 overflow-y-auto space-y-4 overscroll-contain flex-1"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {children}
        </div>

        {/* Pinned Footer attached directly to the bottom margin with zero gap */}
        {footer && (
          <div className="shrink-0 p-3 sm:p-4 bg-white dark:bg-[#1E1B1B] border-t border-charcoal-border/70 dark:border-[#2E2828] z-20 pb-safe">
            {footer}
          </div>
        )}

        {/* In-modal overlay (e.g. success animation with white background directly on the modal) */}
        {overlay}
      </div>
    </div>
  );
};

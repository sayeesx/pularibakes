import React from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { TbAlertTriangle } from 'react-icons/tb';

interface ConfirmationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  confirmText?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'primary';
  confirmVariant?: 'danger' | 'warning' | 'primary';
  isLoading?: boolean;
}

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  confirmText,
  cancelLabel = 'Cancel',
  variant,
  confirmVariant,
  isLoading = false,
}) => {
  const effectiveConfirmLabel = confirmLabel || confirmText || 'Confirm';
  const effectiveVariant = variant || confirmVariant || 'danger';
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="sm">
      <div className="flex items-start gap-3 py-1">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
            effectiveVariant === 'danger'
              ? 'bg-red-100 dark:bg-red-950/50 text-red-600 dark:text-red-400'
              : effectiveVariant === 'warning'
              ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400'
              : 'bg-red-50 dark:bg-red-950/50 text-epso-red dark:text-red-400'
          }`}
        >
          <TbAlertTriangle className="w-5 h-5" />
        </div>
        <div className="text-sm text-charcoal dark:text-stone-200 leading-relaxed">{message}</div>
      </div>

      <div className="flex items-center gap-3 pt-3 border-t border-charcoal-border/60 dark:border-[#2E2828]">
        <Button variant="secondary" fullWidth onClick={onClose} disabled={isLoading}>
          {cancelLabel}
        </Button>
        <Button
          variant={effectiveVariant === 'danger' ? 'danger' : 'primary'}
          fullWidth
          onClick={onConfirm}
          isLoading={isLoading}
        >
          {effectiveConfirmLabel}
        </Button>
      </div>
    </Modal>
  );
};

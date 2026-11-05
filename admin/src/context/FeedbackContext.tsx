import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  FiCheckCircle,
  FiAlertCircle,
  FiAlertTriangle,
  FiInfo,
  FiX,
  FiTrash2,
} from 'react-icons/fi';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  title?: string;
  duration?: number;
}

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
}

interface FeedbackContextType {
  showToast: (message: string, type?: ToastType, title?: string, duration?: number) => void;
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
  alert: (message: string, type?: ToastType, title?: string) => Promise<void>;
}

const FeedbackContext = createContext<FeedbackContextType | undefined>(undefined);

export const FeedbackProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    options: ConfirmOptions;
    resolve: (val: boolean) => void;
  } | null>(null);

  // Toast handler
  const showToast = useCallback((message: string, type: ToastType = 'success', title?: string, duration = 3500) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newItem: ToastItem = { id, message, type, title, duration };

    setToasts((prev) => [...prev, newItem]);

    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Confirm dialog handler returning Promise<boolean>
  const confirm = useCallback((opts: ConfirmOptions | string): Promise<boolean> => {
    const options: ConfirmOptions =
      typeof opts === 'string'
        ? { message: opts, title: 'ഉറപ്പാക്കുക (Confirmation)', isDestructive: true }
        : {
            title: opts.title || 'ഉറപ്പാക്കുക (Confirmation)',
            message: opts.message,
            confirmLabel: opts.confirmLabel || 'ശരി (Confirm)',
            cancelLabel: opts.cancelLabel || 'റദ്ദാക്കുക (Cancel)',
            isDestructive: opts.isDestructive ?? true,
          };

    return new Promise<boolean>((resolve) => {
      setConfirmState({
        isOpen: true,
        options,
        resolve,
      });
    });
  }, []);

  // Alert dialog handler returning Promise<void>
  const alert = useCallback((message: string, type: ToastType = 'info', title?: string): Promise<void> => {
    showToast(message, type, title);
    return Promise.resolve();
  }, [showToast]);

  const handleConfirmClose = (confirmed: boolean) => {
    if (confirmState) {
      confirmState.resolve(confirmed);
      setConfirmState(null);
    }
  };

  // Keyboard escape & enter listener for confirm dialog
  useEffect(() => {
    if (!confirmState?.isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleConfirmClose(false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirmClose(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmState]);

  return (
    <FeedbackContext.Provider value={{ showToast, confirm, alert }}>
      {children}

      {/* Admin Themed Toasts Portal */}
      {typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed top-5 right-5 z-[10000] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-3 select-none">
            {toasts.map((t) => {
              const isSuccess = t.type === 'success';
              const isError = t.type === 'error';
              const isWarning = t.type === 'warning';

              return (
                <div
                  key={t.id}
                  className={`pointer-events-auto flex items-start gap-3 p-4 rounded-2xl shadow-xl border backdrop-blur-md transition-all duration-300 animate-in slide-in-from-top-3 ${
                    isSuccess
                      ? 'bg-emerald-950/90 text-white border-emerald-500/50 shadow-emerald-950/30'
                      : isError
                      ? 'bg-red-950/90 text-white border-red-500/50 shadow-red-950/30'
                      : isWarning
                      ? 'bg-amber-950/90 text-white border-amber-500/50 shadow-amber-950/30'
                      : 'bg-stone-900/95 text-white border-stone-700 shadow-stone-950/40'
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    {isSuccess && <FiCheckCircle className="w-5 h-5 text-emerald-400" />}
                    {isError && <FiAlertCircle className="w-5 h-5 text-red-400" />}
                    {isWarning && <FiAlertTriangle className="w-5 h-5 text-amber-400" />}
                    {!isSuccess && !isError && !isWarning && <FiInfo className="w-5 h-5 text-blue-400" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    {t.title && (
                      <h4 className="text-xs font-black tracking-wide uppercase font-sans mb-0.5">
                        {t.title}
                      </h4>
                    )}
                    <p className="text-xs font-medium font-malayalam leading-snug break-words">
                      {t.message}
                    </p>
                  </div>

                  <button
                    onClick={() => removeToast(t.id)}
                    className="p-1 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors shrink-0 cursor-pointer"
                  >
                    <FiX className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>,
          document.body
        )}

      {/* Admin Themed Confirm Modal Portal */}
      {confirmState?.isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
            {/* Backdrop with Blur */}
            <div
              className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
              onClick={() => handleConfirmClose(false)}
            />

            {/* Modal Box in Admin Theme */}
            <div className="relative w-full max-w-md bg-white dark:bg-[#1E1B1B] rounded-3xl p-6 sm:p-7 border border-stone-200 dark:border-[#2E2828] shadow-2xl space-y-5 animate-in zoom-in-95 duration-150">
              <div className="flex items-start gap-4">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                    confirmState.options.isDestructive
                      ? 'bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400'
                      : 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {confirmState.options.isDestructive ? (
                    <FiTrash2 className="w-6 h-6" />
                  ) : (
                    <FiAlertTriangle className="w-6 h-6" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <h3 className="text-base sm:text-lg font-black text-stone-900 dark:text-white font-malayalam leading-snug">
                    {confirmState.options.title || 'സ്ഥിരീകരിക്കുക'}
                  </h3>
                  <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-300 font-malayalam mt-1 leading-relaxed break-words whitespace-pre-line">
                    {confirmState.options.message}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-100 dark:border-[#282323]">
                <button
                  type="button"
                  onClick={() => handleConfirmClose(false)}
                  className="px-4 py-2.5 rounded-xl border border-stone-200 dark:border-[#2E2828] bg-stone-100 hover:bg-stone-200 dark:bg-[#282323] dark:hover:bg-[#342D2D] text-stone-700 dark:text-stone-300 font-bold text-xs sm:text-sm font-malayalam transition-colors cursor-pointer press-apple"
                >
                  {confirmState.options.cancelLabel || 'റദ്ദാക്കുക'}
                </button>

                <button
                  type="button"
                  onClick={() => handleConfirmClose(true)}
                  className={`px-5 py-2.5 rounded-xl text-white font-black text-xs sm:text-sm font-malayalam shadow-sm transition-all cursor-pointer press-apple ${
                    confirmState.options.isDestructive
                      ? 'bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700'
                      : 'bg-epso-red hover:bg-epso-red-hover dark:bg-amber-500 dark:text-stone-950 dark:hover:bg-amber-600'
                  }`}
                >
                  {confirmState.options.confirmLabel || 'ശരി (Delete)'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </FeedbackContext.Provider>
  );
};

export const useFeedback = () => {
  const context = useContext(FeedbackContext);
  if (!context) {
    throw new Error('useFeedback must be used within a FeedbackProvider');
  }
  return context;
};

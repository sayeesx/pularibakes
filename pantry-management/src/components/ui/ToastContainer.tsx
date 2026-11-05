import React from 'react';
import { useApp } from '../../context/AppContext';
import { TbCircleCheck, TbAlertCircle, TbInfoCircle, TbCircleX, TbX } from 'react-icons/tb';

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useApp();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 left-4 sm:left-auto sm:w-96 z-[99999] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => {
        const icons = {
          success: <TbCircleCheck className="w-5 h-5 text-emerald-500 shrink-0" />,
          error: <TbCircleX className="w-5 h-5 text-red-500 shrink-0" />,
          warning: <TbAlertCircle className="w-5 h-5 text-amber-500 shrink-0" />,
          info: <TbInfoCircle className="w-5 h-5 text-epso-orange shrink-0" />,
        };

        const bgColors = {
          success: 'bg-white dark:bg-[#1E1B1B] border-emerald-300 dark:border-emerald-800 text-charcoal dark:text-stone-100 shadow-xl',
          error: 'bg-white dark:bg-[#1E1B1B] border-red-300 dark:border-red-900 text-charcoal dark:text-stone-100 shadow-xl',
          warning: 'bg-white dark:bg-[#1E1B1B] border-amber-300 dark:border-amber-800 text-charcoal dark:text-stone-100 shadow-xl',
          info: 'bg-white dark:bg-[#1E1B1B] border-orange-300 dark:border-orange-800 text-charcoal dark:text-stone-100 shadow-xl',
        };

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center justify-between p-3.5 rounded-xl border shadow-lg ${bgColors[toast.type]} transition-all animate-in slide-in-from-top-2 duration-200`}
          >
            <div className="flex items-center gap-2.5">
              {icons[toast.type]}
              <p className="text-xs sm:text-sm font-medium">{toast.message}</p>
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-stone-400 hover:text-stone-800 dark:hover:text-stone-100 p-1 rounded-lg ml-2 press-apple"
            >
              <TbX className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

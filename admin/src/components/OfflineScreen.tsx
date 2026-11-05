import React, { useState } from 'react';
import { FiRefreshCw } from 'react-icons/fi';

interface OfflineScreenProps {
  onRetry?: () => void;
}

export const OfflineScreen: React.FC<OfflineScreenProps> = ({ onRetry }) => {
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await fetch('/favicon.png', { cache: 'no-store', method: 'HEAD' });
      if (onRetry) {
        onRetry();
      } else {
        window.location.reload();
      }
    } catch {
      setTimeout(() => setIsRetrying(false), 600);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center p-6 bg-[#F8F9FA] dark:bg-[#141212] text-stone-800 dark:text-stone-200 select-none animate-in fade-in duration-200">
      <div className="w-full max-w-sm flex flex-col items-center text-center">
        {/* Pulari Bakes Logo */}
        <div className="mb-6 flex justify-center">
          <img
            src="/pulari-logo.jpg"
            alt="Pulari Bakes"
            className="h-16 w-16 rounded-2xl object-cover filter grayscale opacity-60 dark:opacity-40"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
        </div>

        {/* Animated WiFi Pulse Icon */}
        <div className="relative flex items-center justify-center w-20 h-20 mb-6">
          <div className="absolute inset-0 rounded-full bg-stone-300/40 dark:bg-stone-800/40 animate-ping opacity-30" />
          <div className="w-16 h-16 rounded-full bg-stone-200 dark:bg-[#201D1D] flex items-center justify-center shadow-inner">
            <svg
              className="w-8 h-8 text-stone-500 dark:text-stone-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
              <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
              <path d="M10.71 5.05A16 16 0 0 1 22.58 9" />
              <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
              <line x1="12" y1="20" x2="12.01" y2="20" strokeWidth="3" />
            </svg>
          </div>
        </div>

        {/* Simple Plain Malayalam Text */}
        <h2 className="text-lg font-bold font-malayalam text-stone-900 dark:text-white mb-2">
          നെറ്റ്‌വർക്ക് കണക്ഷൻ ഇല്ല
        </h2>
        <p className="text-xs text-stone-500 dark:text-stone-400 font-malayalam mb-8 max-w-xs leading-relaxed">
          ഇന്റർനെറ്റ് കണക്ഷൻ നഷ്ടപ്പെട്ടു. നെറ്റ്‌വർക്ക് വന്ന ശേഷം വീണ്ടും ശ്രമിക്കുക.
        </p>

        {/* Simple Retry Button */}
        <button
          onClick={handleRetry}
          disabled={isRetrying}
          className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-stone-900 dark:bg-white text-white dark:text-stone-900 font-bold text-sm font-malayalam shadow-md active:scale-95 transition-all cursor-pointer disabled:opacity-50"
        >
          <FiRefreshCw className={`w-4 h-4 ${isRetrying ? 'animate-spin' : ''}`} />
          <span>{isRetrying ? 'പരിശോധിക്കുന്നു...' : 'വീണ്ടും ശ്രമിക്കുക'}</span>
        </button>
      </div>
    </div>
  );
};

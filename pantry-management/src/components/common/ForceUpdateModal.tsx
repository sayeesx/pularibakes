import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { TbRefresh, TbAlertTriangle, TbSparkles } from 'react-icons/tb';

interface VersionInfo {
  buildId?: string;
  version?: string;
  commit?: string;
  builtAt?: string;
}

const STORAGE_KEY_PENDING = 'pulari_pantry_pending_update';
const STORAGE_KEY_ACK = 'pulari_pantry_ack_build';

export const ForceUpdateModal: React.FC = () => {
  const { language } = useLanguage();

  // If user previously saw an update and manually reloaded, keep modal open until they click Update
  const [hasNewVersion, setHasNewVersion] = useState<boolean>(() => {
    try {
      const pending = localStorage.getItem(STORAGE_KEY_PENDING);
      return Boolean(pending);
    } catch {
      return false;
    }
  });

  const [newVersionInfo, setNewVersionInfo] = useState<VersionInfo | null>(() => {
    try {
      const pending = localStorage.getItem(STORAGE_KEY_PENDING);
      if (pending) return JSON.parse(pending);
    } catch {
      // ignore
    }
    return null;
  });

  const [isUpdating, setIsUpdating] = useState<boolean>(false);

  // App's embedded build identifier
  const currentBuildIdRef = useRef<string>(
    typeof __APP_BUILD_ID__ !== 'undefined'
      ? __APP_BUILD_ID__
      : typeof __APP_COMMIT__ !== 'undefined'
      ? __APP_COMMIT__
      : '1.0.0'
  );

  const checkForUpdate = useCallback(async () => {
    if (isUpdating) return;

    try {
      const response = await fetch(`/version.json?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      });

      if (!response.ok) return;

      const remoteData: VersionInfo = await response.json();
      if (!remoteData) return;

      const remoteId = remoteData.buildId || remoteData.commit || remoteData.version;
      if (!remoteId) return;

      const runningId = currentBuildIdRef.current;
      const ackId = localStorage.getItem(STORAGE_KEY_ACK);

      const isDifferentFromRunning = runningId && remoteId !== runningId;
      const isDifferentFromAck = ackId && remoteId !== ackId;

      if (!runningId) {
        currentBuildIdRef.current = remoteId;
      }

      if (!ackId) {
        // First visit
        localStorage.setItem(STORAGE_KEY_ACK, remoteId);
      } else if (isDifferentFromRunning || isDifferentFromAck) {
        // New deployment detected
        try {
          localStorage.setItem(STORAGE_KEY_PENDING, JSON.stringify(remoteData));
        } catch {
          // ignore
        }
        setNewVersionInfo(remoteData);
        setHasNewVersion(true);
      }
    } catch {
      // Ignore network errors
    }
  }, [isUpdating]);

  useEffect(() => {
    // Check INSTANTLY on mount
    checkForUpdate();

    // High frequency 5-second check
    const intervalTimer = setInterval(checkForUpdate, 5000);

    const handleFocus = () => checkForUpdate();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkForUpdate();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        checkForUpdate();
      });
    }

    return () => {
      clearInterval(intervalTimer);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [checkForUpdate]);

  // Trap escape key: update is compulsory, no closing allowed
  useEffect(() => {
    if (!hasNewVersion) return;
    const preventEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', preventEscape, true);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', preventEscape, true);
    };
  }, [hasNewVersion]);

  const handleForceReload = async () => {
    setIsUpdating(true);
    try {
      const remoteId = newVersionInfo?.buildId || newVersionInfo?.commit || newVersionInfo?.version;
      if (remoteId) {
        localStorage.setItem(STORAGE_KEY_ACK, remoteId);
      }
      localStorage.removeItem(STORAGE_KEY_PENDING);

      // 1. Tell all waiting service workers to skip waiting
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          if (reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
          await reg.unregister();
        }
      }

      // 2. Clear all web caches to ensure clean hot reload of bundle
      if ('caches' in window) {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map((k) => caches.delete(k)));
      }
    } catch {
      // Continue to reload even if cache clearing errors
    }

    // 3. Force reload page with timestamp query param
    setTimeout(() => {
      const cleanUrl = window.location.origin + window.location.pathname + `?_hot_reload=${Date.now()}`;
      window.location.replace(cleanUrl);
    }, 150);
  };

  if (!hasNewVersion) return null;

  return (
    <div
      className="fixed inset-0 z-[999999] bg-stone-950/85 flex items-center justify-center p-4 sm:p-6 select-none"
      role="dialog"
      aria-modal="true"
      style={{ boxShadow: 'none' }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Modal card: STRICTLY NO SHADOWS AND NO ANIMATIONS */}
      <div
        className="w-full max-w-md bg-white dark:bg-[#1E1B1B] rounded-2xl p-6 sm:p-7 border-2 border-[#C6382B] space-y-4 text-center relative overflow-hidden"
        style={{ boxShadow: 'none' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Accent Stripe */}
        <div className="absolute top-0 inset-x-0 h-1 bg-[#C6382B]" />

        {/* Static Badge Icon (No bounce, no ping, no shadow) */}
        <div className="w-16 h-16 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-[#C6382B] flex items-center justify-center mx-auto">
          <TbRefresh className={`w-8 h-8 stroke-[2.2] ${isUpdating ? 'animate-spin' : ''}`} />
        </div>

        {/* Title and Badge */}
        <div className="space-y-1.5">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100/70 dark:bg-red-950/60 border border-red-200 dark:border-red-900/50 text-[#C6382B] text-xs font-bold uppercase tracking-wider font-sans">
            <TbSparkles className="w-3.5 h-3.5" />
            <span>Update Compulsory</span>
          </span>

          <h2 className="text-xl sm:text-2xl font-black text-stone-900 dark:text-white leading-tight font-malayalam">
            {language === 'ml'
              ? 'അപ്‌ഡേറ്റ് നിർബന്ധമാണ്'
              : 'Update Compulsory'}
          </h2>
        </div>

        {/* Compulsory message */}
        <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-300 font-medium font-malayalam leading-relaxed">
          {language === 'ml'
            ? 'സിസ്റ്റത്തിൽ പുതിയ മാറ്റങ്ങൾ വിന്യസിച്ചിരിക്കുന്നു. തുടർന്ന് പ്രവർത്തിക്കാൻ ദയവായി ഇപ്പോൾ അപ്‌ഡേറ്റ് ചെയ്യുക.'
            : 'A new version has been deployed. Update compulsory.'}
        </p>

        {/* Compulsory warning banner */}
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 text-amber-800 dark:text-amber-300 text-left text-xs">
          <TbAlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="font-malayalam leading-tight">
            {language === 'ml'
              ? 'തുടർന്നു പ്രവർത്തിക്കാൻ അപ്‌ഡേറ്റ് നിർബന്ധമാണ്.'
              : 'This update is required to continue.'}
          </span>
        </div>

        {/* Compulsory Update Button: STRICTLY NO SHADOWS */}
        <div className="pt-1">
          <button
            type="button"
            onClick={handleForceReload}
            disabled={isUpdating}
            className="w-full py-3.5 px-4 rounded-xl font-bold text-white bg-[#C6382B] hover:bg-[#b02f23] active:bg-[#99251a] disabled:opacity-75 disabled:cursor-wait transition-colors border border-[#a8291c] flex items-center justify-center gap-2 text-sm sm:text-base font-malayalam cursor-pointer"
            style={{ boxShadow: 'none' }}
          >
            <TbRefresh className={`w-5 h-5 stroke-[2.5] ${isUpdating ? 'animate-spin' : ''}`} />
            <span>
              {isUpdating
                ? 'Updating...'
                : 'Update Now'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

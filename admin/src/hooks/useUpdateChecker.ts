import { useState, useEffect, useCallback, useRef } from 'react';
import { dbCache } from '../services/dbCache';

interface VersionInfo {
  buildId: string;
  commitHash?: string;
  builtAt?: string;
}

const STORAGE_KEY_PENDING = 'pulari_admin_pending_update';
const STORAGE_KEY_ACK = 'pulari_admin_ack_build';

export function useUpdateChecker() {
  const [hasUpdate, setHasUpdate] = useState<boolean>(() => {
    // Check if an update was already pending before manual reload
    try {
      const pending = localStorage.getItem(STORAGE_KEY_PENDING);
      return Boolean(pending);
    } catch {
      return false;
    }
  });

  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [newVersion, setNewVersion] = useState<VersionInfo | null>(() => {
    try {
      const pending = localStorage.getItem(STORAGE_KEY_PENDING);
      if (pending) return JSON.parse(pending);
    } catch {
      // ignore
    }
    return null;
  });

  // Running application's build ID injected at build time by Vite
  const currentBuildIdRef = useRef<string>(
    typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : ''
  );

  const checkVersion = useCallback(async () => {
    if (isUpdating) return;

    try {
      const res = await fetch(`/version.json?_t=${Date.now()}`, {
        method: 'GET',
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      });

      if (!res.ok) return;

      const data: VersionInfo = await res.json();
      if (!data || !data.buildId) return;

      const runningId = currentBuildIdRef.current;
      const ackId = localStorage.getItem(STORAGE_KEY_ACK);

      // If user has not acknowledged this new version yet, or runningId is different
      const isDifferentFromRunning = runningId && data.buildId !== runningId;
      const isDifferentFromAck = ackId && data.buildId !== ackId;

      if (!runningId) {
        currentBuildIdRef.current = data.buildId;
      }

      if (!ackId) {
        // First ever visit: acknowledge current live build
        localStorage.setItem(STORAGE_KEY_ACK, data.buildId);
      } else if (isDifferentFromRunning || isDifferentFromAck) {
        // A new deployment is live!
        try {
          localStorage.setItem(STORAGE_KEY_PENDING, JSON.stringify(data));
        } catch {
          // ignore
        }
        setNewVersion(data);
        setHasUpdate(true);
      }
    } catch {
      // Safely ignore network errors
    }
  }, [isUpdating]);

  useEffect(() => {
    // 1. Check INSTANTLY on mount without any delay
    checkVersion();

    // 2. High-frequency background polling every 5 seconds to catch deployments instantly
    const interval = setInterval(checkVersion, 5000);

    // 3. Immediate check on tab focus or visibility change
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkVersion();
      }
    };

    const handleFocus = () => {
      checkVersion();
    };

    const handleOnline = () => {
      checkVersion();
    };

    // 4. Catch Vite dynamic import chunk 404s
    const handleError = (e: ErrorEvent) => {
      const msg = e?.message || '';
      if (
        msg.includes('Failed to fetch dynamically imported module') ||
        msg.includes('Importing a module script failed') ||
        msg.includes('error loading dynamically imported module')
      ) {
        setHasUpdate(true);
      }
    };

    const handleUnhandledRejection = (e: PromiseRejectionEvent) => {
      const msg = String(e?.reason?.message || e?.reason || '');
      if (
        msg.includes('Failed to fetch dynamically imported module') ||
        msg.includes('Importing a module script failed') ||
        msg.includes('error loading dynamically imported module')
      ) {
        setHasUpdate(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [checkVersion]);

  // Compulsory update execution: clear all caches, unregister service workers, and hard reload
  const applyUpdateAndClearCache = useCallback(async () => {
    setIsUpdating(true);

    try {
      if (newVersion?.buildId) {
        localStorage.setItem(STORAGE_KEY_ACK, newVersion.buildId);
      }
      localStorage.removeItem(STORAGE_KEY_PENDING);

      // 1. Clear CacheStorage
      if ('caches' in window) {
        const cacheKeys = await window.caches.keys();
        await Promise.all(cacheKeys.map((key) => window.caches.delete(key)));
      }

      // 2. Unregister all service workers
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((reg) => reg.unregister()));
      }

      // 3. Clear database in-memory cache
      dbCache.invalidateAll();

      // 4. Clear non-essential session storage
      try {
        sessionStorage.clear();
      } catch {
        // ignore
      }
    } catch (err) {
      console.warn('[UpdateChecker] Error clearing caches:', err);
    } finally {
      // 5. Force hard reload with timestamp query param
      const reloadUrl = new URL(window.location.href);
      reloadUrl.searchParams.set('_build_reload', Date.now().toString());
      window.location.replace(reloadUrl.toString());
    }
  }, [newVersion]);

  return {
    hasUpdate,
    isUpdating,
    newVersion,
    applyUpdateAndClearCache,
    checkVersion,
  };
}

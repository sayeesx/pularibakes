import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { Sidebar } from './Sidebar';
import { ToastContainer } from '../ui/ToastContainer';
import { NavigationProgress } from '../ui/NavigationProgress';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import { ProductionPinGate } from '../auth/ProductionPinGate';
import { OfflineScreen } from '../ui/OfflineScreen';
import { supabase } from '../../services/supabaseClient';

export const AppLayout: React.FC = () => {
  const { isOffline } = useApp();
  const { t } = useLanguage();

  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => {
    return sessionStorage.getItem('pulari_production_unlocked') === 'true';
  });

  // Verify PIN freshness on mount/refresh and listen for real-time changes
  useEffect(() => {
    const client = supabase;
    if (!client) return;

    const checkLivePin = async () => {
      try {
        const { data } = await client
          .from('audit_logs')
          .select('details')
          .eq('action', 'PRODUCTION_PIN_CHANGED')
          .order('created_at', { ascending: false })
          .limit(1);

        if (data && data.length > 0 && data[0].details?.pin) {
          const livePin = String(data[0].details.pin);
          localStorage.setItem('pulari_production_pin', livePin);

          const unlockedPin = sessionStorage.getItem('pulari_production_unlocked_pin');
          if (unlockedPin && unlockedPin !== livePin) {
            // PIN changed in admin! Relock session immediately
            sessionStorage.removeItem('pulari_production_unlocked');
            sessionStorage.removeItem('pulari_production_unlocked_pin');
            setIsUnlocked(false);
          }
        }
      } catch {
        // silent fallback
      }
    };

    checkLivePin();

    // Subscribe to realtime PIN changes
    const channel = client
      .channel('app-layout-pin-sync')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'audit_logs' },
        (payload: any) => {
          if (payload.new?.action === 'PRODUCTION_PIN_CHANGED' && payload.new?.details?.pin) {
            const newPin = String(payload.new.details.pin);
            localStorage.setItem('pulari_production_pin', newPin);
            const unlockedPin = sessionStorage.getItem('pulari_production_unlocked_pin');
            if (unlockedPin && unlockedPin !== newPin) {
              sessionStorage.removeItem('pulari_production_unlocked');
              sessionStorage.removeItem('pulari_production_unlocked_pin');
              setIsUnlocked(false);
            }
          }
        }
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, []);

  if (isOffline) {
    return <OfflineScreen onRetry={() => window.location.reload()} />;
  }

  if (!isUnlocked) {
    return <ProductionPinGate onUnlock={() => setIsUnlocked(true)} />;
  }

  return (
    <div className="min-h-screen min-h-[100dvh] bg-canvas dark:bg-canvas-dark text-charcoal dark:text-stone-100 flex flex-col font-sans transition-colors duration-200">
      <NavigationProgress />
      <ToastContainer />

      <div className="flex-1 flex max-w-7xl w-full mx-auto">
        <Sidebar />
        <main className="flex-1 p-3.5 sm:p-6 pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))] md:pb-8 w-full max-w-full overflow-x-hidden">
          <Outlet />
        </main>
      </div>

      <BottomNav />
    </div>
  );
};

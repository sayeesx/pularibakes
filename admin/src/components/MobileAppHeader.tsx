import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { FiBell, FiSun, FiMoon, FiRefreshCw } from 'react-icons/fi';
import { AdminTab } from './Header';

interface MobileAppHeaderProps {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
  notificationCount: number;
  onOpenPinModal?: () => void;
  changingTab?: AdminTab | null;
  isTodayWagePending?: boolean;
}

export const MobileAppHeader: React.FC<MobileAppHeaderProps> = ({
  activeTab,
  onTabChange,
  onRefresh,
  isRefreshing,
  notificationCount,
  isTodayWagePending = false,
}) => {
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();

  return (
    <div className="md:hidden sticky top-0 z-30 bg-white dark:bg-[#181515] border-b border-stone-200/80 dark:border-[#282324] px-4 pt-safe py-2.5 transition-colors select-none">
      <div className="flex items-center justify-between">
        {/* Brand Logo & Title */}
        <div className="flex items-center gap-2.5">
          <img
            src="/pulari-logo.jpg"
            alt="Pulari Bakes"
            className="w-9 h-9 rounded-xl object-cover shadow-xs border border-stone-200 dark:border-stone-700"
          />
          <div>
            <span className="text-sm font-extrabold text-stone-900 dark:text-white leading-tight block">
              PULARI BAKES
            </span>
            <span className="text-[10px] font-semibold text-stone-400 dark:text-stone-400 leading-tight block">
              {t.adminConsole}
            </span>
          </div>
        </div>

        {/* Right Controls: Refresh, Theme Toggle, Notification Bell */}
        <div className="flex items-center gap-1.5">
          {isTodayWagePending && (
            <button
              type="button"
              onClick={() => onTabChange('wages')}
              className="px-2 py-1 rounded-lg bg-pulari-gold text-stone-950 font-bold text-[10px] flex items-center gap-1 shadow-xs animate-pulse cursor-pointer"
            >
              <span>⚠️</span>
              <span>{t.navWages}</span>
            </button>
          )}

          {/* Refresh button */}
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="w-8 h-8 rounded-full flex items-center justify-center bg-stone-100 hover:bg-stone-200 dark:bg-[#241F20] text-stone-700 dark:text-stone-300 transition-colors cursor-pointer"
            title={t.refresh}
          >
            <FiRefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-pulari-gold' : ''}`} />
          </button>

          {/* Theme toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            className="w-8 h-8 rounded-full flex items-center justify-center bg-stone-100 hover:bg-stone-200 dark:bg-[#241F20] text-stone-700 dark:text-stone-300 transition-colors cursor-pointer"
            title="Toggle theme"
          >
            {theme === 'dark' ? <FiSun className="w-3.5 h-3.5 text-pulari-wheat" /> : <FiMoon className="w-3.5 h-3.5 text-stone-700" />}
          </button>

          {/* Notification Bell */}
          <button
            type="button"
            onClick={() => onTabChange('notifications')}
            className={`w-8 h-8 rounded-full relative flex items-center justify-center transition-colors cursor-pointer ${
              activeTab === 'notifications'
                ? 'bg-pulari-maroon text-white dark:bg-pulari-wine shadow-md'
                : 'bg-stone-100 hover:bg-stone-200 dark:bg-[#241F20] text-stone-700 dark:text-stone-300'
            }`}
            title={t.navNotifications}
          >
            <FiBell className="w-3.5 h-3.5" />
            {notificationCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-pulari-maroon text-white text-[9px] font-black flex items-center justify-center shadow-xs">
                {notificationCount > 9 ? '9+' : notificationCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

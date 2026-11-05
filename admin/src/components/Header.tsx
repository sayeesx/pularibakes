import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import {
  FiGrid,
  FiActivity,
  FiPackage,
  FiBox,
  FiClock,
  FiBell,
  FiSun,
  FiMoon,
  FiRefreshCw,
  FiLogOut,
  FiUsers,
  FiDollarSign,
  FiShoppingBag,
  FiSettings,
  FiLayers,
  FiDroplet,
  FiGlobe,
} from 'react-icons/fi';

export type AdminTab =
  | 'dashboard'
  | 'inventory'
  | 'mixtures'
  | 'insights'
  | 'sales'
  | 'wages'
  | 'costing'
  | 'ai'
  | 'products'
  | 'ingredients'
  | 'movements'
  | 'notifications'
  | 'settings';

interface HeaderProps {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
  notificationCount?: number;
  onOpenPinModal?: () => void;
  changingTab?: AdminTab | null;
  isTodayWagePending?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  onRefresh,
  isRefreshing,
  notificationCount = 0,
  changingTab = null,
  isTodayWagePending = false,
}) => {
  const { logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();

  const navItems: {
    id: AdminTab;
    label: string;
    icon: React.ElementType;
    badge?: number;
  }[] = [
    { id: 'dashboard', label: t.navDashboard, icon: FiGrid },
    { id: 'inventory', label: t.navInventory, icon: FiLayers },
    { id: 'mixtures', label: t.navMixtures, icon: FiDroplet },
    { id: 'insights', label: t.navInsights, icon: FiActivity },
    { id: 'sales', label: t.navSales, icon: FiShoppingBag },
    { id: 'wages', label: t.navWages, icon: FiUsers },
    { id: 'costing', label: t.navCosting, icon: FiDollarSign },
    { id: 'products', label: t.navProducts, icon: FiPackage },
    { id: 'ingredients', label: t.navIngredients, icon: FiBox },
    { id: 'movements', label: t.navMovements, icon: FiClock },
    { id: 'notifications', label: t.navNotifications, icon: FiBell, badge: notificationCount },
    { id: 'settings', label: t.navSettings, icon: FiSettings },
  ];

  return (
    <aside className="hidden md:flex md:w-64 md:fixed md:inset-y-0 md:left-0 z-40 flex-col bg-white dark:bg-[#181515] border-r border-[#E5E7EB] dark:border-[#282324] transition-colors select-none shadow-xs">
      {/* Brand Header */}
      <div className="px-5 py-4 border-b border-stone-100 dark:border-[#241F20]">
        <div className="flex items-center gap-3">
          <img
            src="/pulari-logo.jpg"
            alt="Pulari Bakes Logo"
            className="w-10 h-10 rounded-xl object-cover shadow-xs border border-stone-200 dark:border-stone-700 shrink-0"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-base tracking-tight text-stone-900 dark:text-white font-sans truncate">
                PULARI BAKES
              </span>
            </div>
            <p className="text-[11px] font-semibold text-stone-400 dark:text-stone-400 leading-tight mt-0.5 truncate">
              {t.adminConsole}
            </p>
          </div>
        </div>
      </div>

      {/* Language Switcher Pill (Google/Facebook Minimal Style) */}
      <div className="px-4 pt-3 pb-1">
        <div className="flex items-center justify-between p-1 rounded-xl bg-stone-100 dark:bg-[#201B1C] border border-stone-200/70 dark:border-stone-800 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setLanguage('ml')}
            className={`flex-1 py-1 text-center rounded-lg transition-all ${
              language === 'ml'
                ? 'bg-white dark:bg-[#2D2627] text-stone-900 dark:text-white shadow-xs font-bold'
                : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-300'
            }`}
          >
            മലയാളം
          </button>
          <button
            type="button"
            onClick={() => setLanguage('en')}
            className={`flex-1 py-1 text-center rounded-lg transition-all ${
              language === 'en'
                ? 'bg-white dark:bg-[#2D2627] text-stone-900 dark:text-white shadow-xs font-bold'
                : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-300'
            }`}
          >
            English
          </button>
        </div>
      </div>

      {/* Vertical Navigation Menu */}
      <div className="flex-1 py-2 px-3 overflow-y-auto no-scrollbar space-y-1">
        <span className="px-3 text-[10px] font-extrabold uppercase tracking-wider text-stone-400 dark:text-stone-500 block mb-1">
          {t.navMenuHeader}
        </span>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const isCurrentChanging = changingTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-left group cursor-pointer press-apple ${
                isActive
                  ? 'bg-pulari-maroon text-white dark:bg-pulari-wine shadow-sm'
                  : 'text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-[#221D1E]'
              } ${isCurrentChanging ? 'opacity-70 scale-[0.98]' : ''}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <Icon
                  className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-110 ${
                    isActive ? 'text-pulari-wheat' : 'text-stone-400 dark:text-stone-500'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </div>

              {item.badge !== undefined && item.badge > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-black shrink-0 ${
                    isActive
                      ? 'bg-white text-pulari-maroon'
                      : 'bg-pulari-maroon text-white dark:bg-pulari-wheat dark:text-stone-950'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Footer Profile with Quick Tools */}
      <div className="p-3 border-t border-stone-100 dark:border-[#241F20] bg-stone-50/60 dark:bg-[#1C1819]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-full bg-pulari-maroon text-white flex items-center justify-center font-bold text-xs shadow-xs shrink-0">
              P
            </div>
            <div className="min-w-0">
              <span className="text-xs font-bold text-stone-900 dark:text-white leading-tight block truncate">
                Pulari Admin
              </span>
              <span className="text-[10px] text-stone-400 leading-tight block truncate">
                {t.adminConsole}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              title={t.refresh}
              className="p-1.5 rounded-lg text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-200/60 dark:hover:bg-[#282323] transition-colors press-apple cursor-pointer"
            >
              <FiRefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-pulari-gold' : ''}`} />
            </button>

            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
              className="p-1.5 rounded-lg text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-200/60 dark:hover:bg-[#282323] transition-colors press-apple cursor-pointer"
            >
              {theme === 'dark' ? <FiSun className="w-3.5 h-3.5 text-pulari-wheat" /> : <FiMoon className="w-3.5 h-3.5 text-stone-700" />}
            </button>

            <button
              onClick={logout}
              title={t.logout}
              className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors press-apple cursor-pointer"
            >
              <FiLogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};

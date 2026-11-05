import React from 'react';
import { FiGrid, FiPackage, FiDollarSign, FiShoppingBag, FiSettings, FiDroplet } from 'react-icons/fi';
import { AdminTab } from './Header';
import { useLanguage } from '../context/LanguageContext';

interface MobileBottomNavProps {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  notificationCount: number;
  changingTab?: AdminTab | null;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  onTabChange,
  notificationCount,
  changingTab = null,
}) => {
  const { t } = useLanguage();

  const tabs: {
    id: AdminTab;
    label: string;
    icon: React.ElementType;
    hasBadge?: boolean;
  }[] = [
    { id: 'dashboard', label: t.navDashboard, icon: FiGrid },
    { id: 'sales', label: t.navSales, icon: FiShoppingBag },
    { id: 'mixtures', label: t.navMixtures, icon: FiDroplet },
    { id: 'products', label: t.navProducts, icon: FiPackage },
    { id: 'settings', label: t.navSettings, icon: FiSettings },
  ];

  return (
    <nav className="md:hidden fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] inset-x-3 z-40 max-w-md mx-auto select-none pointer-events-none">
      <div className="bg-white/95 dark:bg-[#1A1616]/95 backdrop-blur-2xl rounded-2xl border border-stone-200/90 dark:border-[#2E2828] shadow-[0_10px_35px_rgba(0,0,0,0.12)] dark:shadow-[0_10px_35px_rgba(0,0,0,0.5)] p-1.5 flex items-center justify-between gap-1 pointer-events-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          const isChanging = changingTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex-1 flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all duration-200 relative press-apple cursor-pointer ${
                isActive
                  ? 'bg-pulari-maroon text-white dark:bg-pulari-wine shadow-xs'
                  : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-50 dark:hover:bg-[#252020]'
              }`}
            >
              <div className="relative">
                {isChanging ? (
                  <div className={`w-4 h-4 border-2 ${isActive ? 'border-white' : 'border-pulari-maroon'} border-t-transparent rounded-full animate-spin`} />
                ) : (
                  <Icon
                    className={`w-4 h-4 transition-transform duration-200 ${
                      isActive ? 'scale-105 text-pulari-wheat' : ''
                    }`}
                  />
                )}
                {tab.hasBadge && notificationCount > 0 && (
                  <span
                    className={`absolute -top-1.5 -right-2 min-w-[15px] h-[15px] px-0.5 rounded-full text-[9px] font-black flex items-center justify-center font-sans tabular-nums ${
                      isActive
                        ? 'bg-white text-pulari-maroon'
                        : 'bg-pulari-maroon text-white'
                    }`}
                  >
                    {notificationCount > 9 ? '9+' : notificationCount}
                  </span>
                )}
              </div>
              <span
                className={`text-[10px] mt-1 tracking-tight leading-none truncate max-w-[64px] ${
                  isActive ? 'font-bold' : 'font-medium'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

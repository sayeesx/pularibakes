import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import { TbWifiOff } from 'react-icons/tb';
import { Sun, Moon, Languages } from 'lucide-react';

export const Header: React.FC = () => {
  const { isOffline } = useApp();
  const { language, setLanguage, t } = useLanguage();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-30 bg-white dark:bg-[#141212] border-b border-charcoal-border/80 dark:border-charcoal-border-dark px-4 sm:px-6 py-2.5 transition-colors duration-200 shadow-sm">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Brand Logo & Name */}
        <div
          onClick={() => navigate('/')}
          className="cursor-pointer flex items-center gap-3 select-none press-apple"
          title="Pulari Bakes"
        >
          <img
            src="/pulari-logo.jpg"
            alt="Pulari Bakes Logo"
            className="h-9 sm:h-10 w-auto rounded-lg object-contain shadow-xs transition-opacity duration-200"
          />
          <div className="flex flex-col">
            <span className="font-black text-sm sm:text-base text-pulari-primary dark:text-pulari-gold tracking-tight leading-none">
              PULARI BAKES
            </span>
            <span className="text-[10px] sm:text-xs text-stone-500 dark:text-stone-400 font-medium leading-tight">
              {language === 'ml' ? 'അടുക്കള & ഉത്പാദന കേന്ദ്രം' : 'Pantry & Production'}
            </span>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2">
          {/* Offline indicator if connection lost */}
          {isOffline && (
            <div
              className="flex items-center gap-1 bg-amber-500 text-white text-[11px] font-bold px-2.5 py-1 rounded-full animate-pulse shadow-sm"
              title={t.offlineNotice}
            >
              <TbWifiOff className="w-3.5 h-3.5" />
              <span>{language === 'ml' ? 'ഓഫ്‌ലൈൻ' : 'Offline'}</span>
            </div>
          )}

          {/* Quick Language Switcher */}
          <button
            type="button"
            onClick={() => setLanguage(language === 'ml' ? 'en' : 'ml')}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 text-stone-700 dark:text-stone-200 text-xs font-bold hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors cursor-pointer"
            title={language === 'ml' ? 'Switch to English' : 'മലയാളത്തിലേക്ക് മാറ്റുക'}
          >
            <Languages className="w-3.5 h-3.5 text-pulari-primary dark:text-pulari-gold" />
            <span>{language === 'ml' ? 'English' : 'മലയാളം'}</span>
          </button>

          {/* Theme Toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            className="p-2 rounded-lg border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors cursor-pointer"
            title={isDark ? 'Light Mode' : 'Dark Mode'}
            aria-label="Toggle Theme"
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-stone-600" />}
          </button>
        </div>
      </div>
    </header>
  );
};

import React, { useState } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useApp } from '../../context/AppContext';
import { useLanguage, Language } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import {
  TbLanguage,
  TbUserCheck,
  TbSun,
  TbMoon,
  TbPalette,
  TbLock,
} from 'react-icons/tb';

export const SettingsView: React.FC = () => {
  const { staffName, setStaffName, addToast } = useApp();
  const { language, setLanguage } = useLanguage();
  const { setTheme, isDark } = useTheme();

  const [operatorInput, setOperatorInput] = useState(staffName);

  const handleLanguageChange = (newLang: Language) => {
    setLanguage(newLang);
    addToast(
      newLang === 'ml'
        ? 'ഭാഷ മലയാളത്തിലേക്ക് മാറ്റി'
        : 'Language switched to English',
      'info'
    );
  };

  const handleSaveOperator = (e: React.FormEvent) => {
    e.preventDefault();
    if (!operatorInput.trim()) return;
    setStaffName(operatorInput.trim());
    addToast(
      language === 'ml'
        ? `ഓപ്പറേറ്റർ പേര് സേവ് ചെയ്തു: ${operatorInput.trim()}`
        : `Operator name updated: ${operatorInput.trim()}`,
      'success'
    );
  };

  return (
    <div className="space-y-4 max-w-xl mx-auto">
      {/* Theme Control */}
      <Card padding="md" className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-epso-orange flex items-center justify-center">
              <TbPalette className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-stone-900 dark:text-white">
                {language === 'ml' ? 'തീം മോഡ്' : 'Theme Mode'}
              </h3>
            </div>
          </div>

          <div className="flex items-center p-1 bg-stone-100 dark:bg-[#141212] rounded-xl border border-charcoal-border/50 dark:border-[#282323]">
            <button
              type="button"
              onClick={() => setTheme('light')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all press-apple cursor-pointer flex items-center gap-1.5 ${
                !isDark
                  ? 'bg-white dark:bg-[#282323] text-stone-900 dark:text-white shadow-xs font-black'
                  : 'text-stone-500 hover:text-stone-900 dark:hover:text-white'
              }`}
            >
              <TbSun className="w-3.5 h-3.5 text-amber-500" />
              <span>{language === 'ml' ? 'ലൈറ്റ്' : 'Light'}</span>
            </button>
            <button
              type="button"
              onClick={() => setTheme('dark')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all press-apple cursor-pointer flex items-center gap-1.5 ${
                isDark
                  ? 'bg-[#282323] text-white shadow-xs font-black'
                  : 'text-stone-500 hover:text-stone-900 dark:hover:text-white'
              }`}
            >
              <TbMoon className="w-3.5 h-3.5 text-amber-400" />
              <span>{language === 'ml' ? 'ഡാർക്ക്' : 'Dark'}</span>
            </button>
          </div>
        </div>
      </Card>

      {/* Language Selector */}
      <Card padding="md" className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-epso-orange flex items-center justify-center">
              <TbLanguage className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-stone-900 dark:text-white">
                {language === 'ml' ? 'ഭാഷ' : 'Language'}
              </h3>
            </div>
          </div>

          <div className="flex items-center p-1 bg-stone-100 dark:bg-[#141212] rounded-xl border border-charcoal-border/50 dark:border-[#282323]">
            <button
              type="button"
              onClick={() => handleLanguageChange('ml')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all press-apple cursor-pointer ${
                language === 'ml'
                  ? 'bg-white dark:bg-[#282323] text-stone-900 dark:text-white shadow-xs font-black font-malayalam'
                  : 'text-stone-500 hover:text-stone-900 dark:hover:text-white'
              }`}
            >
              മലയാളം
            </button>
            <button
              type="button"
              onClick={() => handleLanguageChange('en')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all press-apple cursor-pointer ${
                language === 'en'
                  ? 'bg-white dark:bg-[#282323] text-stone-900 dark:text-white shadow-xs font-black'
                  : 'text-stone-500 hover:text-stone-900 dark:hover:text-white'
              }`}
            >
              English
            </button>
          </div>
        </div>
      </Card>

      {/* Operator Name */}
      <Card padding="md" className="space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-epso-orange flex items-center justify-center">
            <TbUserCheck className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-extrabold text-stone-900 dark:text-white">
            {language === 'ml' ? 'പ്രൊഡക്ഷൻ ഓപ്പറേറ്റർ' : 'Production Operator'}
          </h3>
        </div>

        <form onSubmit={handleSaveOperator} className="flex gap-2">
          <Input
            value={operatorInput}
            onChange={(e) => setOperatorInput(e.target.value)}
            placeholder={language === 'ml' ? 'ഓപ്പറേറ്റർ പേര്...' : 'Operator name...'}
            className="flex-1"
          />
          <Button type="submit" variant="primary">
            {language === 'ml' ? 'സേവ്' : 'Save'}
          </Button>
        </form>
      </Card>

      {/* Security & Screen Lock */}
      <Card padding="md" className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-red-50 dark:bg-amber-950/40 text-epso-red dark:text-amber-400 flex items-center justify-center">
              <TbLock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-stone-900 dark:text-white">
                {language === 'ml' ? 'സുരക്ഷ & പാസ്‌കോഡ്' : 'Security & PIN Lock'}
              </h3>
              <p className="text-[11px] text-stone-400 font-malayalam">
                {language === 'ml' ? 'സ്ക്രീൻ ഉടൻ ലോക്ക് ചെയ്യുക' : 'Lock session screen'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              sessionStorage.removeItem('epso_production_unlocked');
              window.location.reload();
            }}
            className="px-3.5 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 dark:bg-[#282323] dark:hover:bg-[#342D2D] text-red-600 dark:text-red-400 text-xs font-bold transition-all press-apple cursor-pointer"
          >
            {language === 'ml' ? 'ലോക്ക് ചെയ്യുക' : 'Lock Now'}
          </button>
        </div>
      </Card>

      {/* Developed by Narrs footer */}
      <footer className="pt-6 pb-6 text-center text-xs text-charcoal-muted dark:text-stone-500 select-none">
        developed by{' '}
        <a
          href="https://narrs.in"
          target="_blank"
          rel="noopener noreferrer"
          className="font-bold text-epso-red dark:text-amber-400 hover:underline transition-colors cursor-pointer"
        >
          narrs
        </a>
      </footer>
    </div>
  );
};

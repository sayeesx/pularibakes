import React from 'react';
import { SettingsView } from '../components/settings/SettingsView';
import { useLanguage } from '../context/LanguageContext';

export const SettingsPage: React.FC = () => {
  const { language } = useLanguage();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-charcoal dark:text-white tracking-tight">
          {language === 'ml' ? 'ക്രമീകരണങ്ങൾ' : 'Settings & Preferences'}
        </h1>
        <p className="text-xs text-charcoal-muted dark:text-stone-400">
          {language === 'ml'
            ? 'തീം, ഭാഷ, ഓപ്പറേറ്റർ പേര് എന്നിവ ക്രമീകരിക്കുക.'
            : 'Manage appearance theme, language, and operator preferences.'}
        </p>
      </div>

      <SettingsView />
    </div>
  );
};

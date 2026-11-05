import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Package, UtensilsCrossed, Settings, UserCheck, Lock, FlaskConical } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';

export const Sidebar: React.FC = () => {
  const { staffName } = useApp();
  const { language, t } = useLanguage();

  const navItems = [
    { to: '/', label: t.navProduction, icon: Home, end: true },
    { to: '/products', label: t.navProducts, icon: Package, end: false },
    { to: '/ingredients', label: t.navIngredients, icon: UtensilsCrossed, end: false },
    { to: '/mixtures', label: t.navMixtures, icon: FlaskConical, end: false },
    { to: '/settings', label: t.navSettings, icon: Settings, end: false },
  ];

  return (
    <aside className="hidden md:flex flex-col w-64 border-r border-stone-200 dark:border-stone-800 bg-white dark:bg-[#141212] min-h-screen p-4 shrink-0 shadow-xs transition-colors duration-200">
      <div className="space-y-6 flex-1">
        {/* Brand Header */}
        <div className="px-3 py-2 flex items-center gap-3">
          <img
            src="/pulari-logo.jpg"
            alt="Pulari Bakes Logo"
            className="h-10 w-auto rounded-lg object-contain shadow-xs select-none"
          />
          <div className="flex flex-col">
            <span className="font-black text-sm tracking-tight text-pulari-primary dark:text-pulari-gold">
              PULARI BAKES
            </span>
            <span className="text-[11px] text-stone-500 dark:text-stone-400 font-medium">
              {language === 'ml' ? 'അടുക്കള മാനേജ്മെന്റ്' : 'Pantry Management'}
            </span>
          </div>
        </div>

        <div>
          <div className="px-3 mb-2 text-[11px] font-bold tracking-wider text-stone-400 dark:text-stone-500 uppercase">
            {language === 'ml' ? 'മെനു' : 'MENU'}
          </div>
          <div className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-bold transition-all press-apple ${
                      isActive
                        ? 'bg-pulari-primary text-white shadow-xs'
                        : 'text-stone-700 dark:text-stone-300 hover:bg-stone-100 hover:text-pulari-primary dark:hover:bg-stone-800 dark:hover:text-pulari-gold'
                    }`
                  }
                >
                  <Icon className="w-4 h-4 stroke-[2.2]" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        </div>
      </div>

      {/* Operator identity footer with Lock Screen button */}
      <div className="mt-auto pt-4 border-t border-stone-200 dark:border-stone-800">
        <div className="bg-stone-50 dark:bg-stone-800/80 p-3 rounded-xl border border-stone-200 dark:border-stone-700 transition-colors flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-stone-600 dark:text-stone-400">
              <UserCheck className="w-4 h-4 text-pulari-primary dark:text-pulari-gold" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                {language === 'ml' ? 'ഓപ്പറേറ്റർ' : 'OPERATOR'}
              </span>
            </div>
            <p className="text-xs font-bold text-stone-900 dark:text-white mt-1 line-clamp-1">{staffName}</p>
          </div>
          <button
            onClick={() => {
              sessionStorage.removeItem('pulari_production_unlocked');
              sessionStorage.removeItem('pulari_production_unlocked_pin');
              window.location.reload();
            }}
            title={language === 'ml' ? 'സ്‌ക്രീൻ ലോക്ക് ചെയ്യുക' : 'Lock Screen'}
            className="p-1.5 rounded-lg text-stone-400 hover:text-red-500 hover:bg-stone-200/60 dark:hover:bg-stone-700 transition-colors cursor-pointer"
          >
            <Lock className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};

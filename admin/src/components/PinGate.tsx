import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { FiLock, FiSun, FiMoon } from 'react-icons/fi';

export const PinGate: React.FC = () => {
  const { loginWithPin, isLoading } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '']);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [shake, setShake] = useState<boolean>(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleDigitChange = (index: number, val: string) => {
    const char = val.replace(/\D/g, '').slice(-1);
    const updated = [...digits];
    updated[index] = char;
    setDigits(updated);
    setErrorMsg('');

    if (char && index < 4) {
      inputRefs.current[index + 1]?.focus();
    }

    if (updated.every((d) => d !== '')) {
      const pin = updated.join('');
      submitPin(pin);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 5);
    if (!pasted) return;

    const updated = [...digits];
    for (let i = 0; i < pasted.length; i++) {
      updated[i] = pasted[i];
    }
    setDigits(updated);
    setErrorMsg('');

    if (pasted.length === 5) {
      submitPin(pasted);
    } else {
      inputRefs.current[pasted.length]?.focus();
    }
  };

  const submitPin = async (pin: string) => {
    const res = await loginWithPin(pin);
    if (!res.success) {
      setErrorMsg(language === 'ml' ? 'തെറ്റായ പിൻ' : 'Incorrect PIN');
      setShake(true);
      setTimeout(() => setShake(false), 500);
      setDigits(['', '', '', '', '']);
      inputRefs.current[0]?.focus();
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between items-center bg-[#F8F9FA] dark:bg-[#141212] p-4 text-[#141212] dark:text-white transition-colors duration-200">
      {/* Top Bar with Language Toggle and Theme Toggle */}
      <div className="w-full max-w-sm flex justify-between items-center py-2">
        <div className="flex items-center gap-2.5">
          <img
            src="/pulari-logo.jpg"
            alt="Pulari Bakes"
            className="w-8 h-8 rounded-lg object-cover shadow-xs border border-stone-200 dark:border-stone-700"
          />
          <span className="text-xs font-bold tracking-wider uppercase text-pulari-maroon dark:text-pulari-wheat">
            Pulari Bakes
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Language Switcher */}
          <button
            type="button"
            onClick={() => setLanguage(language === 'ml' ? 'en' : 'ml')}
            className="px-2.5 py-1 text-xs font-bold rounded-lg border border-stone-200 dark:border-stone-700 bg-white dark:bg-[#1E1B1B] text-stone-700 dark:text-stone-300"
          >
            {language === 'ml' ? 'ENG' : 'മല'}
          </button>
          <button
            onClick={toggleTheme}
            type="button"
            aria-label="Toggle theme"
            className="p-1.5 rounded-lg bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300 press-apple"
          >
            {theme === 'dark' ? <FiSun className="w-4 h-4 text-pulari-wheat" /> : <FiMoon className="w-4 h-4 text-stone-700" />}
          </button>
        </div>
      </div>

      {/* Main PIN Prompt Box */}
      <div className={`w-full max-w-sm flex flex-col items-center my-auto transition-transform ${shake ? 'animate-bounce' : ''}`}>
        <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-md border-2 border-pulari-gold mb-5">
          <img
            src="/pulari-logo.jpg"
            alt="Pulari Bakes"
            className="w-full h-full object-cover"
          />
        </div>

        <h1 className="text-lg font-bold text-stone-900 dark:text-white text-center mb-1">
          {language === 'ml' ? 'അഡ്മിൻ പിൻ നൽകുക' : 'Enter Admin PIN'}
        </h1>
        <p className="text-xs text-stone-500 dark:text-stone-400 text-center mb-6">
          {language === 'ml' ? 'തുടരുന്നതിനായി നിങ്ങളുടെ 5 അക്ക പിൻ അടിക്കുക' : 'Enter your 5-digit PIN to access console'}
        </p>

        {/* 5 Individual OTP Boxes */}
        <div className="flex justify-center gap-2.5 sm:gap-3 mb-6 w-full">
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(el) => { inputRefs.current[index] = el; }}
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              disabled={isLoading}
              onChange={(e) => handleDigitChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              onPaste={handlePaste}
              className={`w-11 h-14 sm:w-13 sm:h-16 text-center text-xl sm:text-2xl font-bold rounded-xl border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#1C1819] text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-pulari-gold transition-all ${
                errorMsg ? 'border-red-500 ring-1 ring-red-500' : ''
              }`}
            />
          ))}
        </div>

        {errorMsg && (
          <div className="text-xs font-bold text-red-600 dark:text-red-400 text-center mb-4 animate-shake">
            {errorMsg}
          </div>
        )}

        {isLoading && (
          <div className="text-xs text-stone-400 flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-pulari-maroon border-t-transparent rounded-full animate-spin" />
            <span>{t.loading}</span>
          </div>
        )}
      </div>

      <div className="w-full text-center py-2 text-[11px] text-stone-400">
        PULARI BAKES © {new Date().getFullYear()}
      </div>
    </div>
  );
};

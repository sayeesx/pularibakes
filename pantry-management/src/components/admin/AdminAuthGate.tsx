import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { useLanguage } from '../../context/LanguageContext';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { LoadingSpinner } from '../ui/LoadingSpinner';

interface AdminAuthGateProps {
  children: React.ReactNode;
}

export const AdminAuthGate: React.FC<AdminAuthGateProps> = ({ children }) => {
  const { repo, isAdminAuthenticated, loginAdmin, addToast } = useApp();
  const { language } = useLanguage();

  const [isInitialized, setIsInitialized] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // 6-digit OTP array
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Setup mode states
  const [setupDigits, setSetupDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [confirmDigits, setConfirmDigits] = useState<string[]>(['', '', '', '', '', '']);
  const setupRefs = useRef<(HTMLInputElement | null)[]>([]);
  const confirmRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Check initialization on mount
  useEffect(() => {
    let mounted = true;
    const check = async () => {
      try {
        setLoading(true);
        const initialized = await repo.isAdminInitialized();
        if (mounted) {
          setIsInitialized(initialized);
          setErrorMsg('');
        }
      } catch (err: any) {
        console.error('Failed to check admin status:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    if (!isAdminAuthenticated) {
      check();
    }
    return () => {
      mounted = false;
    };
  }, [isAdminAuthenticated, repo]);

  // Focus first input box on load
  useEffect(() => {
    if (!loading && isInitialized && inputRefs.current[0]) {
      inputRefs.current[0]?.focus();
    }
  }, [loading, isInitialized]);

  if (isAdminAuthenticated) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center p-4">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  // Handle single digit input
  const handleDigitChange = (index: number, val: string) => {
    const char = val.replace(/\D/g, '').slice(-1);
    const updated = [...digits];
    updated[index] = char;
    setDigits(updated);
    setErrorMsg('');

    if (char && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-verify if all 6 digits entered
    const completePin = updated.join('');
    if (completePin.length === 6 && !updated.includes('')) {
      verifyPin(completePin);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        const updated = [...digits];
        updated[index - 1] = '';
        setDigits(updated);
        inputRefs.current[index - 1]?.focus();
      } else {
        const updated = [...digits];
        updated[index] = '';
        setDigits(updated);
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;

    const updated = ['', '', '', '', '', ''];
    for (let i = 0; i < pasted.length; i++) {
      updated[i] = pasted[i];
    }
    setDigits(updated);
    setErrorMsg('');

    if (pasted.length === 6) {
      verifyPin(pasted);
    } else {
      inputRefs.current[pasted.length]?.focus();
    }
  };

  const verifyPin = async (pinStr: string) => {
    try {
      setSubmitting(true);
      setErrorMsg('');
      const result = await repo.verifyAdminPin(pinStr);
      if (result.success && result.sessionToken) {
        loginAdmin(result.sessionToken);
        addToast(
          language === 'ml' ? 'അഡ്മിൻ പ്രവേശനം അനുവദിച്ചു' : 'Admin access granted',
          'success'
        );
      } else {
        setErrorMsg((result as any).message || (language === 'ml' ? 'തെറ്റായ പിൻ നമ്പർ' : 'Invalid 6-digit PIN'));
        setDigits(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Verification failed');
      setDigits(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setSubmitting(false);
    }
  };

  // Initial Setup handlers
  const handleSetupDigitChange = (index: number, val: string, isConfirm: boolean) => {
    const char = val.replace(/\D/g, '').slice(-1);
    if (isConfirm) {
      const updated = [...confirmDigits];
      updated[index] = char;
      setConfirmDigits(updated);
      if (char && index < 5) confirmRefs.current[index + 1]?.focus();
    } else {
      const updated = [...setupDigits];
      updated[index] = char;
      setSetupDigits(updated);
      if (char && index < 5) {
        setupRefs.current[index + 1]?.focus();
      } else if (char && index === 5) {
        confirmRefs.current[0]?.focus();
      }
    }
    setErrorMsg('');
  };

  const handleInitialSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const p1 = setupDigits.join('');
    const p2 = confirmDigits.join('');

    if (p1.length !== 6 || p2.length !== 6) {
      setErrorMsg('Enter all 6 digits');
      return;
    }
    if (p1 !== p2) {
      setErrorMsg('PINs do not match');
      return;
    }

    try {
      setSubmitting(true);
      setErrorMsg('');
      const res = await repo.setupAdminPin(p1, 'pulari-admin-master-key');
      if (res.success && res.sessionToken) {
        loginAdmin(res.sessionToken);
        addToast('PIN setup complete', 'success');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to setup PIN');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 py-8 max-w-sm mx-auto">
      <Card padding="lg" className="w-full text-center space-y-6 shadow-xl border-stone-200 dark:border-[#2E2828]">
        {/* Simple single 6-digit pin screen */}
        {isInitialized ? (
          <div className="space-y-6">
            <h2 className="text-lg sm:text-xl font-black text-stone-900 dark:text-white tracking-tight">
              Enter your 6-digit PIN
            </h2>

            {/* 6 OTP Boxes */}
            <div className="flex items-center justify-center gap-2 sm:gap-2.5">
              {digits.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    inputRefs.current[i] = el;
                  }}
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={digit}
                  disabled={submitting}
                  onChange={(e) => handleDigitChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  onPaste={handlePaste}
                  className="w-10 h-13 sm:w-12 sm:h-15 text-center text-xl sm:text-2xl font-black rounded-xl border border-stone-300 dark:border-[#383131] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-epso-red focus:border-epso-red transition-all press-scale"
                  autoComplete="one-time-code"
                />
              ))}
            </div>

            {errorMsg && (
              <p className="text-xs font-bold text-red-600 dark:text-red-400 animate-in fade-in">
                {errorMsg}
              </p>
            )}

            {submitting && (
              <div className="flex justify-center py-1">
                <LoadingSpinner size="sm" />
              </div>
            )}
          </div>
        ) : (
          /* Initial PIN Setup if database is uninitialized */
          <form onSubmit={handleInitialSetupSubmit} className="space-y-5 text-left">
            <h2 className="text-lg font-black text-stone-900 dark:text-white text-center">
              Enter your 6-digit PIN
            </h2>

            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-600 dark:text-stone-400">
                New PIN
              </label>
              <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                {setupDigits.map((d, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      setupRefs.current[i] = el;
                    }}
                    type="password"
                    inputMode="numeric"
                    maxLength={1}
                    value={d}
                    onChange={(e) => handleSetupDigitChange(i, e.target.value, false)}
                    className="w-10 h-12 text-center text-xl font-black rounded-xl border border-stone-300 dark:border-[#383131] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white focus:ring-2 focus:ring-epso-red"
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-stone-600 dark:text-stone-400">
                Confirm PIN
              </label>
              <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                {confirmDigits.map((d, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      confirmRefs.current[i] = el;
                    }}
                    type="password"
                    inputMode="numeric"
                    maxLength={1}
                    value={d}
                    onChange={(e) => handleSetupDigitChange(i, e.target.value, true)}
                    className="w-10 h-12 text-center text-xl font-black rounded-xl border border-stone-300 dark:border-[#383131] bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white focus:ring-2 focus:ring-epso-red"
                  />
                ))}
              </div>
            </div>

            {errorMsg && (
              <p className="text-xs font-bold text-red-600 dark:text-red-400 text-center">
                {errorMsg}
              </p>
            )}

            <Button type="submit" variant="primary" fullWidth isLoading={submitting}>
              Set PIN
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
};

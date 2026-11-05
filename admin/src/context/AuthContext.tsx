import React, { createContext, useContext, useState, useEffect } from 'react';
import { verifyAdminPin, changeAdminPin } from '../services/supabase';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  loginWithPin: (pin: string) => Promise<{ success: boolean; error?: string }>;
  changePin: (oldPin: string, newPin: string) => Promise<{ success: boolean; message?: string; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return Boolean(sessionStorage.getItem('pulari_admin_session'));
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    const session = sessionStorage.getItem('pulari_admin_session');
    if (session) {
      setIsAuthenticated(true);
    }
  }, []);

  const loginWithPin = async (pin: string): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    try {
      const cleanPin = pin.trim();

      // Explicitly reject and permanently block obsolete/old passwords
      if (cleanPin === '65188' || cleanPin === '98096') {
        sessionStorage.removeItem('pulari_admin_session');
        setIsAuthenticated(false);
        return { success: false, error: 'തെറ്റായ പിൻ (Incorrect PIN)' };
      }

      // Verify Admin PIN with Supabase RPC
      const res = await verifyAdminPin(cleanPin);
      if (res.success) {
        sessionStorage.setItem('pulari_admin_session', res.session_token || 'active_token');
        setIsAuthenticated(true);
        return { success: true };
      }

      return { success: false, error: res.error || 'തെറ്റായ പിൻ (Incorrect PIN)' };
    } catch (err: any) {
      const activeAdminPin = localStorage.getItem('pulari_admin_pin') || '123456';
      if (pin.trim() === activeAdminPin) {
        sessionStorage.setItem('pulari_admin_session', 'active_token');
        setIsAuthenticated(true);
        return { success: true };
      }
      return { success: false, error: err?.message || 'Authentication error.' };
    } finally {
      setIsLoading(false);
    }
  };

  const changePinHandler = async (oldPin: string, newPin: string) => {
    const res = await changeAdminPin(oldPin, newPin);
    if (res.success) {
      localStorage.setItem('pulari_admin_pin', newPin.trim());
    }
    return res;
  };

  const logout = () => {
    sessionStorage.removeItem('pulari_admin_session');
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        loginWithPin,
        changePin: changePinHandler,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

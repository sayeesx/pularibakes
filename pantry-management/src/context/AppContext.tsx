import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { UserRole } from '../types';
import { getRepository, IEpsoRepository } from '../services';

interface ToastItem {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

interface AppContextType {
  repo: IEpsoRepository;
  role: UserRole;
  setRole: (role: UserRole) => void;
  staffName: string;
  setStaffName: (name: string) => void;
  adminSessionToken: string | null;
  isAdminAuthenticated: boolean;
  loginAdmin: (token: string) => void;
  logoutAdmin: () => void;
  isOffline: boolean;
  toasts: ToastItem[];
  addToast: (message: string, type?: ToastItem['type']) => void;
  removeToast: (id: string) => void;
  dataVersion: number;
  triggerRefresh: () => void;
  isStartProductionOpen: boolean;
  setIsStartProductionOpen: (open: boolean) => void;
}

const AppContext = createContext<AppContextType | null>(null);

const ADMIN_SESSION_STORAGE_KEY = 'pulari_admin_session_token_v2';
const STAFF_NAME_STORAGE_KEY = 'pulari_staff_operator_name_v2';
const ROLE_STORAGE_KEY = 'pulari_active_role_v2';

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const repo = getRepository();

  const [role, setRoleState] = useState<UserRole>(() => {
    return (localStorage.getItem(ROLE_STORAGE_KEY) as UserRole) || 'production_staff';
  });

  const [staffName, setStaffNameState] = useState<string>(() => {
    return localStorage.getItem(STAFF_NAME_STORAGE_KEY) || 'പ്രൊഡക്ഷൻ ടീം';
  });

  const [adminSessionToken, setAdminSessionToken] = useState<string | null>(() => {
    return sessionStorage.getItem(ADMIN_SESSION_STORAGE_KEY);
  });

  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(() => {
    return Boolean(sessionStorage.getItem(ADMIN_SESSION_STORAGE_KEY));
  });

  const [isOffline, setIsOffline] = useState<boolean>(!navigator.onLine);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [dataVersion, setDataVersion] = useState<number>(0);
  const [isStartProductionOpen, setIsStartProductionOpen] = useState<boolean>(false);

  // Monitor online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Validate admin session with repo periodically or on load
  useEffect(() => {
    if (adminSessionToken) {
      repo.verifyAdminSession(adminSessionToken).then((valid) => {
        if (!valid) {
          sessionStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
          setAdminSessionToken(null);
          setIsAdminAuthenticated(false);
        } else {
          setIsAdminAuthenticated(true);
        }
      });
    }
  }, [adminSessionToken, repo]);

  const setRole = (newRole: UserRole) => {
    setRoleState(newRole);
    localStorage.setItem(ROLE_STORAGE_KEY, newRole);
  };

  const setStaffName = (name: string) => {
    setStaffNameState(name);
    localStorage.setItem(STAFF_NAME_STORAGE_KEY, name);
  };

  const loginAdmin = (token: string) => {
    sessionStorage.setItem(ADMIN_SESSION_STORAGE_KEY, token);
    setAdminSessionToken(token);
    setIsAdminAuthenticated(true);
    setRole('owner');
  };

  const logoutAdmin = () => {
    sessionStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
    setAdminSessionToken(null);
    setIsAdminAuthenticated(false);
    setRole('production_staff');
  };

  const addToast = useCallback((message: string, type: ToastItem['type'] = 'success') => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const triggerRefresh = useCallback(() => {
    repo.invalidateCache?.();
    setDataVersion((v) => v + 1);
  }, [repo]);

  return (
    <AppContext.Provider
      value={{
        repo,
        role,
        setRole,
        staffName,
        setStaffName,
        adminSessionToken,
        isAdminAuthenticated,
        loginAdmin,
        logoutAdmin,
        isOffline,
        toasts,
        addToast,
        removeToast,
        dataVersion,
        triggerRefresh,
        isStartProductionOpen,
        setIsStartProductionOpen,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export function useApp(): AppContextType {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}

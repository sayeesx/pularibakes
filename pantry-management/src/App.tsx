import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AppProvider } from './context/AppContext';
import { LanguageProvider } from './context/LanguageContext';
import { AppLayout } from './components/layout/AppLayout';
import { ForceUpdateModal } from './components/common/ForceUpdateModal';
import { ProductionPage } from './pages/ProductionPage';
import { ProductsPage } from './pages/ProductsPage';
import { IngredientsPage } from './pages/IngredientsPage';
import { SettingsPage } from './pages/SettingsPage';

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AppProvider>
          <ForceUpdateModal />
          <BrowserRouter>
            <Routes>
              <Route element={<AppLayout />}>
                {/* Kitchen / Production Staff Default Interface: / */}
                <Route path="/" element={<ProductionPage />} />

                {/* Shared Catalogue Management (Accessible to cooks & owner) */}
                <Route path="/products" element={<ProductsPage />} />
                <Route path="/ingredients" element={<IngredientsPage />} />

                {/* Redirect Mixtures - Managed Exclusively in Admin */}
                <Route path="/mixtures" element={<Navigate to="/" replace />} />

                {/* System & Profile Settings */}
                <Route path="/settings" element={<SettingsPage />} />

                {/* Legacy Route Redirects */}
                <Route path="/admin" element={<Navigate to="/" replace />} />
                <Route path="/production" element={<Navigate to="/" replace />} />
                <Route path="/dashboard" element={<Navigate to="/" replace />} />
                <Route path="/stock" element={<Navigate to="/ingredients" replace />} />
                <Route path="/recipes" element={<Navigate to="/products" replace />} />
                <Route path="/reports" element={<Navigate to="/" replace />} />
                <Route path="/more" element={<Navigate to="/" replace />} />

                {/* Wildcard Fallback */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </AppProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
};

export default App;

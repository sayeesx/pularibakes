import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

export type Language = 'ml' | 'en';

export const LANGUAGE_STORAGE_KEY = 'pulari_language_preference';

export interface AdminTranslations {
  // App branding
  appTitle: string;
  adminConsole: string;
  welcome: string;

  // Navigation
  navDashboard: string;
  navInventory: string;
  navMixtures: string;
  navInsights: string;
  navSales: string;
  navWages: string;
  navCosting: string;
  navProducts: string;
  navIngredients: string;
  navMovements: string;
  navNotifications: string;
  navSettings: string;
  navMenuHeader: string;

  // Common Actions
  save: string;
  cancel: string;
  edit: string;
  delete: string;
  addNew: string;
  refresh: string;
  search: string;
  filter: string;
  download: string;
  print: string;
  close: string;
  confirm: string;
  logout: string;
  viewAll: string;
  back: string;
  status: string;
  active: string;
  inactive: string;
  actions: string;
  loading: string;
  noData: string;

  // Stock & Inventory
  totalProducts: string;
  totalIngredients: string;
  totalMixtures: string;
  currentStock: string;
  minStock: string;
  unit: string;
  costPerUnit: string;
  stockStatus: string;
  inStock: string;
  lowStock: string;
  outOfStock: string;
  stockValue: string;

  // Special Mixtures
  mixturesTitle: string;
  mixturesSubtitle: string;
  addMixture: string;
  editMixture: string;
  mixtureName: string;
  mixtureCode: string;
  mixtureRecipe: string;
  expectedOutput: string;
  prepareMixture: string;
  mixturePrepHistory: string;
  mixtureConsumptionHistory: string;
  noMixturesYet: string;
  recipeIngredients: string;
  actualYield: string;
  batchCost: string;

  // Products & Recipes
  productsTitle: string;
  addProduct: string;
  editProduct: string;
  productName: string;
  wholesalePrice: string;
  retailPrice: string;
  recipe: string;
  manageRecipe: string;

  // Ingredients
  ingredientsTitle: string;
  addIngredient: string;
  editIngredient: string;
  ingredientName: string;
  category: string;
  categoryBasic: string;
  categoryOther: string;
  avgCost: string;

  // Sales & Billing
  salesTitle: string;
  newInvoice: string;
  customerName: string;
  invoiceNo: string;
  amount: string;
  paid: string;
  unpaid: string;
  paymentMode: string;

  // Wages
  wagesTitle: string;
  recordWage: string;
  workerName: string;
  wageAmount: string;

  // Settings
  settingsTitle: string;
  bakeryProfile: string;
  bakeryName: string;
  phone: string;
  email: string;
  location: string;
  billFooter: string;
  pinSecurity: string;
  changePin: string;
  currentPin: string;
  newPin: string;
  confirmPin: string;
  themeToggle: string;
  languageSelect: string;
  languageMalayalam: string;
  languageEnglish: string;
}

const mlTranslations: AdminTranslations = {
  appTitle: 'പുലരി ബേക്സ്',
  adminConsole: 'അഡ്മിൻ പാനൽ',
  welcome: 'സ്വാഗതം',

  navDashboard: 'ഡാഷ്‌ബോർഡ്',
  navInventory: 'സ്റ്റോക്ക് വിവരങ്ങൾ',
  navMixtures: 'തയ്യാറാക്കിയ മിശ്രിതങ്ങൾ',
  navInsights: 'കണക്കുകൾ',
  navSales: 'വിൽപ്പന',
  navWages: 'കൂലി',
  navCosting: 'ചിലവ് കണക്ക്',
  navProducts: 'ഉൽപ്പന്നങ്ങൾ',
  navIngredients: 'ചേരുവകൾ',
  navMovements: 'സ്റ്റോക്ക് നീക്കങ്ങൾ',
  navNotifications: 'അറിയിപ്പുകൾ',
  navSettings: 'ക്രമീകരണങ്ങൾ',
  navMenuHeader: 'മെനു',

  save: 'സൂക്ഷിക്കുക',
  cancel: 'റദ്ദാക്കുക',
  edit: 'തിരുത്തുക',
  delete: 'ഒഴിവാക്കുക',
  addNew: 'പുതിയത് ചേർക്കുക',
  refresh: 'പുതുക്കുക',
  search: 'തിരയുക',
  filter: 'തിരഞ്ഞെടുക്കുക',
  download: 'ഡൗൺലോഡ്',
  print: 'പ്രിന്റ് ചെയ്യുക',
  close: 'അടയ്ക്കുക',
  confirm: 'ഉറപ്പാക്കുക',
  logout: 'പുറത്തിറങ്ങുക',
  viewAll: 'എല്ലാം കാണുക',
  back: 'പിന്നോട്ട്',
  status: 'നില',
  active: 'ലഭ്യമാണ്',
  inactive: 'ലഭ്യമല്ല',
  actions: 'നടപടികൾ',
  loading: 'കാത്തിരിക്കൂ...',
  noData: 'വിവരങ്ങൾ ലഭ്യമല്ല',

  totalProducts: 'ആകെ ഉൽപ്പന്നങ്ങൾ',
  totalIngredients: 'ആകെ ചേരുവകൾ',
  totalMixtures: 'തയ്യാറാക്കിയ മിശ്രിതങ്ങൾ',
  currentStock: 'കയ്യിലുള്ള സ്റ്റോക്ക്',
  minStock: 'കുറഞ്ഞ സ്റ്റോക്ക് പരിധി',
  unit: 'യൂണിറ്റ്',
  costPerUnit: 'ഒരു യൂണിറ്റിന് ചിലവ്',
  stockStatus: 'സ്റ്റോക്ക് നില',
  inStock: 'സ്റ്റോക്കുണ്ട്',
  lowStock: 'സ്റ്റോക്ക് കുറവാണ്',
  outOfStock: 'സ്റ്റോക്ക് തീർന്നു',
  stockValue: 'സ്റ്റോക്കിന്റെ മൂല്യം',

  mixturesTitle: 'തയ്യാറാക്കിയ മിശ്രിതങ്ങൾ',
  mixturesSubtitle: 'കേക്ക് നിർമ്മാണത്തിനുള്ള ക്രീമുകളും മിശ്രിതങ്ങളും',
  addMixture: 'പുതിയ മിശ്രിതം ചേർക്കുക',
  editMixture: 'മിശ്രിതം തിരുത്തുക',
  mixtureName: 'മിശ്രിതത്തിന്റെ പേര്',
  mixtureCode: 'കോഡ്',
  mixtureRecipe: 'കൂട്ട് (റസിപ്പി)',
  expectedOutput: 'ലഭിക്കേണ്ട അളവ്',
  prepareMixture: 'മിശ്രിതം ഉണ്ടാക്കുക',
  mixturePrepHistory: 'നിർമ്മാണ ചരിത്രം',
  mixtureConsumptionHistory: 'ഉപയോഗിച്ച കണക്കുകൾ',
  noMixturesYet: 'മിശ്രിതങ്ങൾ ഒന്നും ചേർത്തിട്ടില്ല',
  recipeIngredients: 'ആവശ്യമായ സാധനങ്ങൾ',
  actualYield: 'യഥാർത്ഥത്തിൽ ലഭിച്ച അളവ്',
  batchCost: 'ബാച്ച് ചിലവ്',

  productsTitle: 'ബേക്കറി ഉൽപ്പന്നങ്ങൾ',
  addProduct: 'പുതിയ ഉൽപ്പന്നം',
  editProduct: 'ഉൽപ്പന്നം തിരുത്തുക',
  productName: 'ഉൽപ്പന്നത്തിന്റെ പേര്',
  wholesalePrice: 'മൊത്തവില',
  retailPrice: 'ചില്ലറവില',
  recipe: 'റസിപ്പി',
  manageRecipe: 'റസിപ്പി തയ്യാറാക്കുക',

  ingredientsTitle: 'അസംസ്കൃത ചേരുവകൾ',
  addIngredient: 'പുതിയ ചേരുവ',
  editIngredient: 'ചേരുവ തിരുത്തുക',
  ingredientName: 'ചേരുവയുടെ പേര്',
  category: 'ഇനം',
  categoryBasic: 'പ്രധാന ചേരുവ',
  categoryOther: 'മറ്റ് ചേരുവകൾ',
  avgCost: 'ശരാശരി വില',

  salesTitle: 'വിൽപ്പന രേഖകൾ',
  newInvoice: 'പുതിയ ബിൽ',
  customerName: 'ഉപഭോക്താവിന്റെ പേര്',
  invoiceNo: 'ബിൽ നമ്പർ',
  amount: 'തുക',
  paid: 'പണം ലഭിച്ചു',
  unpaid: 'ബാക്കി',
  paymentMode: 'പണം നൽകിയ രീതി',

  wagesTitle: 'കൂലി കണക്കുകൾ',
  recordWage: 'കൂലി രേഖപ്പെടുത്തുക',
  workerName: 'തൊഴിലാളിയുടെ പേര്',
  wageAmount: 'കൂലി തുക',

  settingsTitle: 'ക്രമീകരണങ്ങൾ',
  bakeryProfile: 'സ്ഥാപന വിവരങ്ങൾ',
  bakeryName: 'സ്ഥാപനത്തിന്റെ പേര്',
  phone: 'ഫോൺ നമ്പർ',
  email: 'ഇമെയിൽ',
  location: 'സ്ഥലം',
  billFooter: 'ബില്ലിന്റെ അടിയിൽ നൽകേണ്ട കുറിപ്പ്',
  pinSecurity: 'പിൻ സുരക്ഷ',
  changePin: 'പിൻ മാറ്റുക',
  currentPin: 'നിലവിലെ പിൻ',
  newPin: 'പുതിയ പിൻ',
  confirmPin: 'പുതിയ പിൻ വീണ്ടും അടിക്കുക',
  themeToggle: 'വർണ്ണ രീതി',
  languageSelect: 'ഭാഷ തിരഞ്ഞെടുക്കുക',
  languageMalayalam: 'മലയാളം',
  languageEnglish: 'English',
};

const enTranslations: AdminTranslations = {
  appTitle: 'Pulari Bakes',
  adminConsole: 'Admin Console',
  welcome: 'Welcome',

  navDashboard: 'Dashboard',
  navInventory: 'Stock Inventory',
  navMixtures: 'Special Mixtures',
  navInsights: 'Analytics',
  navSales: 'Sales',
  navWages: 'Wages',
  navCosting: 'Costing',
  navProducts: 'Products',
  navIngredients: 'Raw Ingredients',
  navMovements: 'Stock Movements',
  navNotifications: 'Notifications',
  navSettings: 'Settings',
  navMenuHeader: 'Navigation',

  save: 'Save',
  cancel: 'Cancel',
  edit: 'Edit',
  delete: 'Delete',
  addNew: 'Add New',
  refresh: 'Refresh',
  search: 'Search',
  filter: 'Filter',
  download: 'Download',
  print: 'Print',
  close: 'Close',
  confirm: 'Confirm',
  logout: 'Sign Out',
  viewAll: 'View All',
  back: 'Back',
  status: 'Status',
  active: 'Active',
  inactive: 'Inactive',
  actions: 'Actions',
  loading: 'Loading...',
  noData: 'No records found',

  totalProducts: 'Total Products',
  totalIngredients: 'Total Ingredients',
  totalMixtures: 'Special Mixtures',
  currentStock: 'Current Stock',
  minStock: 'Minimum Stock',
  unit: 'Unit',
  costPerUnit: 'Cost per Unit',
  stockStatus: 'Stock Status',
  inStock: 'In Stock',
  lowStock: 'Low Stock',
  outOfStock: 'Out of Stock',
  stockValue: 'Inventory Value',

  mixturesTitle: 'Special Cooked Mixtures',
  mixturesSubtitle: 'Prepared intermediate mixtures & cake icings',
  addMixture: 'Add New Mixture',
  editMixture: 'Edit Mixture',
  mixtureName: 'Mixture Name',
  mixtureCode: 'Mixture Code',
  mixtureRecipe: 'Recipe Bill of Materials',
  expectedOutput: 'Expected Yield',
  prepareMixture: 'Prepare Mixture',
  mixturePrepHistory: 'Preparation History',
  mixtureConsumptionHistory: 'Usage History',
  noMixturesYet: 'No special mixtures created yet',
  recipeIngredients: 'Required Ingredients',
  actualYield: 'Actual Output Yield',
  batchCost: 'Batch Cost',

  productsTitle: 'Bakery Products',
  addProduct: 'Add Product',
  editProduct: 'Edit Product',
  productName: 'Product Name',
  wholesalePrice: 'Wholesale Price',
  retailPrice: 'Retail Price',
  recipe: 'Recipe',
  manageRecipe: 'Manage Recipe',

  ingredientsTitle: 'Raw Ingredients',
  addIngredient: 'Add Ingredient',
  editIngredient: 'Edit Ingredient',
  ingredientName: 'Ingredient Name',
  category: 'Category',
  categoryBasic: 'Basic Daily',
  categoryOther: 'General',
  avgCost: 'Average Cost',

  salesTitle: 'Sales Invoices',
  newInvoice: 'New Invoice',
  customerName: 'Customer Name',
  invoiceNo: 'Invoice Number',
  amount: 'Amount',
  paid: 'Paid',
  unpaid: 'Unpaid',
  paymentMode: 'Payment Mode',

  wagesTitle: 'Daily Labour & Wages',
  recordWage: 'Record Wage',
  workerName: 'Staff Name',
  wageAmount: 'Wage Amount',

  settingsTitle: 'Settings',
  bakeryProfile: 'Bakery Profile',
  bakeryName: 'Bakery Name',
  phone: 'Phone Number',
  email: 'Email Address',
  location: 'Location',
  billFooter: 'Invoice Footer Note',
  pinSecurity: 'PIN Security',
  changePin: 'Change PIN',
  currentPin: 'Current PIN',
  newPin: 'New PIN',
  confirmPin: 'Confirm New PIN',
  themeToggle: 'Theme Mode',
  languageSelect: 'Choose Language',
  languageMalayalam: 'മലയാളം',
  languageEnglish: 'English',
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: AdminTranslations;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (saved === 'en' || saved === 'ml') return saved;
    } catch {}
    return 'ml'; // Default to friendly Malayalam
  });

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
      window.dispatchEvent(new Event('storage'));
    } catch {}
  }, []);

  // Listen for storage event across tabs or sister app
  useEffect(() => {
    const handleStorage = () => {
      try {
        const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
        if (saved && (saved === 'en' || saved === 'ml')) {
          setLanguageState(saved);
        }
      } catch {}
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const t = useMemo(() => {
    return language === 'en' ? enTranslations : mlTranslations;
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
}

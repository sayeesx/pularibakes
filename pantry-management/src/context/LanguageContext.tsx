import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

export type Language = 'ml' | 'en';

export const LANGUAGE_STORAGE_KEY = 'pulari_language_preference';

export interface Translations {
  // App & Header
  appTitle: string;
  appSubtitle: string;
  productionInterface: string;
  ownerDashboard: string;
  offlineNotice: string;
  onlineNotice: string;
  switchLanguage: string;

  // Navigation
  navProduction: string;
  navProducts: string;
  navIngredients: string;
  navMixtures: string;
  navAdmin: string;
  navSettings: string;

  // Production workflow
  startProduction: string;
  recordProduction: string;
  selectProduct: string;
  searchProductPlaceholder: string;
  quantityToProduce: string;
  unit: string;
  requiredIngredients: string;
  requiredMixtures: string;
  actualConsumption: string;
  stockAvailability: string;
  inStock: string;
  insufficientStock: string;
  recipeNotConfigured: string;
  recipeNotConfiguredDesc: string;
  confirmProduction: string;
  confirmTitle: string;
  confirmDesc: string;
  productionSavedSuccess: string;
  productionRunsHistory: string;
  noProductionRecordsYet: string;
  operator: string;
  notes: string;
  cancelRun: string;
  cancelRunConfirm: string;
  cancellationReason: string;
  runStatusCompleted: string;
  runStatusCancelled: string;

  // Special Mixtures (Cooked intermediate preparations)
  mixturesSectionTitle: string;
  prepareMixtureBtn: string;
  prepareMixtureModalTitle: string;
  selectMixture: string;
  mixtureStock: string;
  mixtureRecipe: string;
  outputYield: string;
  confirmMixturePrep: string;
  mixtureSavedSuccess: string;
  usePreparedMixture: string;
  consumedMixtureQuantity: string;
  noMixturesAvailable: string;

  // Catalogue Management
  addProduct: string;
  editProduct: string;
  productName: string;
  sku: string;
  wholesalePrice: string;
  deactivate: string;
  activate: string;
  deleteProduct: string;
  deleteConfirmTitle: string;
  deleteConfirmDesc: string;

  addIngredient: string;
  editIngredient: string;
  ingredientName: string;
  category: string;
  categoryBasic: string;
  categoryOther: string;
  currentStock: string;
  minStock: string;
  avgCostPerUnit: string;

  // Packing
  packingTitle: string;
  packetType: string;
  packetsCount: string;
  totalWeight: string;
  recordPacking: string;
  packingHistory: string;

  // Daily shared
  dailySharedClosing: string;
  oilClosingTitle: string;
  oilOpeningBalance: string;
  oilPurchased: string;
  oilClosingBalance: string;
  oilConsumed: string;
  saveDailyClosing: string;

  // Common UI
  save: string;
  cancel: string;
  close: string;
  edit: string;
  delete: string;
  confirm: string;
  back: string;
  loading: string;
  search: string;
  refresh: string;
  today: string;
  yesterday: string;
  date: string;
  actions: string;
  error: string;
  success: string;
  malayalam: string;
  english: string;
  languageSelect: string;
}

const mlTranslations: Translations = {
  appTitle: 'പുലരി ബേക്സ്',
  appSubtitle: 'ബേക്കറി ഉൽപ്പാദനവും സ്റ്റോക്ക് വിവരങ്ങളും',
  productionInterface: 'അടുക്കള & ഉൽപ്പാദനം',
  ownerDashboard: 'അഡ്മിൻ പാനൽ',
  offlineNotice: 'ഇന്റർനെറ്റ് ലഭ്യമല്ല. ഓഫ്ലൈൻ രീതിയിലാണ് പ്രവർത്തിക്കുന്നത്.',
  onlineNotice: 'ഇന്റർനെറ്റ് ബന്ധം പുനഃസ്ഥാപിച്ചു.',
  switchLanguage: 'English',

  navProduction: 'ഉൽപ്പാദനം',
  navProducts: 'ഉൽപ്പന്നങ്ങൾ',
  navIngredients: 'ചേരുവകൾ',
  navMixtures: 'മിശ്രിതങ്ങൾ',
  navAdmin: 'അഡ്മിൻ',
  navSettings: 'ക്രമീകരണങ്ങൾ',

  startProduction: 'ഉൽപ്പാദനം തുടങ്ങുക',
  recordProduction: 'ഉൽപ്പാദനം രേഖപ്പെടുത്തുക',
  selectProduct: 'ഉൽപ്പന്നം തിരഞ്ഞെടുക്കുക',
  searchProductPlaceholder: 'ഉൽപ്പന്നം തിരയുക...',
  quantityToProduce: 'ഉണ്ടാക്കേണ്ട അളവ്',
  unit: 'യൂണിറ്റ്',
  requiredIngredients: 'ആവശ്യമായ ചേരുവകൾ',
  requiredMixtures: 'ആവശ്യമായ തയ്യാറാക്കിയ മിശ്രിതങ്ങൾ',
  actualConsumption: 'ഉപയോഗിച്ച ചേരുവകൾ',
  stockAvailability: 'ലഭ്യമായ സ്റ്റോക്ക്',
  inStock: 'സ്റ്റോക്കുണ്ട്',
  insufficientStock: 'സ്റ്റോക്ക് തികയില്ല',
  recipeNotConfigured: 'റസിപ്പി തയ്യാറാക്കിയിട്ടില്ല',
  recipeNotConfiguredDesc: 'ഈ ഉൽപ്പന്നത്തിന് ചേരുവകളുടെ അളവ് നിശ്ചയിച്ചിട്ടില്ല.',
  confirmProduction: 'ഉൽപ്പാദനം സ്ഥിരീകരിക്കുക',
  confirmTitle: 'ഉൽപ്പാദനം രേഖപ്പെടുത്തട്ടെ?',
  confirmDesc: 'ഉപയോഗിച്ച ചേരുവകളും മിശ്രിതങ്ങളും സ്റ്റോക്കിൽ നിന്ന് കുറയ്ക്കപ്പെടും.',
  productionSavedSuccess: 'ഉൽപ്പാദനം വിജയകരമായി രേഖപ്പെടുത്തി.',
  productionRunsHistory: 'ഇന്നത്തെ ഉൽപ്പാദന രേഖകൾ',
  noProductionRecordsYet: 'ഇന്ന് ഉൽപ്പാദന രേഖകൾ ഒന്നും ചേർത്തിട്ടില്ല.',
  operator: 'തയ്യാറാക്കിയ ആൾ',
  notes: 'കുറിപ്പുകൾ',
  cancelRun: 'റദ്ദാക്കുക',
  cancelRunConfirm: 'ഈ ഉൽപ്പാദനം റദ്ദാക്കട്ടെ? ചേരുവകൾ തിരികെ സ്റ്റോക്കിൽ ചേരും.',
  cancellationReason: 'റദ്ദാക്കാനുള്ള കാരണം',
  runStatusCompleted: 'പൂർത്തിയായി',
  runStatusCancelled: 'റദ്ദാക്കി',

  mixturesSectionTitle: 'തയ്യാറാക്കിയ കേക്ക് മിശ്രിതങ്ങൾ',
  prepareMixtureBtn: 'മിശ്രിതം ഉണ്ടാക്കുക',
  prepareMixtureModalTitle: 'പുതിയ മിശ്രിതം തയ്യാറാക്കൽ',
  selectMixture: 'മിശ്രിതം തിരഞ്ഞെടുക്കുക',
  mixtureStock: 'കയ്യിലുള്ള മിശ്രിതം',
  mixtureRecipe: 'മിശ്രിതത്തിന്റെ കൂട്ട്',
  outputYield: 'ഉണ്ടാക്കിയ അളവ്',
  confirmMixturePrep: 'മിശ്രിത നിർമ്മാണം സ്ഥിരീകരിക്കുക',
  mixtureSavedSuccess: 'മിശ്രിതം വിജയകരമായി തയ്യാറാക്കി സ്റ്റോക്കിൽ ചേർത്തു.',
  usePreparedMixture: 'തയ്യാറാക്കിയ മിശ്രിതം ഉപയോഗിക്കുക',
  consumedMixtureQuantity: 'ഉപയോഗിച്ച മിശ്രിതത്തിന്റെ അളവ്',
  noMixturesAvailable: 'മിശ്രിതങ്ങൾ ഒന്നും ലഭ്യമായിട്ടില്ല',

  addProduct: 'പുതിയ ഉൽപ്പന്നം',
  editProduct: 'ഉൽപ്പന്നം തിരുത്തുക',
  productName: 'ഉൽപ്പന്നത്തിന്റെ പേര്',
  sku: 'കോഡ്',
  wholesalePrice: 'മൊത്തവില',
  deactivate: 'ലഭ്യമല്ലാതാക്കുക',
  activate: 'ലഭ്യമാക്കുക',
  deleteProduct: 'ഒഴിവാക്കുക',
  deleteConfirmTitle: 'ഉൽപ്പന്നം ഒഴിവാക്കട്ടെ?',
  deleteConfirmDesc: 'ഈ ഉൽപ്പന്നം ലിസ്റ്റിൽ നിന്ന് നീക്കം ചെയ്യപ്പെടും.',

  addIngredient: 'പുതിയ ചേരുവ',
  editIngredient: 'ചേരുവ തിരുത്തുക',
  ingredientName: 'ചേരുവയുടെ പേര്',
  category: 'ഇനം',
  categoryBasic: 'പ്രധാന ചേരുവ',
  categoryOther: 'മറ്റ് ചേരുവകൾ',
  currentStock: 'കയ്യിലുള്ള സ്റ്റോക്ക്',
  minStock: 'കുറഞ്ഞ സ്റ്റോക്ക് പരിധി',
  avgCostPerUnit: 'ശരാശരി ചിലവ്',

  packingTitle: 'പാക്കിംഗ് വിവരങ്ങൾ',
  packetType: 'പാക്കറ്റ് ഇനം',
  packetsCount: 'പാക്കറ്റുകളുടെ എണ്ണം',
  totalWeight: 'ആകെ തൂക്കം',
  recordPacking: 'പാക്കിംഗ് രേഖപ്പെടുത്തുക',
  packingHistory: 'പാക്കിംഗ് രേഖകൾ',

  dailySharedClosing: 'ദിവസേനയുള്ള കണക്കുകൾ',
  oilClosingTitle: 'ഓയിൽ കണക്ക്',
  oilOpeningBalance: 'തുടക്കത്തിലെ ഓയിൽ',
  oilPurchased: 'വാങ്ങിയ ഓയിൽ',
  oilClosingBalance: 'ബാക്കി വന്ന ഓയിൽ',
  oilConsumed: 'ഉപയോഗിച്ച ഓയിൽ',
  saveDailyClosing: 'കണക്ക് സൂക്ഷിക്കുക',

  save: 'സൂക്ഷിക്കുക',
  cancel: 'റദ്ദാക്കുക',
  close: 'അടയ്ക്കുക',
  edit: 'തിരുത്തുക',
  delete: 'ഒഴിവാക്കുക',
  confirm: 'ഉറപ്പാക്കുക',
  back: 'പിന്നോട്ട്',
  loading: 'കാത്തിരിക്കൂ...',
  search: 'തിരയുക...',
  refresh: 'പുതുക്കുക',
  today: 'ഇന്ന്',
  yesterday: 'ഇന്നലെ',
  date: 'തീയതി',
  actions: 'നടപടികൾ',
  error: 'പിശക് സംഭവിച്ചു',
  success: 'വിജയകരം',
  malayalam: 'മലയാളം',
  english: 'English',
  languageSelect: 'ഭാഷ തിരഞ്ഞെടുക്കുക',
};

const enTranslations: Translations = {
  appTitle: 'Pulari Bakes',
  appSubtitle: 'Bakery Production & Inventory Management',
  productionInterface: 'Kitchen & Production',
  ownerDashboard: 'Owner Dashboard',
  offlineNotice: 'No internet connection. Running in offline mode.',
  onlineNotice: 'Internet connection restored.',
  switchLanguage: 'മലയാളം',

  navProduction: 'Production',
  navProducts: 'Products',
  navIngredients: 'Ingredients',
  navMixtures: 'Mixtures',
  navAdmin: 'Admin',
  navSettings: 'Settings',

  startProduction: 'Start Production',
  recordProduction: 'Record Production',
  selectProduct: 'Select Product',
  searchProductPlaceholder: 'Search product...',
  quantityToProduce: 'Target Quantity',
  unit: 'Unit',
  requiredIngredients: 'Required Ingredients',
  requiredMixtures: 'Prepared Mixtures Used',
  actualConsumption: 'Actual Ingredients Consumed',
  stockAvailability: 'Stock Availability',
  inStock: 'In Stock',
  insufficientStock: 'Insufficient Stock',
  recipeNotConfigured: 'No Recipe Configured',
  recipeNotConfiguredDesc: 'Ingredient proportions are not defined for this product.',
  confirmProduction: 'Confirm Production',
  confirmTitle: 'Save Production Run?',
  confirmDesc: 'Consumed raw ingredients and mixtures will be deducted from inventory.',
  productionSavedSuccess: 'Production run recorded successfully.',
  productionRunsHistory: "Today's Production Batches",
  noProductionRecordsYet: 'No production batches recorded today.',
  operator: 'Operator',
  notes: 'Notes',
  cancelRun: 'Cancel Batch',
  cancelRunConfirm: 'Cancel this batch? Consumed stocks will be restored.',
  cancellationReason: 'Cancellation Reason',
  runStatusCompleted: 'Completed',
  runStatusCancelled: 'Cancelled',

  mixturesSectionTitle: 'Prepared Cake Mixtures',
  prepareMixtureBtn: 'Prepare Mixture',
  prepareMixtureModalTitle: 'Prepare Special Mixture Batch',
  selectMixture: 'Select Mixture',
  mixtureStock: 'Current Stock',
  mixtureRecipe: 'Mixture Recipe',
  outputYield: 'Prepared Output Yield',
  confirmMixturePrep: 'Confirm Preparation',
  mixtureSavedSuccess: 'Special mixture prepared and added to stock.',
  usePreparedMixture: 'Use Prepared Mixture',
  consumedMixtureQuantity: 'Quantity Consumed',
  noMixturesAvailable: 'No prepared mixtures available',

  addProduct: 'Add Product',
  editProduct: 'Edit Product',
  productName: 'Product Name',
  sku: 'Item Code',
  wholesalePrice: 'Wholesale Price',
  deactivate: 'Deactivate',
  activate: 'Activate',
  deleteProduct: 'Delete',
  deleteConfirmTitle: 'Delete Product?',
  deleteConfirmDesc: 'This product will be removed from active lists.',

  addIngredient: 'Add Ingredient',
  editIngredient: 'Edit Ingredient',
  ingredientName: 'Ingredient Name',
  category: 'Category',
  categoryBasic: 'Basic Daily',
  categoryOther: 'General',
  currentStock: 'Current Stock',
  minStock: 'Minimum Stock Level',
  avgCostPerUnit: 'Average Cost',

  packingTitle: 'Packing Records',
  packetType: 'Packet Size',
  packetsCount: 'Packets Count',
  totalWeight: 'Total Weight',
  recordPacking: 'Record Packing',
  packingHistory: 'Packing History',

  dailySharedClosing: 'Daily Closing Log',
  oilClosingTitle: 'Daily Oil Log',
  oilOpeningBalance: 'Opening Oil Balance',
  oilPurchased: 'Oil Added',
  oilClosingBalance: 'Closing Oil Balance',
  oilConsumed: 'Oil Consumed',
  saveDailyClosing: 'Save Daily Closing',

  save: 'Save',
  cancel: 'Cancel',
  close: 'Close',
  edit: 'Edit',
  delete: 'Delete',
  confirm: 'Confirm',
  back: 'Back',
  loading: 'Loading...',
  search: 'Search...',
  refresh: 'Refresh',
  today: 'Today',
  yesterday: 'Yesterday',
  date: 'Date',
  actions: 'Actions',
  error: 'An error occurred',
  success: 'Success',
  malayalam: 'മലയാളം',
  english: 'English',
  languageSelect: 'Choose Language',
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations & ((key: string, fallback?: string) => string);
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (saved === 'en' || saved === 'ml') return saved;
    } catch {}
    return 'ml';
  });

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
      window.dispatchEvent(new Event('storage'));
    } catch {}
  }, []);

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
    const dict = language === 'en' ? enTranslations : mlTranslations;
    const fn = (key: string, fallback?: string): string => {
      const cleanKey = key.includes('.') ? key.split('.').pop()! : key;
      return (dict as any)[cleanKey] || fallback || key;
    };
    return Object.assign(fn, dict) as Translations & ((key: string, fallback?: string) => string);
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

import React, { useState, useEffect, useRef } from 'react';
import {
  FiSend,
  FiX,
  FiZap,
  FiMinus,
  FiMessageSquare,
  FiTrendingUp,
  FiAlertTriangle,
  FiCheckCircle,
  FiDollarSign,
  FiDroplet,
  FiCopy,
  FiCheck,
} from 'react-icons/fi';
import { Product, Ingredient, ProductionRun, StockMovement, Recipe } from '../types';

interface AIAdminAssistantProps {
  products: Product[];
  ingredients: Ingredient[];
  productionRuns: ProductionRun[];
  stockMovements?: StockMovement[];
  recipes?: Recipe[];
  onRefresh: () => void;
  isOpen?: boolean;
  onToggle?: () => void;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
}

export const AIAdminAssistant: React.FC<AIAdminAssistantProps> = ({
  products,
  ingredients,
  productionRuns,
  stockMovements = [],
  recipes = [],
  onRefresh,
  isOpen: controlledIsOpen,
  onToggle,
}) => {
  const [internalIsOpen, setInternalIsOpen] = useState<boolean>(false);
  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;

  const toggleOpen = () => {
    if (onToggle) {
      onToggle();
    } else {
      setInternalIsOpen((prev) => !prev);
    }
  };

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'welcome',
      sender: 'ai',
      text: `നമസ്കാരം! ഞാൻ നിങ്ങളുടെ Pulari Bakes ഫാക്ടറി AI അസിസ്റ്റന്റ് ആണ്. 🧑‍🍳\n\nഇന്നത്തെ ഉൽപ്പാദനം, ഓയിൽ ഉപഭോഗം, കുറഞ്ഞ സ്റ്റോക്ക്, കോസ്റ്റിംഗ് എന്നിവ അറിയാൻ താഴെ നൽകിയിരിക്കുന്ന ബട്ടണുകൾ ഉപയോഗിക്കുക:`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [isThinking, setIsThinking] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isThinking, isOpen]);

  // Copy message text
  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Compute live metrics for AI context
  const todayStr = new Date().toISOString().split('T')[0];
  const todayRuns = productionRuns.filter((r) => r.productionDate === todayStr && r.status === 'completed');
  const todayOutputKg = todayRuns.reduce((sum, r) => sum + (Number(r.actualQuantity) || 0), 0);
  const lowStockIngredients = ingredients.filter(
    (i) => i.isActive && i.minStock > 0 && i.currentStock <= i.minStock
  );
  const totalStockValuation = Math.round(
    ingredients.reduce((sum, i) => sum + (Number(i.currentStock) || 0) * (Number(i.avgCostPerUnit) || 0), 0)
  );

  // Generate localized response based on prompt
  const generateResponse = (prompt: string): string => {
    const q = prompt.toLowerCase();

    // 1. Production report
    if (q.includes('ഉൽപ്പാദന റിപ്പോർട്ട്') || q.includes('production')) {
      return `📊 **ഇന്നത്തെ ഉൽപ്പാദന റിപ്പോർട്ട് (${todayStr})**
----------------------------------------
• **പൂർത്തിയായ ബാച്ചുകൾ:** ${todayRuns.length} എണ്ണം
• **ആകെ ഉൽപ്പാദനം:** **${todayOutputKg} kg**
• **സജീവ ഉൽപ്പന്നങ്ങൾ:** ${products.length} ഇനങ്ങൾ
• **സ്റ്റോക്ക് മൂല്യം:** **₹${totalStockValuation.toLocaleString('en-IN')}**

💡 **നിരീക്ഷണം:**
${
  todayOutputKg > 0
    ? `ഇന്ന് ഫാക്ടറിയിൽ ഉൽപ്പാദനം സജീവമാണ്. ശരാശരി ബാച്ച് ഔട്ട്പുട്ട് ${(todayOutputKg / (todayRuns.length || 1)).toFixed(1)} kg ആണ്.`
    : `ഇന്ന് ഇതുവരെ പൂർത്തിയായ ബാച്ചുകൾ രേഖപ്പെടുത്തിയിട്ടില്ല. അടുക്കളയിൽ പ്രൊഡക്ഷൻ റൺ ആരംഭിക്കുക.`
}

⚠️ **സ്റ്റോക്ക് മുന്നറിയിപ്പ്:** ${lowStockIngredients.length} ചേരുവകൾ കുറഞ്ഞ പരിധിയിലാണ്.`;
    }

    // 2. Oil optimization
    if (q.includes('ഓയിൽ') || q.includes('oil')) {
      return `💡 **ഓയിൽ ഒപ്റ്റിമൈസേഷൻ നിർദ്ദേശങ്ങൾ:**
----------------------------------------
1. **താപനില ക്രമീകരണം:** എണ്ണ 175°C - 180°C താപനിലയിൽ നിലനിർത്തുക. താപനില കുറഞ്ഞാൽ പലഹാരങ്ങൾ കൂടുതൽ എണ്ണ വലിച്ചെടുക്കും.
2. **ഫ്രൈയിംഗ് സമയം:** ഓരോ ബാച്ചും അമിതമായി എണ്ണയിൽ കിടക്കാതെ ഗോൾഡൻ നിറമാകുമ്പോൾ തന്നെ മാറ്റുക.
3. **ഡ്രെയിനിംഗ് ട്രേ:** വറുത്തു കോരിയ പലഹാരങ്ങൾ 2-3 മിനിറ്റ് ഡ്രെയിനിംഗ് വയർ മെഷിൽ വെച്ച് അധിക എണ്ണ വറ്റിക്കുക. (ഇത് വഴി 4-6% എണ്ണ ലാഭിക്കാം).
4. **ഫിൽട്ടറിംഗ്:** ദിവസേനയുള്ള പ്രൊഡക്ഷൻ കഴിഞ്ഞയുടൻ എണ്ണ ഫിൽട്ടർ ചെയ്തു കരിഞ്ഞ തരികൾ നീക്കം ചെയ്താൽ എണ്ണയുടെ ആയുസ്സ് 25% വർദ്ധിക്കും.`;
    }

    // 3. Low stock
    if (q.includes('കുറഞ്ഞ സ്റ്റോക്ക്') || q.includes('stock')) {
      if (lowStockIngredients.length === 0) {
        return `✅ **സ്റ്റോക്ക് നില തൃപ്തികരമാണ്!**\nനിലവിൽ എല്ലാ ചേരുവകളും സുരക്ഷിത പരിധിക്ക് മുകളിലാണ്.\n• ആകെ ചേരുവകൾ: ${ingredients.length}\n• സ്റ്റോക്ക് മൂല്യം: ₹${totalStockValuation.toLocaleString('en-IN')}`;
      }

      const list = lowStockIngredients
        .slice(0, 6)
        .map((i) => `• **${i.name}:** ബാക്കി ${i.currentStock} ${i.unit} (മിനിമം: ${i.minStock} ${i.unit})`)
        .join('\n');

      return `⚠️ **കുറഞ്ഞ സ്റ്റോക്ക് മുന്നറിയിപ്പ് (Low Stock Alert):**
----------------------------------------
താഴെ പറയുന്ന ${lowStockIngredients.length} ചേരുവകൾ ഉടൻ റീ-ഓർഡർ ചെയ്യേണ്ടതാണ്:

${list}
${lowStockIngredients.length > 6 ? `\n...+${lowStockIngredients.length - 6} ചേരുവകൾ കൂടി` : ''}`;
    }

    // 4. Costing & Profit
    if (q.includes('കോസ്റ്റിംഗ്') || q.includes('ലാഭം') || q.includes('costing')) {
      return `💰 **കോസ്റ്റിംഗ് & ലാഭവിഹിത വിശകലനം:**
----------------------------------------
• **അസംസ്കൃത വസ്തു മൂല്യം:** ₹${totalStockValuation.toLocaleString('en-IN')}
• **ഉൽപ്പന്നങ്ങളുടെ ശരാശരി മാർജിൻ:** ~28% - 35%
• **കൂലി അനുപാതം:** ഉൽപ്പാദന ചെലവിന്റെ ഏകദേശം 15% - 18% കൂലിക്കായി ചിലവഴിക്കപ്പെടുന്നു.

📈 **നിർദ്ദേശം:**
1. ചേരുവകൾ ബൾക്കായി വാങ്ങുമ്പോൾ മൊത്തവില കിഴിവുകൾ ഉറപ്പാക്കുക.
2. പാക്കിംഗ് നഷ്ടങ്ങൾ കുറയ്ക്കാൻ കൃത്യമായ ഗ്രാം തൂക്കം മെഷീൻ ഉപയോഗിക്കുക.`;
    }

    return `നന്ദി! കൂടുതൽ വിവരങ്ങൾക്ക് മുകളിലെ ബട്ടണുകളിൽ ക്ലിക്ക് ചെയ്യുക.`;
  };

  const handleActionClick = (promptText: string) => {
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: promptText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsThinking(true);

    setTimeout(() => {
      const reply = generateResponse(promptText);
      const aiMsg: ChatMessage = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, aiMsg]);
      setIsThinking(false);
    }, 450);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in font-sans">
      <div className="w-full max-w-2xl h-[620px] max-h-[92vh] bg-white dark:bg-[#212121] rounded-2xl shadow-2xl border border-stone-200 dark:border-[#2f2f2f] flex flex-col overflow-hidden my-auto">
        {/* ChatGPT Top Bar */}
        <div className="px-4 py-3 bg-white dark:bg-[#212121] border-b border-stone-200 dark:border-[#2f2f2f] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-emerald-600/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <FiZap className="w-4 h-4 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-stone-900 dark:text-white leading-none">
                  Pulari Bakes Assistant
                </h3>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-stone-100 dark:bg-[#2f2f2f] text-stone-600 dark:text-stone-300 border border-stone-200 dark:border-[#383838]">
                  GPT-4o Model
                </span>
              </div>
              <p className="text-[10px] text-stone-400 font-malayalam mt-0.5">
                തത്സമയ ഫാക്ടറി ഉപദേശകൻ (Production & Advisory)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={toggleOpen}
            className="w-8 h-8 rounded-full flex items-center justify-center text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-[#2f2f2f] transition-colors cursor-pointer"
            title="Close Assistant"
          >
            <FiX className="w-4 h-4" />
          </button>
        </div>

        {/* ChatGPT Style Quick Prompt Chips */}
        <div className="px-4 py-2.5 bg-stone-50/70 dark:bg-[#1a1a1a] border-b border-stone-100 dark:border-[#2a2a2a] overflow-x-auto no-scrollbar flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => handleActionClick('ഉൽപ്പാദന റിപ്പോർട്ട്')}
            className="px-3 py-1.5 rounded-full border border-stone-200 dark:border-[#383838] bg-white dark:bg-[#262626] hover:bg-stone-50 dark:hover:bg-[#303030] text-xs font-medium text-stone-700 dark:text-stone-300 transition-all cursor-pointer flex items-center gap-1.5 shrink-0 shadow-2xs font-malayalam"
          >
            <span>📊</span>
            <span>ഉൽപ്പാദന റിപ്പോർട്ട്</span>
          </button>

          <button
            type="button"
            onClick={() => handleActionClick('ഓയിൽ ഒപ്റ്റിമൈസേഷൻ')}
            className="px-3 py-1.5 rounded-full border border-stone-200 dark:border-[#383838] bg-white dark:bg-[#262626] hover:bg-stone-50 dark:hover:bg-[#303030] text-xs font-medium text-stone-700 dark:text-stone-300 transition-all cursor-pointer flex items-center gap-1.5 shrink-0 shadow-2xs font-malayalam"
          >
            <span>💡</span>
            <span>ഓയിൽ ഒപ്റ്റിമൈസേഷൻ</span>
          </button>

          <button
            type="button"
            onClick={() => handleActionClick('കുറഞ്ഞ സ്റ്റോക്ക്')}
            className="px-3 py-1.5 rounded-full border border-stone-200 dark:border-[#383838] bg-white dark:bg-[#262626] hover:bg-stone-50 dark:hover:bg-[#303030] text-xs font-medium text-stone-700 dark:text-stone-300 transition-all cursor-pointer flex items-center gap-1.5 shrink-0 shadow-2xs font-malayalam"
          >
            <span>⚠️</span>
            <span>കുറഞ്ഞ സ്റ്റോക്ക്</span>
          </button>

          <button
            type="button"
            onClick={() => handleActionClick('കോസ്റ്റിംഗ് & ലാഭം')}
            className="px-3 py-1.5 rounded-full border border-stone-200 dark:border-[#383838] bg-white dark:bg-[#262626] hover:bg-stone-50 dark:hover:bg-[#303030] text-xs font-medium text-stone-700 dark:text-stone-300 transition-all cursor-pointer flex items-center gap-1.5 shrink-0 shadow-2xs font-malayalam"
          >
            <span>💰</span>
            <span>കോസ്റ്റിംഗ് & ലാഭം</span>
          </button>
        </div>

        {/* ChatGPT Style Messages Stream */}
        <div className="flex-1 p-4 sm:p-6 overflow-y-auto space-y-5 bg-white dark:bg-[#212121]">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.sender === 'ai' && (
                <div className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs shrink-0 mt-0.5">
                  <FiZap className="w-3.5 h-3.5 fill-current" />
                </div>
              )}

              <div
                className={`text-xs leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-stone-100 dark:bg-[#2f2f2f] text-stone-900 dark:text-stone-100 rounded-3xl px-4 py-2.5 max-w-[80%] font-medium'
                    : 'text-stone-800 dark:text-stone-200 flex-1 min-w-0 font-sans'
                }`}
              >
                <div className="whitespace-pre-line font-malayalam leading-relaxed">
                  {msg.text}
                </div>

                {msg.sender === 'ai' && (
                  <div className="flex items-center gap-3 mt-2.5 pt-1.5 text-[11px] text-stone-400">
                    <span>{msg.timestamp}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(msg.id, msg.text)}
                      className="flex items-center gap-1 hover:text-stone-700 dark:hover:text-stone-200 transition-colors cursor-pointer"
                      title="Copy response"
                    >
                      {copiedId === msg.id ? (
                        <>
                          <FiCheck className="w-3 h-3 text-emerald-500" />
                          <span className="text-emerald-500 font-semibold">Copied</span>
                        </>
                      ) : (
                        <>
                          <FiCopy className="w-3 h-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {isThinking && (
            <div className="flex gap-3 items-center">
              <div className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs shrink-0">
                <FiZap className="w-3.5 h-3.5 fill-current" />
              </div>
              <div className="flex items-center gap-1.5 py-1">
                <span className="w-2 h-2 rounded-full bg-stone-400 dark:bg-stone-500 animate-pulse" />
                <span className="w-2 h-2 rounded-full bg-stone-400 dark:bg-stone-500 animate-pulse [animation-delay:0.2s]" />
                <span className="w-2 h-2 rounded-full bg-stone-400 dark:bg-stone-500 animate-pulse [animation-delay:0.4s]" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* ChatGPT Style Bottom Input Bar */}
        <div className="p-3 sm:p-4 bg-white dark:bg-[#212121] border-t border-stone-100 dark:border-[#2f2f2f] shrink-0">
          <div className="rounded-3xl border border-stone-200 dark:border-[#383838] bg-stone-50 dark:bg-[#2f2f2f] px-4 py-2 flex items-center gap-2 shadow-2xs">
            <input
              type="text"
              disabled
              readOnly
              value=""
              placeholder="AI ഉടൻ വരുന്നു... (AI is coming soon)"
              className="flex-1 bg-transparent border-0 text-xs text-stone-500 placeholder-stone-400 dark:placeholder-stone-500 cursor-not-allowed select-none font-medium focus:outline-none"
            />
            <button
              type="button"
              disabled
              className="w-7 h-7 rounded-full bg-stone-300 dark:bg-stone-600 text-white flex items-center justify-center opacity-60 cursor-not-allowed shrink-0"
              title="AI is coming soon"
            >
              <FiSend className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[10px] text-center text-stone-400 dark:text-stone-500 mt-2 font-medium">
            Pulari Bakes AI assists with production metrics. Always verify actual physical stock and measurements.
          </p>
        </div>
      </div>
    </div>
  );
};

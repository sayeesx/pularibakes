import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FiChevronDown, FiCheck, FiSearch } from 'react-icons/fi';

export interface ThemeSelectOption {
  value: string;
  label: string;
  badge?: string;
}

interface ThemeSelectProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: ThemeSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  dropUp?: boolean;
  searchable?: boolean;
}

export const ThemeSelect: React.FC<ThemeSelectProps> = ({
  label,
  value,
  onChange,
  options,
  placeholder = 'Select option...',
  disabled = false,
  className = '',
  dropUp = false,
  searchable,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    width: number;
    isDropUp: boolean;
  } | null>(null);

  const updatePosition = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const preferDropUp = dropUp || (spaceBelow < 250 && spaceAbove > spaceBelow);

    const minWidth = Math.max(rect.width, 200);
    let left = rect.left;
    if (left + minWidth > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - minWidth - 12);
    }

    setCoords({
      top: preferDropUp ? rect.top - 6 : rect.bottom + 6,
      left,
      width: minWidth,
      isDropUp: preferDropUp,
    });
  };

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        buttonRef.current &&
        !buttonRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('keydown', handleKeyDown);
      updatePosition();
      // focus search input if searchable
      if (searchable || options.length >= 6) {
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
    }

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, searchable, options.length]);

  useEffect(() => {
    if (!isOpen) return;
    const handleScrollOrResize = () => {
      updatePosition();
    };
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);
    return () => {
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [isOpen]);

  const selectedOpt = options.find((o) => o.value === value);

  const showSearch = searchable ?? options.length >= 6;

  const filteredOptions = showSearch && searchQuery.trim()
    ? options.filter((o) =>
        o.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (o.badge && o.badge.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : options;

  const handleToggle = () => {
    if (disabled) return;
    if (!isOpen) {
      setSearchQuery('');
      updatePosition();
    }
    setIsOpen((prev) => !prev);
  };

  return (
    <div className={`relative ${className}`}>
      {label && (
        <label className="block font-bold text-stone-700 dark:text-stone-300 font-malayalam mb-1">
          {label}
        </label>
      )}

      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={handleToggle}
        className={`w-full flex items-center justify-between gap-2 p-2.5 rounded-xl border ${
          isOpen
            ? 'border-epso-red dark:border-amber-500 ring-2 ring-epso-red/20 dark:ring-amber-500/20'
            : 'border-stone-200 dark:border-[#2E2828] hover:border-stone-400 dark:hover:border-stone-600'
        } bg-stone-50 dark:bg-[#141212] text-stone-900 dark:text-white text-xs font-semibold transition-all cursor-pointer text-left press-apple`}
      >
        <span className="truncate">
          {selectedOpt ? selectedOpt.label : placeholder}
        </span>
        <div className="flex items-center gap-1.5 shrink-0 text-stone-400">
          {selectedOpt?.badge && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-200 dark:bg-stone-800 text-stone-600 dark:text-stone-300 font-bold">
              {selectedOpt.badge}
            </span>
          )}
          <FiChevronDown
            className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {isOpen && coords && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: coords.isDropUp ? undefined : coords.top,
            bottom: coords.isDropUp ? window.innerHeight - coords.top : undefined,
            left: coords.left,
            width: coords.width,
            zIndex: 99999,
          }}
          className="bg-white dark:bg-[#1E1B1B] border border-stone-200 dark:border-[#2E2828] rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 p-1"
        >
          {showSearch && (
            <div className="p-1.5 border-b border-stone-100 dark:border-[#282323]">
              <div className="relative">
                <FiSearch className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="തിരയുക / Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-2 py-1.5 text-xs rounded-lg bg-stone-100 dark:bg-[#141212] border border-stone-200 dark:border-[#2E2828] text-stone-900 dark:text-white placeholder-stone-400 focus:outline-none focus:ring-1 focus:ring-epso-red dark:focus:ring-amber-500 font-malayalam"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          )}

          <div className="max-h-56 overflow-y-auto no-scrollbar space-y-0.5 p-0.5">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-3 text-center text-xs text-stone-400 font-malayalam">
                ഒന്നും കണ്ടെത്താനായില്ല (No match)
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <div
                    key={opt.value}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChange(opt.value);
                      setIsOpen(false);
                    }}
                    className={`px-3 py-2 rounded-xl text-xs flex items-center justify-between cursor-pointer transition-colors font-malayalam ${
                      isSelected
                        ? 'bg-red-50 dark:bg-amber-950/40 text-epso-red dark:text-amber-400 font-bold'
                        : 'text-stone-800 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-[#282323]'
                    }`}
                  >
                    <span className="truncate">{opt.label}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {opt.badge && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400">
                          {opt.badge}
                        </span>
                      )}
                      {isSelected && (
                        <FiCheck className="w-3.5 h-3.5 text-epso-red dark:text-amber-400 shrink-0 ml-1" />
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

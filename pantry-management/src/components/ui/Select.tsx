import React, { forwardRef, useState, useRef, useEffect, useId } from 'react';
import { TbChevronDown, TbCheck } from 'react-icons/tb';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options?: SelectOption[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      error,
      helperText,
      options: propOptions,
      children,
      className = '',
      id,
      value,
      defaultValue,
      onChange,
      disabled = false,
      placeholder = 'Select an option...',
      name,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : generatedId);

    // Extract options from props or children (<option> elements)
    const options: SelectOption[] = React.useMemo(() => {
      if (propOptions && propOptions.length > 0) {
        return propOptions;
      }
      if (children) {
        const extracted: SelectOption[] = [];
        React.Children.forEach(children, (child) => {
          if (React.isValidElement(child) && child.type === 'option') {
            const childProps = child.props as any;
            extracted.push({
              value: String(childProps.value ?? ''),
              label: String(childProps.children ?? childProps.value ?? ''),
            });
          }
        });
        return extracted;
      }
      return [];
    }, [propOptions, children]);

    const isControlled = value !== undefined;
    const [uncontrolledValue, setUncontrolledValue] = useState<string>(() => {
      if (defaultValue !== undefined) return String(defaultValue);
      return options.length > 0 ? options[0].value : '';
    });

    const currentValue = isControlled ? String(value) : uncontrolledValue;

    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const nativeSelectRef = useRef<HTMLSelectElement | null>(null);

    useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
          setIsOpen(false);
        }
      };

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && isOpen) {
          setIsOpen(false);
        }
      };

      if (isOpen) {
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);
      }
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }, [isOpen]);

    const handleSelectOption = (optValue: string) => {
      if (disabled) return;

      if (!isControlled) {
        setUncontrolledValue(optValue);
      }

      setIsOpen(false);

      if (nativeSelectRef.current) {
        nativeSelectRef.current.value = optValue;
      }

      if (onChange) {
        const syntheticEvent = {
          target: {
            value: optValue,
            name: name || '',
            id: selectId,
          },
          currentTarget: {
            value: optValue,
            name: name || '',
            id: selectId,
          },
          preventDefault: () => {},
          stopPropagation: () => {},
        } as unknown as React.ChangeEvent<HTMLSelectElement>;

        onChange(syntheticEvent);
      }
    };

    const selectedOption = options.find((opt) => opt.value === currentValue);
    const displayLabel = selectedOption ? selectedOption.label : placeholder;

    return (
      <div className="w-full relative" ref={containerRef}>
        {label && (
          <label
            htmlFor={selectId}
            className="block text-xs font-semibold text-charcoal dark:text-stone-300 mb-1.5 uppercase tracking-wider"
          >
            {label}
          </label>
        )}

        <select
          id={selectId}
          name={name}
          ref={(node) => {
            nativeSelectRef.current = node;
            if (typeof ref === 'function') {
              ref(node);
            } else if (ref) {
              (ref as React.MutableRefObject<HTMLSelectElement | null>).current = node;
            }
          }}
          value={currentValue}
          onChange={(e) => handleSelectOption(e.target.value)}
          disabled={disabled}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Custom Theme-Matched Trigger Button */}
        <div className="relative">
          <button
            type="button"
            onClick={() => !disabled && setIsOpen((prev) => !prev)}
            disabled={disabled}
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            className={`w-full bg-white dark:bg-[#1E1B1B] border text-left text-charcoal dark:text-stone-100 text-sm rounded-xl transition-all duration-150 flex items-center justify-between min-h-[44px] px-3.5 py-2.5 ${
              isOpen
                ? 'border-epso-red ring-2 ring-red-500/20'
                : error
                ? 'border-red-400 dark:border-red-600 focus:border-red-500 ring-2 ring-red-300/30'
                : 'border-charcoal-border dark:border-[#2E2828] hover:border-stone-400 dark:hover:border-stone-600'
            } disabled:bg-stone-100 dark:disabled:bg-[#141212] disabled:opacity-60 disabled:cursor-not-allowed press-scale ${className}`}
          >
            <span
              className={`truncate font-medium ${
                selectedOption ? 'text-charcoal dark:text-stone-100' : 'text-charcoal-muted dark:text-stone-400'
              }`}
            >
              {displayLabel}
            </span>
            <div
              className={`shrink-0 ml-2 text-stone-500 dark:text-stone-400 transition-transform duration-200 ${
                isOpen ? 'rotate-180' : 'rotate-0'
              }`}
            >
              <TbChevronDown className="w-4 h-4" />
            </div>
          </button>

          {/* Custom Dropdown Menu with Theme Styling */}
          {isOpen && (
            <div
              className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white dark:bg-[#1E1B1B] border border-charcoal-border dark:border-[#2E2828] rounded-xl overflow-hidden shadow-xl animate-in fade-in zoom-in-95 duration-150 origin-top"
              role="listbox"
              style={{
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
              }}
            >
              <div className="max-h-60 overflow-y-auto scroll-smooth py-1">
                {options.length === 0 ? (
                  <div className="px-3.5 py-2.5 text-xs text-charcoal-muted dark:text-stone-400 italic">
                    No options available
                  </div>
                ) : (
                  options.map((opt) => {
                    const isSelected = opt.value === currentValue;
                    return (
                      <div
                        key={opt.value}
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => handleSelectOption(opt.value)}
                        className={`px-3.5 py-2.5 text-sm flex items-center justify-between cursor-pointer transition-colors duration-100 ${
                          isSelected
                            ? 'bg-red-50 dark:bg-red-950/40 font-bold text-epso-red dark:text-amber-400'
                            : 'text-charcoal dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-[#282323] active:bg-stone-100 dark:active:bg-[#2E2828] font-medium'
                        }`}
                      >
                        <span className="truncate pr-2">{opt.label}</span>
                        {isSelected && (
                          <TbCheck className="w-4 h-4 text-epso-red dark:text-amber-400 shrink-0 ml-2" />
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400 font-medium">{error}</p>}
        {!error && helperText && (
          <p className="mt-1 text-xs text-charcoal-muted dark:text-stone-400">{helperText}</p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';

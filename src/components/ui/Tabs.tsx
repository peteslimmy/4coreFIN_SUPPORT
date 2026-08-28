import { useRef, useCallback, type KeyboardEvent } from 'react';
import type { TabsProps } from '../../types/ui';

export default function Tabs({ tabs, activeTab, onChange, orientation = 'horizontal', className = '', label }: TabsProps) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = useCallback((e: KeyboardEvent, index: number) => {
    const isHorizontal = orientation === 'horizontal';
    const nextKey = isHorizontal ? 'ArrowRight' : 'ArrowDown';
    const prevKey = isHorizontal ? 'ArrowLeft' : 'ArrowUp';

    let nextIndex: number;
    if (e.key === nextKey) {
      nextIndex = (index + 1) % tabs.length;
    } else if (e.key === prevKey) {
      nextIndex = (index - 1 + tabs.length) % tabs.length;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = tabs.length - 1;
    } else {
      return;
    }

    e.preventDefault();
    tabRefs.current[nextIndex]?.focus();
    onChange(tabs[nextIndex].value);
  }, [orientation, tabs, onChange]);

  const orientationClass = orientation === 'vertical' ? 'flex-col overflow-visible' : '';

  return (
    <div role="tablist" aria-orientation={orientation} aria-label={label} className={`flex ${orientationClass} gap-0.5 ${orientation === 'vertical' ? '' : 'overflow-x-auto flex-nowrap'} ${className}`}>
      {tabs.map((tab, index) => {
        const panelId = `tabpanel-${tab.value}`;
        return (
        <button
          key={tab.value}
          ref={el => { tabRefs.current[index] = el; }}
          role="tab"
          id={`tab-${tab.value}`}
          aria-selected={tab.value === activeTab}
          aria-controls={panelId}
          tabIndex={tab.value === activeTab ? 0 : -1}
          onClick={() => onChange(tab.value)}
          onKeyDown={e => handleKeyDown(e, index)}
          className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 focus-ring ${
            tab.value === activeTab
              ? 'bg-primary-light text-primary-dark'
              : 'text-text-muted hover:text-text-primary hover:bg-surface'
          }`}
        >
          {tab.icon && <span className="w-4 h-4">{tab.icon}</span>}
          {tab.label}
          {tab.badge !== undefined && (
            <span className={`ml-1 px-1.5 py-0.5 text-xs rounded-full font-medium ${
              tab.value === activeTab ? 'bg-primary text-[#fff]' : 'bg-surface text-text-muted'
            }`}>
              {tab.badge}
            </span>
          )}
        </button>
        );
      })}
    </div>
  );
}

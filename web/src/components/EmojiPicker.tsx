import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';

interface EmojiPickerPopoverProps {
  value?: string | null;
  onChange: (emoji: string | null) => void | Promise<void>;
  children: React.ReactNode;
  className?: string;
}

interface EmojiOption {
  emoji: string;
  label: string;
  keywords: string[];
}

const EMOJI_OPTIONS: EmojiOption[] = [
  { emoji: '🚀', label: 'Rocket', keywords: ['launch', 'ship', 'fast', 'deploy'] },
  { emoji: '🎯', label: 'Target', keywords: ['goal', 'focus', 'aim'] },
  { emoji: '✨', label: 'Sparkles', keywords: ['new', 'fresh', 'special'] },
  { emoji: '🔥', label: 'Fire', keywords: ['hot', 'urgent', 'energy'] },
  { emoji: '💡', label: 'Idea', keywords: ['idea', 'think', 'lightbulb'] },
  { emoji: '📝', label: 'Notes', keywords: ['notes', 'doc', 'writing'] },
  { emoji: '🎨', label: 'Design', keywords: ['design', 'creative', 'art'] },
  { emoji: '🏗️', label: 'Build', keywords: ['build', 'construction', 'project'] },
  { emoji: '🧪', label: 'Experiment', keywords: ['test', 'experiment', 'lab'] },
  { emoji: '📈', label: 'Growth', keywords: ['growth', 'chart', 'metrics'] },
  { emoji: '✅', label: 'Done', keywords: ['done', 'complete', 'success'] },
  { emoji: '⚠️', label: 'Warning', keywords: ['warning', 'risk', 'alert'] },
  { emoji: '🐛', label: 'Bug', keywords: ['bug', 'issue', 'defect'] },
  { emoji: '🔒', label: 'Locked', keywords: ['lock', 'secure', 'private'] },
  { emoji: '🌱', label: 'Seedling', keywords: ['seed', 'grow', 'start'] },
  { emoji: '🏆', label: 'Trophy', keywords: ['win', 'award', 'success'] },
  { emoji: '📚', label: 'Books', keywords: ['books', 'docs', 'learn'] },
  { emoji: '🤝', label: 'Handshake', keywords: ['team', 'partnership', 'collab'] },
  { emoji: '🛠️', label: 'Tools', keywords: ['tools', 'build', 'fix'] },
  { emoji: '🌍', label: 'Globe', keywords: ['global', 'world', 'reach'] },
  { emoji: '💬', label: 'Discussion', keywords: ['comment', 'chat', 'talk'] },
  { emoji: '📦', label: 'Package', keywords: ['package', 'deliver', 'box'] },
  { emoji: '🔍', label: 'Search', keywords: ['search', 'find', 'inspect'] },
  { emoji: '📅', label: 'Calendar', keywords: ['calendar', 'schedule', 'plan'] },
];

const POPOVER_WIDTH = 288;
const POPOVER_GAP = 12;
const VIEWPORT_PADDING = 16;

export function EmojiPickerPopover({ value, onChange, children, className }: EmojiPickerPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [panelPosition, setPanelPosition] = useState({ top: 0, left: 0 });

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return EMOJI_OPTIONS;
    }

    return EMOJI_OPTIONS.filter((option) =>
      option.label.toLowerCase().includes(normalizedQuery) ||
      option.keywords.some((keyword) => keyword.includes(normalizedQuery))
    );
  }, [query]);

  useEffect(() => {
    if (!isOpen) return;

    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const fitsOnLeft = rect.left - POPOVER_WIDTH - POPOVER_GAP >= VIEWPORT_PADDING;
      const left = fitsOnLeft
        ? rect.left - POPOVER_WIDTH - POPOVER_GAP
        : Math.min(rect.right + POPOVER_GAP, window.innerWidth - POPOVER_WIDTH - VIEWPORT_PADDING);
      const top = Math.min(
        Math.max(VIEWPORT_PADDING, rect.top),
        window.innerHeight - 360 - VIEWPORT_PADDING
      );

      setPanelPosition({ top, left });
    };

    updatePosition();
    searchInputRef.current?.focus();

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedTrigger = triggerRef.current?.contains(target);
      const clickedPanel = panelRef.current?.contains(target);
      if (!clickedTrigger && !clickedPanel && containerRef.current && !containerRef.current.contains(target)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen]);

  const handleToggle = () => {
    setIsOpen((open) => {
      const next = !open;
      if (!next) {
        setQuery('');
      }
      return next;
    });
  };

  const handleSelect = (emoji: string | null) => {
    void onChange(emoji);
    setIsOpen(false);
    setQuery('');
  };

  return (
    <div ref={containerRef} className={cn('relative w-fit max-w-full', className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className="rounded focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-background"
      >
        {children}
      </button>

      {isOpen && createPortal(
        <div
          ref={panelRef}
          className="fixed z-[100] w-[18rem] rounded-lg border border-border bg-background shadow-lg"
          style={{ top: panelPosition.top, left: panelPosition.left }}
        >
          <div className="border-b border-border p-3">
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search emojis..."
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent"
            />
            {value && (
              <button
                type="button"
                onClick={() => handleSelect(null)}
                className="mt-2 text-sm text-muted hover:text-foreground"
              >
                Remove emoji
              </button>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto p-3">
            {filteredOptions.length === 0 ? (
              <p className="text-sm text-muted">No matching emojis.</p>
            ) : (
              <div className="grid grid-cols-6 gap-2">
                {filteredOptions.map((option) => (
                  <button
                    key={option.emoji}
                    type="button"
                    onClick={() => handleSelect(option.emoji)}
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-md border border-transparent text-xl transition-colors hover:border-border hover:bg-border/50',
                      value === option.emoji && 'border-accent bg-accent/10'
                    )}
                    aria-label={option.label}
                    title={option.label}
                  >
                    <span aria-hidden="true">{option.emoji}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

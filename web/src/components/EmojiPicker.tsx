import { useState, useRef, useEffect } from 'react';
import type { ComponentType } from 'react';
import type { EmojiClickData, PickerProps } from 'emoji-picker-react';
import { cn } from '@/lib/cn';

interface EmojiPickerPopoverProps {
  value?: string | null;
  onChange: (emoji: string | null) => void;
  children: React.ReactNode;
  className?: string;
}

export function EmojiPickerPopover({ value, onChange, children, className }: EmojiPickerPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [PickerComponent, setPickerComponent] = useState<ComponentType<PickerProps> | null>(null);
  const [pickerTheme, setPickerTheme] = useState<PickerProps['theme']>();
  const [loadError, setLoadError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen || PickerComponent) return;

    let isMounted = true;
    setLoadError(false);

    void import('emoji-picker-react')
      .then((module) => {
        if (!isMounted) return;
        setPickerComponent(() => module.default);
        setPickerTheme(module.Theme.DARK);
      })
      .catch((error: unknown) => {
        console.error('Failed to load emoji picker', error);
        if (isMounted) {
          setLoadError(true);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, PickerComponent]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on escape
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  const handleEmojiClick = (emojiData: EmojiClickData) => {
    onChange(emojiData.emoji);
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange(null);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-background rounded"
      >
        {children}
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-2 left-0">
          <div className="rounded-lg border border-border bg-background shadow-lg overflow-hidden">
            {value && (
              <button
                type="button"
                onClick={handleClear}
                className="w-full px-3 py-2 text-sm text-left text-muted hover:bg-border/50 border-b border-border"
              >
                Remove emoji
              </button>
            )}
            {loadError ? (
              <div className="w-[300px] p-4 text-sm text-muted">
                Emoji picker failed to load. Close and reopen to try again.
              </div>
            ) : PickerComponent ? (
              <PickerComponent
                onEmojiClick={handleEmojiClick}
                skinTonesDisabled={true}
                theme={pickerTheme}
                height={350}
                width={300}
                searchPlaceholder="Search emoji..."
                previewConfig={{ showPreview: false }}
              />
            ) : (
              <div className="w-[300px] p-4 text-sm text-muted">Loading emoji picker...</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

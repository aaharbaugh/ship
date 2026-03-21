import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Editor as TiptapEditor } from '@tiptap/react';
import { apiPost } from '@/lib/api';
import { cn } from '@/lib/cn';

interface FleetGraphInlineAssistantProps {
  editor: TiptapEditor;
  documentId: string;
}

interface FleetGraphChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface FleetGraphChatResponse {
  answer: string;
  suggestedPrompts: string[];
}

const CLOSED_ASSISTANT_WIDTH = 144;
const OPEN_ASSISTANT_WIDTH = 320;

export function FleetGraphInlineAssistant({
  editor,
  documentId,
}: FleetGraphInlineAssistantProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<FleetGraphChatMessage[]>([]);
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>([
    'What is the main blocker here?',
    'What should I tighten next?',
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  useEffect(() => {
    setMessages([]);
    setQuestion('');
    setSuggestedPrompts([
      'What is the main blocker here?',
      'What should I tighten next?',
    ]);
    setIsOpen(false);
  }, [documentId]);

  useEffect(() => {
    const updatePosition = () => {
      if (editor.isDestroyed) {
        return;
      }

      if (!editor.isFocused && !isOpen) {
        setIsVisible(false);
        return;
      }

      const { selection } = editor.state;
      const { $from } = selection;
      if (!selection.empty || $from.parent.type.name === 'codeBlock') {
        setIsVisible(isOpen);
        return;
      }

      const coords = editor.view.coordsAtPos(selection.from);
      const assistantWidth = isOpen ? OPEN_ASSISTANT_WIDTH : CLOSED_ASSISTANT_WIDTH;
      const estimatedHeight = isOpen ? 220 : 40;
      const nextLeft = Math.min(Math.max(coords.left + 8, 12), window.innerWidth - assistantWidth - 12);
      const nextTop = Math.min(Math.max(coords.bottom + 28, 12), window.innerHeight - estimatedHeight - 12);
      setPosition({
        top: nextTop,
        left: nextLeft,
      });
      setIsVisible(true);
    };

    const handleBlur = () => {
      window.setTimeout(() => {
        if (!overlayRef.current?.contains(document.activeElement)) {
          setIsVisible(isOpen);
        }
      }, 0);
    };

    updatePosition();
    editor.on('selectionUpdate', updatePosition);
    editor.on('focus', updatePosition);
    editor.on('transaction', updatePosition);
    editor.on('blur', handleBlur);

    return () => {
      editor.off('selectionUpdate', updatePosition);
      editor.off('focus', updatePosition);
      editor.off('transaction', updatePosition);
      editor.off('blur', handleBlur);
    };
  }, [editor, isOpen]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!overlayRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  const submitQuestion = async (input: string) => {
    const trimmed = input.trim();
    if (!trimmed || isSubmitting) {
      return;
    }

    const nextMessages = [...messages, { role: 'user' as const, content: trimmed }];
    setMessages(nextMessages);
    setQuestion('');
    setIsSubmitting(true);

    try {
      const response = await apiPost(`/api/fleetgraph/documents/${documentId}/chat`, {
        question: trimmed,
        history: messages.slice(-5),
      });
      if (!response.ok) {
        throw new Error('Failed to answer FleetGraph question');
      }

      const payload = (await response.json()) as FleetGraphChatResponse;
      setMessages((current) => [...current, { role: 'assistant', content: payload.answer }]);
      if (payload.suggestedPrompts.length > 0) {
        setSuggestedPrompts(payload.suggestedPrompts.slice(0, 2));
      }
    } catch {
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: 'FleetGraph could not answer that right now. Try again in a moment.',
        },
      ]);
    } finally {
      setIsSubmitting(false);
    }
  };

  const lastAssistantMessage = useMemo(
    () => [...messages].reverse().find((message) => message.role === 'assistant') ?? null,
    [messages]
  );

  if (!isVisible || !isMounted) {
    return null;
  }

  return createPortal(
    <div
      ref={overlayRef}
      className="pointer-events-none fixed z-30"
      style={{ top: position.top, left: position.left }}
    >
      {!isOpen ? (
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setIsOpen(true)}
          className="pointer-events-auto rounded-full border border-slate-700 bg-black/95 px-3 py-1.5 text-xs font-medium text-white shadow-lg shadow-black/30 hover:bg-slate-900"
        >
          Ask FleetGraph
        </button>
      ) : (
        <div className="pointer-events-auto w-[20rem] rounded-2xl border border-slate-800 bg-slate-950/98 p-3 shadow-2xl shadow-black/40">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              FleetGraph
            </div>
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setIsOpen(false)}
              className="text-xs text-slate-500 hover:text-slate-300"
            >
              Close
            </button>
          </div>

          <div className="mt-2 text-sm text-slate-200">
            Ask about the connected graph for what you are writing here.
          </div>

          {lastAssistantMessage ? (
            <div className="mt-3 rounded-xl border border-slate-800 bg-black/50 px-3 py-2 text-sm leading-6 text-slate-200">
              {lastAssistantMessage.content}
            </div>
          ) : null}

          <form
            className="mt-3 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void submitQuestion(question);
            }}
          >
            <input
              type="text"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask about blockers, scope, or ownership"
              className="h-10 flex-1 rounded-md border border-slate-800 bg-black px-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-slate-600"
            />
            <button
              type="submit"
              disabled={isSubmitting || question.trim().length === 0}
              className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-black hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? '...' : 'Ask'}
            </button>
          </form>

          <div className="mt-3 flex flex-wrap gap-2">
            {suggestedPrompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void submitQuestion(prompt)}
                disabled={isSubmitting}
                className={cn(
                  'rounded-full border border-slate-800 bg-black px-2.5 py-1 text-[11px] text-slate-300 hover:bg-slate-900',
                  isSubmitting && 'cursor-not-allowed opacity-60'
                )}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}

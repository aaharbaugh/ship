import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EmojiPickerPopover } from './EmojiPicker';

describe('EmojiPickerPopover', () => {
  it('renders a bounded native emoji grid and applies a selection', () => {
    const onChange = vi.fn();

    render(
      <EmojiPickerPopover value={null} onChange={onChange}>
        <span>Open picker</span>
      </EmojiPickerPopover>
    );

    fireEvent.click(screen.getByRole('button', { name: /open picker/i }));

    expect(screen.getByPlaceholderText(/search emojis/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /rocket/i }));

    expect(onChange).toHaveBeenCalledWith('🚀');
  });

  it('filters emojis by query and allows clearing an existing value', () => {
    const onChange = vi.fn();

    render(
      <EmojiPickerPopover value="🎯" onChange={onChange}>
        <span>Open picker</span>
      </EmojiPickerPopover>
    );

    fireEvent.click(screen.getByRole('button', { name: /open picker/i }));
    fireEvent.change(screen.getByPlaceholderText(/search emojis/i), { target: { value: 'bug' } });

    expect(screen.getByRole('button', { name: /bug/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /rocket/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /remove emoji/i }));

    expect(onChange).toHaveBeenCalledWith(null);
  });
});

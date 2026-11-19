import { useEffect, useRef, useState } from 'react';

const CATEGORIES: { id: string; label: string; icon: string; emojis: string[] }[] = [
  {
    id: 'smileys',
    label: 'Smileys',
    icon: '😀',
    emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '🙂', '😉', '😍', '🥰', '😘', '😗', '😋', '😜', '🤪', '😎', '🤩', '🥳', '😏', '😌', '😴', '🥺', '😢', '😭', '😤', '😡', '😱', '🤗', '🤭', '🙄', '😬', '🤔', '😇'],
  },
  {
    id: 'hearts',
    label: 'Hearts',
    icon: '❤️',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🤎', '🖤', '🤍', '💖', '💗', '💓', '💞', '💕', '💘', '💝', '💌', '💋', '💍', '🌹', '🌷', '🌸', '💐', '🥀', '✨', '💫', '⭐', '🌙', '🔥', '🎁', '💑', '👩‍❤️‍👨'],
  },
  {
    id: 'gestures',
    label: 'Gestures',
    icon: '👍',
    emojis: ['👍', '👎', '👌', '✌️', '🤞', '🤟', '🤙', '👋', '🤚', '🖐️', '✋', '👏', '🙌', '🤝', '🙏', '💪', '🫶', '🤲', '👀', '🫂', '🤷', '🤦', '🙈', '🙉', '🙊', '💃', '🕺', '🚶'],
  },
  {
    id: 'food',
    label: 'Food & fun',
    icon: '🍕',
    emojis: ['🍕', '🍔', '🍟', '🌮', '🍜', '🍣', '🍰', '🎂', '🍫', '🍩', '🍪', '🍿', '☕', '🧋', '🍷', '🍺', '🥂', '🍓', '🍒', '🍑', '🍉', '🍎', '🎉', '🎊', '🎈', '🎶', '🎵', '🎮', '📸', '🎬', '⚽', '🏀'],
  },
  {
    id: 'nature',
    label: 'Nature & travel',
    icon: '🌿',
    emojis: ['🌿', '🍀', '🌻', '🌼', '🌺', '🌈', '☀️', '⛅', '🌧️', '❄️', '🌊', '🏖️', '🏝️', '⛰️', '🐶', '🐱', '🐰', '🐻', '🐼', '🦋', '🐝', '🐢', '✈️', '🚗', '🚲', '🏠', '🌍', '🗺️', '📍', '🎒'],
  },
];

interface EmojiPickerProps {
  onPick: (emoji: string) => void;
  onClose: () => void;
}

/** A small built-in emoji picker. Emojis are inserted into the message box; the phone keyboard's emojis work too. */
export function EmojiPicker({ onPick, onClose }: EmojiPickerProps) {
  const [active, setActive] = useState(CATEGORIES[0].id);
  const ref = useRef<HTMLDivElement>(null);
  const category = CATEGORIES.find((c) => c.id === active) ?? CATEGORIES[0];

  useEffect(() => {
    const onPointer = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Element | null;
      // Clicks on the toggle button are handled by the button itself.
      if (ref.current && target && !ref.current.contains(target) && !target.closest('[data-emoji-toggle]')) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Emoji picker"
      className="absolute bottom-full left-3 right-3 z-20 mb-2 overflow-hidden rounded-2xl border border-blush bg-white shadow-polaroid sm:left-6 sm:right-auto sm:w-80"
    >
      <div role="tablist" aria-label="Emoji categories" className="flex border-b border-blush/70">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={c.id === active}
            aria-label={c.label}
            title={c.label}
            onClick={() => setActive(c.id)}
            className={`flex h-11 flex-1 items-center justify-center text-xl transition ${c.id === active ? 'bg-blush/60' : 'hover:bg-blush/30'}`}
          >
            {c.icon}
          </button>
        ))}
      </div>
      <div className="grid max-h-52 grid-cols-7 gap-0.5 overflow-y-auto p-2 sm:grid-cols-8" role="tabpanel" aria-label={category.label}>
        {category.emojis.map((emoji) => (
          <button
            key={emoji}
            type="button"
            aria-label={emoji}
            onClick={() => onPick(emoji)}
            className="flex h-10 items-center justify-center rounded-lg text-2xl transition hover:bg-blush/60 active:scale-90"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}

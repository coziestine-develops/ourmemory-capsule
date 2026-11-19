import { useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCamera, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { AVATAR_ACCEPTED } from '../../services/profile';
import { useAvatarActions } from '../../hooks/useProfile';
import { Avatar } from './Avatar';

interface AvatarPickerProps {
  name: string;
  /** Tailwind size + text classes for the avatar. */
  className?: string;
  badgeClassName?: string;
}

/** Avatar that opens the file picker when clicked and uploads the chosen photo. */
export function AvatarPicker({ name, className = 'h-10 w-10 text-base', badgeClassName = 'h-5 w-5 text-[9px]' }: AvatarPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { profile, upload, busy } = useAvatarActions();

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label="Change profile photo"
        title="Change profile photo"
        className="group relative shrink-0 rounded-full disabled:cursor-wait"
      >
        <Avatar name={name} path={profile?.avatar_path} ring className={className} />
        <span
          className={`absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full border-2 border-white bg-mocha text-white transition group-hover:bg-espresso ${badgeClassName}`}
        >
          <FontAwesomeIcon icon={busy ? faSpinner : faCamera} spin={busy} />
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={AVATAR_ACCEPTED.join(',')}
        className="hidden"
        onChange={(e) => {
          const input = e.target;
          const file = input.files?.[0];
          if (!file) return;
          // Copy the photo first: on phones the picked file can go stale once the input is reset.
          void file
            .arrayBuffer()
            .then((buf) => new File([buf], file.name, { type: file.type, lastModified: file.lastModified }))
            .catch(() => file)
            .then((copy) => upload.mutate(copy))
            .finally(() => { input.value = ''; });
        }}
      />
    </>
  );
}

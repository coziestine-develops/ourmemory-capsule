import { useAvatarUrl } from '../../hooks/useProfile';

interface AvatarProps {
  name: string;
  path?: string | null;
  /** Tailwind size + text classes, e.g. "h-10 w-10 text-base". */
  className?: string;
  ring?: boolean;
}

export function Avatar({ name, path, className = 'h-10 w-10 text-base', ring = false }: AvatarProps) {
  const { data: url } = useAvatarUrl(path);
  const initial = (name.trim().charAt(0) || '?').toUpperCase();
  const ringClass = ring ? 'ring-2 ring-white shadow-sm' : '';

  if (path && url) {
    return <img src={url} alt="" className={`shrink-0 rounded-full bg-blush object-cover ${ringClass} ${className}`} />;
  }
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose to-mocha font-heading text-white ${ringClass} ${className}`}
    >
      {initial}
    </span>
  );
}

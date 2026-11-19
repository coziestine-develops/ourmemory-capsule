import { useState } from 'react';
import { useSignedUrl } from '../../hooks/useSignedUrl';
import type { MediaType } from '../../types';

interface SignedMediaProps {
  path: string;
  mediaType: MediaType;
  alt: string;
  className?: string;
  controls?: boolean;
}

export function SignedMedia({ path, mediaType, alt, className = '', controls = false }: SignedMediaProps) {
  const { data: url, isLoading, isError, error, refetch } = useSignedUrl(path);
  const [displayFailed, setDisplayFailed] = useState(false);

  if (isError || displayFailed) {
    const reason = error instanceof Error ? error.message : '';
    return (
      <div role="img" aria-label="This photo couldn't be loaded" className={`flex flex-col items-center justify-center gap-2 bg-blush p-3 text-center text-sm text-mocha ${className}`}>
        <span>Photo couldn't load</span>
        {reason && <span className="text-xs text-cocoa">{reason}</span>}
        <button
          type="button"
          className="rounded-full px-3 py-1 text-xs font-medium text-rose hover:bg-white/70"
          onClick={() => {
            setDisplayFailed(false);
            void refetch();
          }}
        >
          Try again
        </button>
      </div>
    );
  }
  if (isLoading || !url) {
    return <div className={`animate-pulse bg-blush ${className}`} aria-hidden="true" />;
  }
  if (mediaType === 'video') {
    return <video src={url} controls={controls} preload="metadata" className={className} aria-label={alt} />;
  }
  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={className}
      onError={() => setDisplayFailed(true)}
    />
  );
}

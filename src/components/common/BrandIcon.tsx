// src/components/common/BrandIcon.tsx
import type { CSSProperties } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHeart } from '@fortawesome/free-solid-svg-icons';

interface BrandIconProps {
  className?: string;
  /** Draw the heart in white, for use on dark (cherry) backgrounds where #4D0909 would disappear. */
  light?: boolean;
  style?: CSSProperties;
  'aria-label'?: string;
  'aria-hidden'?: boolean | 'true' | 'false';
}

/**
 * The heart icon, drawn in #4D0909.
 * Faded decorative hearts written as text-rose/N or text-blush keep their lighter look as opacity.
 */
export function BrandIcon({ className = '', light = false, style, 'aria-label': label }: BrandIconProps) {
  let fade = '';
  let rest = className;
  // Tailwind only generates classes it can see as literal strings, so each opacity is spelled out.
  rest = rest.replace(/\btext-(rose|blush)\/(20|30|40|50|60|70|80)\b/g, (_m, _c, n: string) => {
    fade = { '20': 'opacity-20', '30': 'opacity-30', '40': 'opacity-40', '50': 'opacity-50', '60': 'opacity-60', '70': 'opacity-70', '80': 'opacity-80' }[n] ?? '';
    return '';
  });
  if (/\btext-blush\b/.test(rest)) {
    fade = 'opacity-30';
  }
  rest = rest.replace(/\btext-(rose|blush|mocha|espresso|cocoa|white|ivory|heart)\b/g, '');
  if (light) fade = '';
  return (
    <FontAwesomeIcon
      icon={faHeart}
      className={`${light ? 'text-white' : 'text-[#4D0909]'} ${fade} ${rest}`.replace(/\s+/g, ' ').trim()}
      style={style}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
    />
  );
}
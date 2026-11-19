import type { ReactNode } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';

interface EmptyStateProps {
  icon: IconDefinition;
  title: string;
  message: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, message, action }: EmptyStateProps) {
  return (
    <div className="card flex flex-col items-center px-8 py-14 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-blush/70 text-rose">
        <FontAwesomeIcon icon={icon} className="text-2xl" aria-hidden="true" />
      </span>
      <p className="mt-5 font-heading text-2xl font-semibold">{title}</p>
      <p className="handwritten mt-2 max-w-sm text-xl text-mocha">{message}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

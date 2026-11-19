import type { ReactNode } from 'react';

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <h1 className="font-heading text-3xl font-semibold sm:text-4xl md:text-5xl">{title}</h1>
        {subtitle && <p className="handwritten mt-2 text-xl text-mocha sm:text-2xl">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

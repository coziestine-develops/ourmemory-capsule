export const APP_NAME = 'Memory Capsule';

export function Logo({ align = 'start', compact = false }: { align?: 'start' | 'center'; compact?: boolean }) {
  if (compact) {
    return (
      <span className="flex min-w-0 items-center gap-2">
        <img src="/icons.png" alt="" aria-hidden="true" className="h-8 w-auto shrink-0 object-contain sm:h-9" />
        <span className="truncate font-heading text-base font-semibold leading-none text-espresso sm:text-xl">
          {APP_NAME}
        </span>
      </span>
    );
  }
  return (
    <div className={`flex flex-col ${align === 'center' ? 'items-center text-center' : 'items-start'}`}>
      <img src="/icons.png" alt="Memory Capsule logo" className="h-10 w-auto object-contain" />
      <p className="mt-2 whitespace-nowrap font-heading text-2xl font-semibold leading-none text-espresso">{APP_NAME}</p>
      <p className="handwritten mt-1 text-base text-mocha">Our little memory space</p>
    </div>
  );
}
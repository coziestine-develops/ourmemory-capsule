import { useEffect, useState } from 'react';

function pad(n: number) {
  return n.toString().padStart(2, '0');
}

export function Countdown({ target, onDone }: { target: string; onDone?: () => void }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const diff = new Date(target).getTime() - now;
  useEffect(() => {
    if (diff <= 0 && onDone) onDone();
  }, [diff, onDone]);

  if (diff <= 0) return <span>Ready now</span>;

  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);

  return (
    <span className="font-heading tabular-nums" aria-live="off">
      {days > 0 && `${days}d `}
      {pad(hours)}h {pad(minutes)}m {pad(seconds)}s
    </span>
  );
}

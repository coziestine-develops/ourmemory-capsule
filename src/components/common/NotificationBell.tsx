import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBell, faCheckDouble, faTrashCan } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { clearNotifications, listNotifications, markAllNotificationsRead } from '../../services/notifications';
import { errorMessage, formatDate } from '../../lib/format';
import { BrandIcon } from './BrandIcon';

const ROUTE_BY_TYPE: Record<string, string> = {
  memory: '/memories',
  letter: '/letters',
  capsule: '/capsules',
  lover_request: '/relationship',
  bucket: '/bucket-list',
};

/** Comment notifications open the memory they were left on. */
function notificationHref(n: { type: string; related_id: string | null }): string {
  if (n.type === 'comment' && n.related_id) return `/memories/${n.related_id}`;
  return ROUTE_BY_TYPE[n.type] ?? '/';
}

export function NotificationBell() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const userId = user?.id ?? '';

  const query = useQuery({
    queryKey: ['notifications', userId],
    enabled: !!userId,
    queryFn: () => listNotifications(userId),
    refetchInterval: 60_000,
  });

  const items = query.data ?? [];
  const unread = items.filter((n) => !n.is_read).length;

  const markRead = useMutation({
    mutationFn: () => markAllNotificationsRead(userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications', userId] }),
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  const clear = useMutation({
    mutationFn: () => clearNotifications(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', userId] });
      toast('Notifications cleared.');
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open && unread > 0) markRead.mutate();
        }}
        aria-expanded={open}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        className="relative flex h-11 w-11 items-center justify-center rounded-full border border-blush bg-white/80 text-mocha shadow-sm transition hover:bg-blush/60"
      >
        <FontAwesomeIcon icon={faBell} />
        {unread > 0 && (
          <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-rose ring-2 ring-white" aria-hidden="true" />
        )}
      </button>

      {open && (
        <div role="dialog" aria-label="Notifications" className="fixed inset-x-4 top-[4.5rem] z-50 max-h-[80dvh] overflow-y-auto rounded-3xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-3 sm:w-80 sm:rounded-3xl border border-white bg-ivory p-4 shadow-romantic">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-heading text-lg font-semibold">Notifications</p>
            <div className="flex gap-1">
              <button type="button" onClick={() => markRead.mutate()} className="rounded-full p-2 text-mocha hover:bg-blush/60" aria-label="Mark all as read">
                <FontAwesomeIcon icon={faCheckDouble} />
              </button>
              <button type="button" onClick={() => clear.mutate()} className="rounded-full p-2 text-mocha hover:bg-blush/60" aria-label="Clear all notifications">
                <FontAwesomeIcon icon={faTrashCan} />
              </button>
            </div>
          </div>
          {items.length === 0 ? (
            <p className="handwritten py-6 text-center text-lg text-mocha">Nothing new yet. We'll let you know when your lover shares something.</p>
          ) : (
            <ul className="max-h-96 space-y-2 overflow-y-auto">
              {items.map((n) => (
                <li key={n.id}>
                  <Link
                    to={notificationHref(n)}
                    onClick={() => setOpen(false)}
                    className={`flex gap-3 rounded-2xl p-3 transition hover:bg-blush/50 ${n.is_read ? 'opacity-70' : 'bg-white'}`}
                  >
                    <BrandIcon className="mt-1 text-rose" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{n.title}</span>
                      {n.message && <span className="block text-sm text-mocha">{n.message}</span>}
                      <span className="mt-0.5 block text-xs text-cocoa">{formatDate(n.created_at, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

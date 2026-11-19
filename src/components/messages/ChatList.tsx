import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMagnifyingGlass, faXmark } from '@fortawesome/free-solid-svg-icons';
import type { Message } from '../../types';
import { Avatar } from '../common/Avatar';

/** Short label for the chat list: time today, "Yesterday", weekday this week, otherwise the date. */
export function listTimeLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (days <= 0) return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (days === 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: 'short' });
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}

export function PresenceAvatar({
  name,
  path,
  online,
  className = 'h-12 w-12 text-lg',
  dotClassName = 'h-3.5 w-3.5',
}: {
  name: string;
  path?: string | null;
  online: boolean;
  className?: string;
  dotClassName?: string;
}) {
  return (
    <span className="relative inline-flex shrink-0">
      <Avatar name={name} path={path} ring className={className} />
      {online && (
        <span
          role="img"
          aria-label="Online"
          className={`absolute bottom-0 right-0 rounded-full border-2 border-white bg-emerald-500 ${dotClassName}`}
        />
      )}
    </span>
  );
}

interface ChatListProps {
  partnerName: string;
  partnerUsername: string | null;
  partnerAvatarPath?: string | null;
  partnerOnline: boolean;
  partnerTyping: boolean;
  latest: Message | undefined;
  currentUserId: string;
  unread: number;
  chatActive: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  results: Message[];
  searching: boolean;
  onOpenChat: () => void;
  onOpenMessage: (message: Message) => void;
}

function previewOf(latest: Message | undefined, mine: boolean, partnerName: string): string {
  if (!latest) return 'Say hello 👋';
  if (latest.deleted_at) return mine ? 'You unsent a message' : `${partnerName} unsent a message`;
  return `${mine ? 'You: ' : ''}${latest.body}`;
}

function snippet(body: string, term: string): string {
  const flat = body.replace(/\s+/g, ' ');
  const at = flat.toLowerCase().indexOf(term.toLowerCase());
  if (at < 0 || flat.length <= 70) return flat;
  const start = Math.max(0, at - 25);
  return `${start > 0 ? '…' : ''}${flat.slice(start, start + 80)}${start + 80 < flat.length ? '…' : ''}`;
}

export function ChatList({
  partnerName,
  partnerUsername,
  partnerAvatarPath,
  partnerOnline,
  partnerTyping,
  latest,
  currentUserId,
  unread,
  chatActive,
  query,
  onQueryChange,
  results,
  searching,
  onOpenChat,
  onOpenMessage,
}: ChatListProps) {
  const term = query.trim();
  const lower = term.toLowerCase().replace(/^@/, '');
  const matchesPerson =
    lower.length > 0 && (partnerName.toLowerCase().includes(lower) || (partnerUsername ?? '').toLowerCase().includes(lower));
  const mine = latest?.sender_id === currentUserId;
  const hasUnread = unread > 0 && !!latest && !mine;

  const personRow = (subtitle: string) => (
    <button
      type="button"
      onClick={onOpenChat}
      aria-current={chatActive ? 'true' : undefined}
      className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-blush/50 ${chatActive ? 'bg-blush/60' : ''}`}
    >
      <PresenceAvatar name={partnerName} path={partnerAvatarPath} online={partnerOnline} />
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-[15px] ${hasUnread ? 'font-bold' : 'font-medium'}`}>{partnerName}</span>
        <span className={`block truncate text-sm ${hasUnread ? 'font-semibold text-espresso' : 'text-mocha'}`}>{subtitle}</span>
      </span>
      {latest && !term && (
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className={`text-xs ${hasUnread ? 'font-semibold text-espresso' : 'text-cocoa'}`}>{listTimeLabel(latest.created_at)}</span>
          {hasUnread && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-mocha px-1.5 text-[11px] font-semibold text-white" aria-label={`${unread} unread`}>
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </span>
      )}
    </button>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-4 pb-2 pt-4 sm:px-5">
        <h2 className="font-heading text-2xl font-semibold">Chats</h2>
        <div className="relative mt-3">
          <label htmlFor="chat-search" className="sr-only">Search people and messages</label>
          <FontAwesomeIcon icon={faMagnifyingGlass} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-cocoa" aria-hidden="true" />
          <input
            id="chat-search"
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search chats and messages"
            autoComplete="off"
            className="input !rounded-full !py-2.5 pl-10 pr-10 text-[15px]"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange('')}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-cocoa hover:bg-blush/60"
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3" aria-label="Conversations">
        {!term && personRow(partnerTyping ? 'typing…' : previewOf(latest, mine, partnerName))}

        {term && (
          <>
            {matchesPerson && (
              <section aria-label="People">
                <h3 className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-cocoa">People</h3>
                {personRow(partnerUsername ? `@${partnerUsername}` : 'Your person')}
              </section>
            )}

            {term.length >= 2 && results.length > 0 && (
              <section aria-label="Messages">
                <h3 className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-cocoa">Messages</h3>
                {results.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onOpenMessage(m)}
                    className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-blush/50"
                  >
                    <Avatar name={partnerName} path={partnerAvatarPath} className="h-10 w-10 text-base" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-medium">{m.sender_id === currentUserId ? 'You' : partnerName}</span>
                        <span className="shrink-0 text-xs text-cocoa">{listTimeLabel(m.created_at)}</span>
                      </span>
                      <span className="block truncate text-sm text-mocha">{snippet(m.body, term)}</span>
                    </span>
                  </button>
                ))}
              </section>
            )}

            {searching && results.length === 0 && !matchesPerson && <p className="px-4 py-6 text-center text-sm text-mocha">Searching…</p>}
            {!searching && !matchesPerson && results.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-mocha">
                {term.length < 2 ? 'Keep typing to search messages.' : `No chats or messages match “${term}”.`}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

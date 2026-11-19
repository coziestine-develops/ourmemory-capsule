import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft,
  faCircleCheck,
  faComments,
  faEllipsisVertical,
  faFaceSmile,
  faPaperPlane,
  faRotateLeft,
  faTrashCan,
} from '@fortawesome/free-solid-svg-icons';
import { faCircle as faCircleHollow, faCircleCheck as faCircleCheckHollow } from '@fortawesome/free-regular-svg-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useRelationship } from '../../hooks/useRelationship';
import { useUnreadMessages } from '../../hooks/useMessages';
import { usePresenceState } from '../../hooks/usePresence';
import { sendTyping } from '../../lib/presence';
import { errorMessage } from '../../lib/format';
import { listMembers } from '../../services/relationships';
import {
  MESSAGE_MAX_LENGTH,
  MESSAGE_PAGE_SIZE,
  clearConversation,
  listMessages,
  markMessagesRead,
  searchMessages,
  sendMessage,
  unsendMessage,
} from '../../services/messages';
import type { Message } from '../../types';
import { Avatar } from '../../components/common/Avatar';
import { EmptyState } from '../../components/common/EmptyState';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { ChatList, PresenceAvatar } from '../../components/messages/ChatList';
import { EmojiPicker } from '../../components/messages/EmojiPicker';

const GROUP_GAP_MS = 60 * 60 * 1000;
const WIDE_QUERY = '(min-width: 768px)';

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(iso) === dayKey(today.toISOString())) return 'Today';
  if (dayKey(iso) === dayKey(yesterday.toISOString())) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

type MessageStatus = 'sending' | 'sent' | 'delivered' | 'seen';

/** Same ladder as Messenger: Sending, Sent, Delivered, Seen. */
function statusOf(m: Message): MessageStatus {
  if (m.pending) return 'sending';
  if (m.read_at) return 'seen';
  if (m.delivered_at) return 'delivered';
  return 'sent';
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** Up to three emojis and nothing else: shown large, without a bubble, like Messenger. */
function isEmojiOnly(body: string): boolean {
  const text = body.trim();
  if (!text || text.length > 24) return false;
  if (!/^[\p{Extended_Pictographic}\p{Emoji_Modifier}\u200d\ufe0f\s]+$/u.test(text)) return false;
  return (text.match(/\p{Extended_Pictographic}/gu) ?? []).length <= 3;
}

function useIsWide(): boolean {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(WIDE_QUERY).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(WIDE_QUERY);
    const onChange = () => setWide(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return wide;
}

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function MessagesPage() {
  const { user } = useAuth();
  const { data: relationship } = useRelationship();
  const relationshipId = relationship?.id;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const wide = useIsWide();
  const presence = usePresenceState();
  const unreadCount = useUnreadMessages();

  const [limit, setLimit] = useState(MESSAGE_PAGE_SIZE);
  const [draft, setDraft] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  // On phones the chat list and the conversation are separate screens; from tablet width up they sit side by side.
  const [view, setView] = useState<'list' | 'chat'>('list');
  const [query, setQuery] = useState('');
  const [jumpId, setJumpId] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const chatOpen = wide || view === 'chat';

  const menuRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottom = useRef(true);
  const prevScrollHeight = useRef<number | null>(null);
  const initialScrollDone = useRef(false);
  const wasOpen = useRef(false);
  const typingTimer = useRef<number | undefined>(undefined);
  const lastTypingSent = useRef(0);

  const members = useQuery({
    queryKey: ['member-list', relationshipId],
    enabled: !!relationshipId,
    queryFn: () => listMembers(relationshipId!),
  });
  const partner = members.data?.find((m) => m.user_id !== user?.id);
  const partnerOnline = !!partner && presence.online.has(partner.user_id);
  const partnerTyping = !!partner && presence.typing.has(partner.user_id);

  const messages = useQuery({
    queryKey: ['messages', relationshipId, limit],
    enabled: !!relationshipId,
    queryFn: () => listMessages(relationshipId!, limit),
    placeholderData: (previous) => previous,
    // Safety net in case realtime is not enabled for the table.
    refetchInterval: 15_000,
  });
  const list = useMemo(() => messages.data ?? [], [messages.data]);
  const hasMore = list.length >= limit;

  // The newest message, for the chat list preview.
  const latestQuery = useQuery({
    queryKey: ['messages', relationshipId, 'latest'],
    enabled: !!relationshipId,
    queryFn: () => listMessages(relationshipId!, 1),
    refetchInterval: 30_000,
  });
  const latest = latestQuery.data?.[latestQuery.data.length - 1];

  const debouncedQuery = useDebounced(query.trim(), 250);
  const search = useQuery({
    queryKey: ['message-search', relationshipId, debouncedQuery],
    enabled: !!relationshipId && debouncedQuery.length >= 2,
    queryFn: () => searchMessages(relationshipId!, debouncedQuery),
  });
  const searchResults = query.trim().length >= 2 && debouncedQuery === query.trim() ? search.data ?? [] : [];

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['messages', relationshipId] });
    void queryClient.invalidateQueries({ queryKey: ['unread-messages', relationshipId] });
  };

  const stopTyping = () => {
    window.clearTimeout(typingTimer.current);
    if (lastTypingSent.current) {
      sendTyping(false);
      lastTypingSent.current = 0;
    }
  };

  // Leaving the page must not leave "typing…" showing on the other side.
  useEffect(() => stopTyping, []);

  const onDraftChange = (value: string) => {
    setDraft(value);
    if (!value.trim()) {
      stopTyping();
      return;
    }
    const now = Date.now();
    if (now - lastTypingSent.current > 2500) {
      sendTyping(true);
      lastTypingSent.current = now;
    }
    window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => {
      sendTyping(false);
      lastTypingSent.current = 0;
    }, 3000);
  };

  const send = useMutation({
    mutationFn: (body: string) => sendMessage(relationshipId!, user!.id, body),
    // Show the message straight away as "Sending…", like Messenger, then let the refetch swap in the real row.
    onMutate: async (body: string) => {
      await queryClient.cancelQueries({ queryKey: ['messages', relationshipId] });
      const key = ['messages', relationshipId, limit];
      const temp: Message = {
        id: `pending-${Date.now()}`,
        relationship_id: relationshipId!,
        sender_id: user!.id,
        body,
        created_at: new Date().toISOString(),
        delivered_at: null,
        read_at: null,
        deleted_at: null,
        pending: true,
      };
      queryClient.setQueryData<Message[]>(key, (rows: Message[] = []) => [...rows, temp]);
      return { key, tempId: temp.id };
    },
    onSuccess: refresh,
    onError: (e, body, context) => {
      if (context) {
        queryClient.setQueryData<Message[]>(context.key, (rows: Message[] = []) => rows.filter((row) => row.id !== context.tempId));
      }
      setDraft((current) => (current ? current : body));
      toast(errorMessage(e), 'error');
    },
  });

  const clear = useMutation({
    mutationFn: () => clearConversation(relationshipId!),
    onSuccess: () => {
      setConfirmClear(false);
      setMenuOpen(false);
      setActiveId(null);
      setLimit(MESSAGE_PAGE_SIZE);
      initialScrollDone.current = false;
      queryClient.setQueriesData<Message[]>({ queryKey: ['messages', relationshipId] }, []);
      refresh();
      toast('Conversation deleted.');
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  // Close the header menu on outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (event: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const unsend = useMutation({
    mutationFn: (id: string) => unsendMessage(id),
    onSuccess: () => {
      setActiveId(null);
      refresh();
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  const markRead = useMutation({
    mutationFn: () => markMessagesRead(relationshipId!, user!.id),
    onSuccess: refresh,
  });

  // Messages only count as "Seen" while the conversation is actually on screen.
  const unreadIncoming = list.some((m) => m.sender_id !== user?.id && !m.read_at && !m.deleted_at);
  useEffect(() => {
    if (!chatOpen || !unreadIncoming || !relationshipId || !user || markRead.isPending) return;
    if (document.visibilityState !== 'visible') return;
    markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatOpen, unreadIncoming, relationshipId, user?.id]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && chatOpen && unreadIncoming && relationshipId && user) markRead.mutate();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatOpen, unreadIncoming, relationshipId, user?.id]);

  // Scroll handling: jump to the bottom when the chat opens, follow new messages when already near the
  // bottom (or when I sent them), and keep position steady when older messages are loaded above.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !chatOpen) {
      wasOpen.current = false;
      return;
    }
    if (!wasOpen.current) {
      wasOpen.current = true;
      stickToBottom.current = true;
      if (list.length > 0) {
        el.scrollTop = el.scrollHeight;
        initialScrollDone.current = true;
      }
      return;
    }
    if (list.length === 0) return;
    if (prevScrollHeight.current !== null) {
      el.scrollTop += el.scrollHeight - prevScrollHeight.current;
      prevScrollHeight.current = null;
      return;
    }
    const last = list[list.length - 1];
    if (!initialScrollDone.current) {
      el.scrollTop = el.scrollHeight;
      initialScrollDone.current = true;
    } else if (stickToBottom.current || last.sender_id === user?.id) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [list, user?.id, chatOpen]);

  // The typing bubble should not hide below the fold.
  useEffect(() => {
    const el = scrollRef.current;
    if (partnerTyping && el && stickToBottom.current) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [partnerTyping]);

  // Open a search result: show the conversation and scroll to that message.
  useEffect(() => {
    if (!jumpId || !chatOpen) return;
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-mid="${jumpId}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'auto' });
    setHighlightId(jumpId);
    setJumpId(null);
    const timer = window.setTimeout(() => setHighlightId(null), 2200);
    return () => window.clearTimeout(timer);
  }, [jumpId, list, chatOpen]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  // Auto-growing composer.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [draft, chatOpen]);

  const submit = () => {
    const body = draft.trim();
    if (!body || send.isPending || !relationshipId || !user) return;
    stopTyping();
    stickToBottom.current = true;
    setDraft('');
    setEmojiOpen(false);
    send.mutate(body);
    inputRef.current?.focus();
  };

  const insertEmoji = (emoji: string) => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? start;
    const next = (draft.slice(0, start) + emoji + draft.slice(end)).slice(0, MESSAGE_MAX_LENGTH);
    onDraftChange(next);
    const caret = Math.min(start + emoji.length, next.length);
    window.requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(caret, caret);
    });
  };

  const loadEarlier = () => {
    prevScrollHeight.current = scrollRef.current?.scrollHeight ?? null;
    setLimit((n) => n + MESSAGE_PAGE_SIZE);
  };

  const openChat = () => {
    setView('chat');
    setQuery('');
  };

  const openMessage = (message: Message) => {
    setView('chat');
    setQuery('');
    stickToBottom.current = false;
    initialScrollDone.current = true;
    // If the message is older than what is loaded, load enough history to include it.
    if (list.length === 0 || message.created_at < list[0].created_at) setLimit(500);
    setJumpId(message.id);
  };

  if (!relationship) return null;

  if (members.data && !partner) {
    return (
      <div className="mx-auto max-w-2xl">
        <EmptyState
          icon={faComments}
          title="Your chat is waiting"
          message="Add your lover to your space and you can message each other here."
          action={<Link to="/relationship" className="btn-primary">Add your lover</Link>}
        />
      </div>
    );
  }

  const partnerName = partner?.profile?.display_name ?? 'Your person';
  const partnerUsername = partner?.profile?.username ?? null;
  const partnerAvatarPath = partner?.profile?.avatar_path;
  const lastMineId = [...list].reverse().find((m) => m.sender_id === user?.id && !m.deleted_at)?.id;

  // A centered date and time label starts each group: a new day, or an hour of silence.
  const rows: Array<{ type: 'time'; key: string; label: string } | { type: 'msg'; message: Message }> = [];
  let previous: Message | undefined;
  for (const message of list) {
    const newGroup =
      !previous || dayKey(message.created_at) !== dayKey(previous.created_at) || new Date(message.created_at).getTime() - new Date(previous.created_at).getTime() > GROUP_GAP_MS;
    if (newGroup) {
      rows.push({ type: 'time', key: message.id, label: `${dayLabel(message.created_at)}, ${timeLabel(message.created_at)}` });
    }
    rows.push({ type: 'msg', message });
    previous = message;
  }

  return (
    <div className="card mx-auto flex h-[calc(100dvh-12rem)] min-h-[26rem] max-w-5xl overflow-hidden !p-0 lg:h-[calc(100dvh-8.5rem)]">
      <aside
        aria-label="Chat list"
        className={`${view === 'chat' ? 'hidden md:flex' : 'flex'} w-full shrink-0 flex-col border-blush/70 md:w-80 md:border-r lg:w-96`}
      >
        <ChatList
          partnerName={partnerName}
          partnerUsername={partnerUsername}
          partnerAvatarPath={partnerAvatarPath}
          partnerOnline={partnerOnline}
          partnerTyping={partnerTyping}
          latest={latest}
          currentUserId={user?.id ?? ''}
          unread={unreadCount}
          chatActive={chatOpen}
          query={query}
          onQueryChange={setQuery}
          results={searchResults}
          searching={search.isFetching || (query.trim().length >= 2 && debouncedQuery !== query.trim())}
          onOpenChat={openChat}
          onOpenMessage={openMessage}
        />
      </aside>

      <section aria-label={`Conversation with ${partnerName}`} className={`${view === 'list' ? 'hidden md:flex' : 'flex'} min-w-0 flex-1 flex-col`}>
        <header className="flex items-center gap-2 border-b border-blush/70 px-2 py-3 sm:gap-3 sm:px-5">
          <button
            type="button"
            onClick={() => setView('list')}
            aria-label="Back to chats"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-mocha transition hover:bg-blush/60 md:hidden"
          >
            <FontAwesomeIcon icon={faArrowLeft} />
          </button>
          <PresenceAvatar name={partnerName} path={partnerAvatarPath} online={partnerOnline} className="h-11 w-11 text-lg" dotClassName="h-3 w-3" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-heading text-xl font-semibold leading-tight">{partnerName}</h1>
            <p className={`truncate text-xs ${partnerTyping || partnerOnline ? 'text-emerald-700' : 'text-mocha'}`} aria-live="polite">
              {partnerTyping ? 'typing…' : partnerOnline ? 'Active now' : 'Offline'}
            </p>
          </div>

          <div ref={menuRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Chat options"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="flex h-11 w-11 items-center justify-center rounded-full text-mocha transition hover:bg-blush/60"
            >
              <FontAwesomeIcon icon={faEllipsisVertical} />
            </button>
            {menuOpen && (
              <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-2xl border border-blush bg-white py-1 shadow-polaroid">
                <button
                  type="button"
                  role="menuitem"
                  disabled={list.length === 0}
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmClear(true);
                  }}
                  className="flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left text-sm text-espresso transition hover:bg-blush/50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <FontAwesomeIcon icon={faTrashCan} aria-hidden="true" /> Delete conversation
                </button>
              </div>
            )}
          </div>
        </header>

        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="flex-1 space-y-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-6"
          role="log"
          aria-live="polite"
          aria-label="Messages"
        >
          {hasMore && (
            <div className="pb-3 text-center">
              <button type="button" onClick={loadEarlier} disabled={messages.isFetching} className="btn-ghost px-4 py-1.5 text-xs">
                {messages.isFetching ? 'Loading…' : 'Load earlier messages'}
              </button>
            </div>
          )}

          {messages.isLoading && <p className="py-10 text-center text-sm text-mocha">Loading your conversation…</p>}
          {messages.error && <p role="alert" className="py-6 text-center text-sm text-espresso">{errorMessage(messages.error)}</p>}

          {!messages.isLoading && list.length === 0 && !messages.error && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <PresenceAvatar name={partnerName} path={partnerAvatarPath} online={partnerOnline} className="h-20 w-20 text-3xl" dotClassName="h-4 w-4" />
              <p className="font-heading text-xl">Say hello to {partnerName}</p>
              <p className="handwritten text-lg text-mocha">Your first message starts the story.</p>
            </div>
          )}

          {rows.map((row) => {
            if (row.type === 'time') {
              return (
                <div key={`time-${row.key}`} className="flex justify-center py-3">
                  <span className="rounded-full bg-blush/60 px-3 py-1 text-xs text-mocha">{row.label}</span>
                </div>
              );
            }
            const m = row.message;
            const mine = m.sender_id === user?.id;
            const deleted = !!m.deleted_at;
            const canAct = mine && !deleted && !m.pending;
            const open = activeId === m.id;
            const emojiOnly = !deleted && isEmojiOnly(m.body);

            return (
              <div key={m.id} data-mid={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                <div
                  role={canAct ? 'button' : undefined}
                  tabIndex={canAct ? 0 : undefined}
                  aria-expanded={canAct ? open : undefined}
                  title={new Date(m.created_at).toLocaleString()}
                  onClick={canAct ? () => setActiveId(open ? null : m.id) : undefined}
                  onKeyDown={canAct ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setActiveId(open ? null : m.id)) : undefined}
                  className={`max-w-[85%] transition sm:max-w-[75%] ${
                    emojiOnly
                      ? 'px-1'
                      : `rounded-3xl px-4 py-2.5 ${
                          deleted
                            ? 'border border-blush bg-transparent text-cocoa'
                            : mine
                              ? 'rounded-br-lg bg-gradient-to-br from-rose to-mocha text-white shadow-sm'
                              : 'rounded-bl-lg bg-white text-espresso shadow-sm'
                        }`
                  } ${highlightId === m.id ? 'ring-4 ring-blush' : ''} ${m.pending ? 'opacity-70' : ''} ${canAct ? 'cursor-pointer' : ''}`}
                >
                  {deleted ? (
                    <p className="text-sm italic">This message was unsent</p>
                  ) : emojiOnly ? (
                    <p className="text-5xl leading-tight">{m.body}</p>
                  ) : (
                    <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">{m.body}</p>
                  )}
                  {!emojiOnly && (
                    <p className={`mt-1 flex items-center justify-end gap-1.5 text-[11px] ${mine && !deleted ? 'text-white/80' : 'text-cocoa'}`}>
                      {timeLabel(m.created_at)}
                    </p>
                  )}
                </div>

                {open && canAct && (
                  <button
                    type="button"
                    onClick={() => unsend.mutate(m.id)}
                    disabled={unsend.isPending}
                    className="mt-1 inline-flex min-h-9 items-center gap-1.5 rounded-full border border-blush bg-white px-3 py-1 text-xs text-mocha transition hover:bg-blush/60"
                  >
                    <FontAwesomeIcon icon={faRotateLeft} /> Unsend
                  </button>
                )}
                {m.id === lastMineId && !open && (
                  <MessageStatusLine
                    status={statusOf(m)}
                    seenAt={m.read_at}
                    partnerName={partnerName}
                    partnerAvatarPath={partnerAvatarPath}
                  />
                )}
              </div>
            );
          })}

          {partnerTyping && (
            <div className="flex items-end gap-2 pt-1" role="status" aria-label={`${partnerName} is typing`}>
              <Avatar name={partnerName} path={partnerAvatarPath} className="h-6 w-6 text-[11px]" />
              <div className="flex items-center gap-1 rounded-3xl rounded-bl-lg bg-white px-4 py-3 shadow-sm">
                {[0, 150, 300].map((delay) => (
                  <span key={delay} className="h-2 w-2 animate-bounce rounded-full bg-cocoa/70" style={{ animationDelay: `${delay}ms` }} />
                ))}
              </div>
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="relative flex items-end gap-2 border-t border-blush/70 bg-white/60 px-3 py-3 sm:px-6"
        >
          {emojiOpen && <EmojiPicker onPick={insertEmoji} onClose={() => setEmojiOpen(false)} />}
          <button
            type="button"
            data-emoji-toggle
            onClick={() => setEmojiOpen((v) => !v)}
            aria-label="Choose an emoji"
            aria-expanded={emojiOpen}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl text-mocha transition hover:bg-blush/60"
          >
            <FontAwesomeIcon icon={faFaceSmile} />
          </button>
          <label htmlFor="message-input" className="sr-only">Write a message</label>
          <textarea
            id="message-input"
            ref={inputRef}
            rows={1}
            value={draft}
            maxLength={MESSAGE_MAX_LENGTH}
            onChange={(e) => onDraftChange(e.target.value)}
            onBlur={stopTyping}
            onKeyDown={(e) => {
              // Enter sends on desktop; on touch devices Enter makes a new line.
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(pointer: fine)').matches) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={`Message ${partnerName}…`}
            className="input max-h-36 min-h-[2.75rem] flex-1 resize-none rounded-3xl py-2.5 leading-snug"
          />
          <button
            type="submit"
            disabled={!draft.trim() || send.isPending}
            aria-label="Send message"
            className="btn-primary h-11 w-11 shrink-0 !p-0"
          >
            <FontAwesomeIcon icon={faPaperPlane} />
          </button>
        </form>
      </section>

      <ConfirmDialog
        open={confirmClear}
        title="Delete this conversation?"
        message={`This clears the chat on your side only. ${partnerName} will still see their copy, and new messages will start a fresh conversation.`}
        confirmLabel={clear.isPending ? 'Deleting…' : 'Delete conversation'}
        busy={clear.isPending}
        onConfirm={() => clear.mutate()}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}

function MessageStatusLine({
  status,
  seenAt,
  partnerName,
  partnerAvatarPath,
}: {
  status: MessageStatus;
  seenAt: string | null;
  partnerName: string;
  partnerAvatarPath?: string | null;
}) {
  const label =
    status === 'sending' ? 'Sending…' : status === 'sent' ? 'Sent' : status === 'delivered' ? 'Delivered' : `Seen ${seenAt ? timeLabel(seenAt) : ''}`.trim();
  return (
    <p className="mt-0.5 flex items-center gap-1.5 pr-2 text-[11px] text-cocoa" role="status">
      {status === 'seen' ? (
        <Avatar name={partnerName} path={partnerAvatarPath} className="h-4 w-4 text-[9px]" />
      ) : (
        <FontAwesomeIcon
          icon={status === 'sending' ? faCircleHollow : status === 'sent' ? faCircleCheckHollow : faCircleCheck}
          aria-hidden="true"
        />
      )}
      {label}
    </p>
  );
}

import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faAt, faMagnifyingGlass, faPaperPlane, faXmark } from '@fortawesome/free-solid-svg-icons';
import { useToast } from '../../contexts/ToastContext';
import { useProfile } from '../../hooks/useProfile';
import { useLoverRequests } from '../../hooks/useLoverRequests';
import { cancelLoverRequest, describeLoverError, findUserByUsername, sendLoverRequest } from '../../services/loverRequests';
import { errorMessage } from '../../lib/format';

type Found = { id: string; display_name: string; username: string; in_space: boolean };

/** Normalizes what the user typed: trims spaces and a leading @, and lowercases it. */
function cleanUsername(raw: string) {
  return raw.trim().replace(/^@/, '').toLowerCase();
}

export function AddLoverPanel() {
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const requests = useLoverRequests();
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Found | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const outgoing = (requests.data ?? []).filter((r) => r.direction === 'outgoing');

  const search = useMutation({
    mutationFn: (username: string) => findUserByUsername(username),
    onMutate: () => {
      setNotice(null);
      setFound(null);
    },
    onSuccess: (result, username) => {
      if (!result) {
        setNotice(`No one has the username @${username} yet.`);
        return;
      }
      if (result.in_space) {
        setNotice(`@${result.username} can't be added right now.`);
        return;
      }
      setFound(result);
    },
    onError: (e) => setNotice(describeLoverError(e)),
  });

  const send = useMutation({
    mutationFn: (username: string) => sendLoverRequest(username),
    onSuccess: async (_id, username) => {
      toast(`Request sent to @${username}.`);
      setFound(null);
      setQuery('');
      await queryClient.invalidateQueries({ queryKey: ['lover-requests'] });
    },
    onError: (e) => toast(describeLoverError(e), 'error'),
  });

  const cancel = useMutation({
    mutationFn: (requestId: string) => cancelLoverRequest(requestId),
    onSuccess: async () => {
      toast('Request cancelled.');
      await queryClient.invalidateQueries({ queryKey: ['lover-requests'] });
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    const username = cleanUsername(query);
    if (!username) return;
    if (!/^[a-z0-9_.]{3,30}$/.test(username)) {
      setNotice('Usernames are 3 to 30 letters, numbers, dots, or underscores.');
      return;
    }
    search.mutate(username);
  };

  return (
    <section aria-labelledby="add-lover-heading" className="rounded-3xl bg-blush/50 p-6">
      <h2 id="add-lover-heading" className="font-heading text-xl font-semibold">Add your lover</h2>
      <p className="mt-1 text-sm text-mocha">Search for their username, then send a request. They can accept it from their account.</p>

      {profile && !profile.username && (
        <p className="mt-3 rounded-2xl bg-white/70 px-4 py-3 text-sm text-mocha">
          You need a username before people can find you. <Link to="/settings" className="font-semibold text-espresso underline-offset-4 hover:underline">Set one in Settings</Link>.
        </p>
      )}
      {profile?.username && <p className="mt-3 text-sm text-mocha">Your username: <span className="font-semibold text-espresso">@{profile.username}</span></p>}

      <form onSubmit={onSearch} className="mt-4 flex flex-col gap-3 sm:flex-row" role="search">
        <div className="relative min-w-0 flex-1">
          <label htmlFor="lover-username" className="sr-only">Their username</label>
          <FontAwesomeIcon icon={faAt} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-cocoa" aria-hidden="true" />
          <input
            id="lover-username"
            className="input pl-10"
            placeholder="username"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={31}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button type="submit" className="btn-primary shrink-0" disabled={search.isPending || !query.trim()}>
          <FontAwesomeIcon icon={faMagnifyingGlass} /> {search.isPending ? 'Searching…' : 'Find'}
        </button>
      </form>

      {notice && <p role="status" className="mt-3 text-sm text-espresso">{notice}</p>}

      {found && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-white p-4 shadow-sm">
          <div className="min-w-0">
            <p className="truncate font-semibold text-espresso">{found.display_name}</p>
            <p className="truncate text-sm text-mocha">@{found.username}</p>
          </div>
          <button type="button" className="btn-primary shrink-0" onClick={() => send.mutate(found.username)} disabled={send.isPending}>
            <FontAwesomeIcon icon={faPaperPlane} /> {send.isPending ? 'Sending…' : 'Send request'}
          </button>
        </div>
      )}

      {outgoing.length > 0 && (
        <ul className="mt-4 space-y-2" aria-label="Requests you sent">
          {outgoing.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white/80 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-espresso">{r.other_name}</p>
                <p className="truncate text-xs text-mocha">Request pending{r.other_username ? ` · @${r.other_username}` : ''}</p>
              </div>
              <button type="button" className="btn-ghost shrink-0 py-2" onClick={() => cancel.mutate(r.id)} disabled={cancel.isPending}>
                <FontAwesomeIcon icon={faXmark} /> Cancel
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

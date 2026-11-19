import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEnvelopeOpenText, faLock, faPlus, faLockOpen } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useRelationship } from '../../hooks/useRelationship';
import { listLetters } from '../../services/letters';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/common/EmptyState';
import { Countdown } from '../../components/common/Countdown';
import { errorMessage, formatDate } from '../../lib/format';
import { LETTER_CATEGORIES } from '../../types';

export default function LettersPage() {
  const { user } = useAuth();
  const { data: relationship } = useRelationship();
  const relationshipId = relationship?.id ?? '';
  const [category, setCategory] = useState<string>('All');

  const letters = useQuery({
    queryKey: ['letters', relationshipId],
    enabled: !!relationshipId,
    queryFn: () => listLetters(relationshipId),
  });

  const now = Date.now();
  const filtered = useMemo(
    () => (letters.data ?? []).filter((l) => category === 'All' || l.category === category),
    [letters.data, category],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 sm:space-y-8">
      <PageHeader
        title="Love Letters"
        subtitle="Words to keep, and words to open later"
        action={<Link to="/letters/new" className="btn-primary"><FontAwesomeIcon icon={faPlus} /> Write a letter</Link>}
      />

      <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter letters">
        {['All', ...LETTER_CATEGORIES].map((c) => (
          <button key={c} type="button" aria-pressed={category === c} className={`chip ${category === c ? 'chip-active' : ''}`} onClick={() => setCategory(c)}>
            {c}
          </button>
        ))}
      </div>

      {letters.error && <p role="alert" className="text-sm">{errorMessage(letters.error)}</p>}

      {letters.data && filtered.length === 0 && (
        <EmptyState
          icon={faEnvelopeOpenText}
          title="No letters yet"
          message="Write something tender now, or seal a letter to open on a day that matters."
          action={<Link to="/letters/new" className="btn-primary"><FontAwesomeIcon icon={faPlus} /> Write your first letter</Link>}
        />
      )}

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((letter) => {
          const sealed = !!letter.open_at && new Date(letter.open_at).getTime() > now;
          const mine = letter.created_by === user?.id;
          return (
            <Link
              key={letter.id}
              to={`/letters/${letter.id}`}
              className="group relative flex min-h-56 flex-col rounded-[1.5rem] border border-white bg-[#FFFCF6] p-6 shadow-polaroid transition hover:-translate-y-1"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="tag">{letter.category}</span>
                <FontAwesomeIcon icon={sealed ? faLock : faLockOpen} className="text-rose" aria-hidden="true" />
              </div>
              <h2 className="handwritten mt-4 text-3xl leading-tight text-espresso">{letter.title}</h2>
              {letter.recipient && <p className="mt-1 text-sm text-mocha">For {letter.recipient}</p>}
              <div className="mt-auto pt-6 text-xs text-cocoa">
                {sealed && mine ? (
                  <p className="flex flex-col gap-1">
                    <span>Sealed until {formatDate(letter.open_at!, { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                    <span className="text-sm text-mocha"><Countdown target={letter.open_at!} /></span>
                  </p>
                ) : (
                  <p>{formatDate(letter.created_at, { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

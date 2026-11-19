import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBox, faPlus, faLock } from '@fortawesome/free-solid-svg-icons';
import { useRelationship } from '../../hooks/useRelationship';
import { listCapsules } from '../../services/capsules';
import { capsuleStatus, CAPSULE_STATUS_LABEL } from '../../lib/capsule';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/common/EmptyState';
import { Countdown } from '../../components/common/Countdown';
import { errorMessage, formatDate } from '../../lib/format';

export default function CapsulesPage() {
  const { data: relationship } = useRelationship();
  const relationshipId = relationship?.id ?? '';
  const capsules = useQuery({
    queryKey: ['capsules', relationshipId],
    enabled: !!relationshipId,
    queryFn: () => listCapsules(relationshipId),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 sm:space-y-8">
      <PageHeader
        title="Time Capsules"
        subtitle="Seal today for the people we'll be later"
        action={<Link to="/capsules/new" className="btn-primary"><FontAwesomeIcon icon={faPlus} /> New capsule</Link>}
      />

      {capsules.error && <p role="alert" className="text-sm">{errorMessage(capsules.error)}</p>}

      {capsules.data && capsules.data.length === 0 && (
        <EmptyState
          icon={faBox}
          title="No capsules yet"
          message="Gather a few memories and a note to each other, then seal them until a day you choose."
          action={<Link to="/capsules/new" className="btn-primary"><FontAwesomeIcon icon={faPlus} /> Create a capsule</Link>}
        />
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {(capsules.data ?? []).map((c) => {
          const status = capsuleStatus(c);
          return (
            <Link key={c.id} to={`/capsules/${c.id}`} className="card flex items-center gap-6 p-6 transition hover:-translate-y-1">
              <span className={`flex h-20 w-20 shrink-0 items-center justify-center rounded-full ${status === 'draft' ? 'bg-blush/60 text-mocha' : 'wax-seal text-white'}`}>
                <FontAwesomeIcon icon={status === 'draft' ? faBox : faLock} className="text-2xl" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <span className="tag">{CAPSULE_STATUS_LABEL[status]}</span>
                <h2 className="mt-2 truncate font-heading text-2xl font-semibold">{c.title}</h2>
                <p className="text-sm text-mocha">Opens {formatDate(c.open_at, { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                {status === 'sealed' && <p className="handwritten mt-1 text-lg text-rose"><Countdown target={c.open_at} /></p>}
                {status === 'ready' && <p className="handwritten mt-1 text-lg text-rose">Ready for you to open</p>}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

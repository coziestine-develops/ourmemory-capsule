import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faBox } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useRelationship } from '../../hooks/useRelationship';
import { createCapsule } from '../../services/capsules';
import { errorMessage } from '../../lib/format';

function minLocal(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CapsuleNewPage() {
  const { user } = useAuth();
  const { data: relationship } = useRelationship();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [openAt, setOpenAt] = useState('');

  const create = useMutation({
    mutationFn: () => createCapsule(relationship!.id, user!.id, { title, description, open_at: openAt }),
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ['capsules'] });
      toast('Capsule started. Add memories and notes, then seal it when you are ready.');
      navigate(`/capsules/${id}`);
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  return (
    <div className="mx-auto max-w-2xl space-y-6 sm:space-y-8">
      <Link to="/capsules" className="inline-flex items-center gap-2 text-sm font-medium text-mocha hover:text-espresso">
        <FontAwesomeIcon icon={faArrowLeft} /> All capsules
      </Link>
      <header>
        <h1 className="font-heading text-3xl font-semibold break-words sm:text-4xl md:text-5xl">A new time capsule</h1>
        <p className="handwritten mt-2 text-2xl text-mocha">To our future selves.</p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!openAt || new Date(openAt).getTime() <= Date.now()) {
            toast('Choose an opening date in the future.', 'error');
            return;
          }
          create.mutate();
        }}
        className="card space-y-6 p-8"
      >
        <div>
          <label htmlFor="cap-title" className="label">Capsule name</label>
          <input id="cap-title" required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} className="input" placeholder="Our first year" />
        </div>
        <div>
          <label htmlFor="cap-desc" className="label">A note about it (optional)</label>
          <textarea id="cap-desc" rows={3} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} className="input resize-y" placeholder="What we want to remember about today…" />
        </div>
        <div>
          <label htmlFor="cap-open" className="label">Open on</label>
          <input id="cap-open" type="datetime-local" required min={minLocal()} value={openAt} onChange={(e) => setOpenAt(e.target.value)} className="input" />
          <p className="mt-1.5 text-xs text-cocoa">Once sealed, the capsule can't be opened before this date, and its date can't be changed.</p>
        </div>
        <button type="submit" className="btn-primary w-full py-3" disabled={create.isPending}>
          <FontAwesomeIcon icon={faBox} /> {create.isPending ? 'Creating…' : 'Create capsule'}
        </button>
      </form>
    </div>
  );
}

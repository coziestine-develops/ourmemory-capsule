import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft,
  faBox,
  faLock,
  faLockOpen,
  faPaperPlane,
  faPlus,
  faSnowflake,
  faTrashCan,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import {
  addCapsuleMessage,
  addMemoriesToCapsule,
  deleteCapsule,
  deleteCapsuleMessage,
  getCapsule,
  listCapsuleMemories,
  listCapsuleMessages,
  openCapsule,
  removeMemoryFromCapsule,
  sealCapsule,
  updateCapsuleDraft,
} from '../../services/capsules';
import { listMemoryPicker } from '../../services/memories';
import { useRelationship } from '../../hooks/useRelationship';
import { capsuleStatus, CAPSULE_STATUS_LABEL } from '../../lib/capsule';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { Countdown } from '../../components/common/Countdown';
import { SignedMedia } from '../../components/memories/SignedMedia';
import { coverOf } from '../../components/memories/coverOf';
import { errorMessage, formatDate } from '../../lib/format';
import { BrandIcon } from '../../components/common/BrandIcon';

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CapsuleDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const { data: relationship } = useRelationship();
  const relationshipId = relationship?.id ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [tick, setTick] = useState(() => Date.now());
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [openLocal, setOpenLocal] = useState('');
  const [confirmSeal, setConfirmSeal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const capsule = useQuery({ queryKey: ['capsule', id], enabled: !!id, queryFn: () => getCapsule(id) });
  const memories = useQuery({ queryKey: ['capsule-memories', id], enabled: !!id, queryFn: () => listCapsuleMemories(id) });
  const messages = useQuery({ queryKey: ['capsule-messages', id], enabled: !!id, queryFn: () => listCapsuleMessages(id) });
  const picker = useQuery({
    queryKey: ['memory-picker', relationshipId],
    enabled: picking && !!relationshipId,
    queryFn: () => listMemoryPicker(relationshipId),
  });

  useEffect(() => {
    if (capsule.data) {
      setTitle(capsule.data.title);
      setDescription(capsule.data.description ?? '');
      setOpenLocal(toLocalInput(capsule.data.open_at));
    }
  }, [capsule.data]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['capsule', id] });
    await queryClient.invalidateQueries({ queryKey: ['capsule-memories', id] });
    await queryClient.invalidateQueries({ queryKey: ['capsule-messages', id] });
    await queryClient.invalidateQueries({ queryKey: ['capsules'] });
  };
  const onError = (e: unknown) => toast(errorMessage(e), 'error');

  const saveDraft = useMutation({
    mutationFn: () => {
      if (!openLocal || new Date(openLocal).getTime() <= Date.now()) throw new Error('Choose an opening date in the future.');
      return updateCapsuleDraft(id, { title, description, open_at: openLocal });
    },
    onSuccess: async () => { await refresh(); toast('Capsule saved.'); },
    onError,
  });
  const addPicked = useMutation({
    mutationFn: () => addMemoriesToCapsule(id, picked),
    onSuccess: async () => { await refresh(); setPicked([]); setPicking(false); toast('Memories added to the capsule.'); },
    onError,
  });
  const removeMemory = useMutation({
    mutationFn: (memoryId: string) => removeMemoryFromCapsule(id, memoryId),
    onSuccess: refresh,
    onError,
  });
  const postMessage = useMutation({
    mutationFn: () => addCapsuleMessage(id, user!.id, message),
    onSuccess: async () => { await refresh(); setMessage(''); toast('Note added.'); },
    onError,
  });
  const removeMessage = useMutation({
    mutationFn: (messageId: string) => deleteCapsuleMessage(messageId),
    onSuccess: refresh,
    onError,
  });
  const seal = useMutation({
    mutationFn: () => sealCapsule(id),
    onSuccess: async () => { await refresh(); setConfirmSeal(false); toast('Sealed. It will wait for its day.'); },
    onError: (e) => { setConfirmSeal(false); onError(e); },
  });
  const open = useMutation({
    mutationFn: () => openCapsule(id),
    onSuccess: async () => {
      setRevealed(true);
      await refresh();
      toast('Your capsule is open.');
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: () => deleteCapsule(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['capsules'] });
      toast('Capsule deleted.');
      navigate('/capsules', { replace: true });
    },
    onError,
  });

  if (capsule.error) return <p role="alert" className="text-sm">{errorMessage(capsule.error)}</p>;
  if (!capsule.data) return <p className="handwritten animate-pulse text-2xl text-mocha">Finding your capsule…</p>;

  const data = capsule.data;
  const status = capsuleStatus(data, new Date(tick));
  const isDraft = status === 'draft';
  const contentMemories = memories.data ?? [];
  const contentMessages = messages.data ?? [];
  const existingIds = new Set(contentMemories.map((m) => m.id));
  const available = (picker.data ?? []).filter((m) => !existingIds.has(m.id));

  return (
    <div className="mx-auto max-w-5xl space-y-6 sm:space-y-8">
      <Link to="/capsules" className="inline-flex items-center gap-2 text-sm font-medium text-mocha hover:text-espresso">
        <FontAwesomeIcon icon={faArrowLeft} /> All capsules
      </Link>

      <header className="card flex flex-col items-center gap-5 p-5 text-center sm:gap-6 sm:p-8 md:flex-row md:text-left">
        <motion.span
          className={`flex h-24 w-24 shrink-0 items-center sm:h-28 sm:w-28 justify-center rounded-full ${isDraft ? 'bg-blush/60 text-mocha' : 'wax-seal text-white'}`}
          animate={open.isPending ? { rotate: [0, -10, 10, -6, 0], scale: [1, 1.08, 0.9] } : { rotate: 0, scale: 1 }}
          transition={{ duration: 1.2 }}
          aria-hidden="true"
        >
          <FontAwesomeIcon icon={isDraft ? faBox : status === 'opened' ? faLockOpen : faLock} className="text-3xl" />
        </motion.span>
        <div className="min-w-0 flex-1">
          <span className="tag">{CAPSULE_STATUS_LABEL[status]}</span>
          <h1 className="mt-3 font-heading text-3xl font-semibold break-words sm:text-4xl md:text-5xl">{data.title}</h1>
          {data.description && <p className="handwritten mt-2 text-2xl text-mocha">{data.description}</p>}
          <p className="mt-3 text-sm text-mocha">Opens {formatDate(data.open_at, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
        </div>
      </header>

      {isDraft && (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <section className="card space-y-5 p-6" aria-labelledby="edit-cap">
            <h2 id="edit-cap" className="font-heading text-2xl font-semibold">Details</h2>
            <div>
              <label htmlFor="cap-title-edit" className="label">Name</label>
              <input id="cap-title-edit" required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} className="input" />
            </div>
            <div>
              <label htmlFor="cap-desc-edit" className="label">Note</label>
              <textarea id="cap-desc-edit" rows={3} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} className="input resize-y" />
            </div>
            <div>
              <label htmlFor="cap-open-edit" className="label">Open on</label>
              <input id="cap-open-edit" type="datetime-local" value={openLocal} onChange={(e) => setOpenLocal(e.target.value)} className="input" />
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-ghost" onClick={() => saveDraft.mutate()} disabled={saveDraft.isPending}>Save details</button>
              <button type="button" className="btn-ghost" onClick={() => setConfirmDelete(true)}><FontAwesomeIcon icon={faTrashCan} /> Delete</button>
            </div>
          </section>

          <section className="card flex flex-col justify-between gap-6 p-6" aria-labelledby="seal-heading">
            <div>
              <h2 id="seal-heading" className="font-heading text-2xl font-semibold">Ready to seal?</h2>
              <p className="mt-2 text-sm text-mocha">
                Once sealed, its memories, notes, and date are locked until the opening day. Add everything first.
              </p>
            </div>
            <button type="button" className="btn-primary" onClick={() => setConfirmSeal(true)} disabled={contentMemories.length + contentMessages.length === 0 && !description}>
              <FontAwesomeIcon icon={faSnowflake} /> Seal capsule
            </button>
          </section>
        </div>
      )}

      {status === 'sealed' && (
        <section className="card flex flex-col items-center gap-4 p-10 text-center" aria-live="polite">
          <FontAwesomeIcon icon={faLock} className="text-3xl text-rose" aria-hidden="true" />
          <p className="font-heading text-3xl">Sealed with love</p>
          <p className="handwritten text-2xl text-mocha">It opens in <span className="text-rose"><Countdown target={data.open_at} /></span></p>
          <p className="max-w-md text-sm text-mocha">Nothing inside can be seen until then, not even by you.</p>
        </section>
      )}

      {status === 'ready' && !revealed && (
        <section className="card flex flex-col items-center gap-6 p-10 text-center">
          <p className="font-heading text-3xl">Your capsule is ready to open</p>
          <p className="handwritten text-2xl text-mocha">Take a breath. Then break the seal together.</p>
          <button type="button" className="btn-primary px-8 py-3 text-base" onClick={() => open.mutate()} disabled={open.isPending}>
            <FontAwesomeIcon icon={faLockOpen} /> {open.isPending ? 'Opening…' : 'Open capsule'}
          </button>
        </section>
      )}

      <AnimatePresence>
        {(status === 'opened' || revealed) && (
          <motion.section
            key="contents"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="space-y-8"
          >
            <div className="text-center">
              <p className="handwritten text-3xl text-rose">To our future selves.</p>
              <p className="handwritten mt-1 text-2xl text-mocha">Remember how happy we were when we created this?</p>
            </div>

            {contentMemories.length > 0 && (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {contentMemories.map((m) => {
                  const cover = coverOf(m);
                  return (
                    <Link key={m.id} to={`/memories/${m.id}`} className="polaroid transition hover:-translate-y-1">
                      <div className="aspect-[4/3] overflow-hidden bg-blush/50">
                        {cover && <SignedMedia path={cover.storage_path} mediaType={cover.media_type} alt={m.title} className="h-full w-full object-cover" />}
                      </div>
                      <p className="mt-3 truncate font-heading text-lg">{m.title}</p>
                    </Link>
                  );
                })}
              </div>
            )}

            {contentMessages.length > 0 && (
              <div className="space-y-4">
                {contentMessages.map((msg) => (
                  <article key={msg.id} className="handwritten rounded-[1.5rem] border border-white bg-[#FFFCF6] p-6 text-2xl leading-relaxed shadow-polaroid">
                    {msg.body}
                  </article>
                ))}
              </div>
            )}
          </motion.section>
        )}
      </AnimatePresence>

      {isDraft && (
        <section className="space-y-6" aria-labelledby="contents-heading">
          <div className="flex items-center justify-between">
            <h2 id="contents-heading" className="font-heading text-2xl font-semibold">Inside the capsule</h2>
            <button type="button" className="btn-ghost" onClick={() => setPicking((v) => !v)}><FontAwesomeIcon icon={faPlus} /> Add memories</button>
          </div>

          {picking && (
            <div className="card p-6">
              {available.length === 0 ? (
                <p className="handwritten text-xl text-mocha">Every memory is already inside.</p>
              ) : (
                <div className="grid max-h-80 grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4 md:grid-cols-6">
                  {available.map((m) => {
                    const on = picked.includes(m.id);
                    const cover = coverOf(m);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setPicked((s) => (on ? s.filter((x) => x !== m.id) : [...s, m.id]))}
                        className={`overflow-hidden rounded-2xl border-2 text-left ${on ? 'border-mocha' : 'border-transparent'}`}
                      >
                        <div className="aspect-square bg-blush/50">
                          {cover && <SignedMedia path={cover.storage_path} mediaType={cover.media_type} alt={m.title} className="h-full w-full object-cover" />}
                        </div>
                        <p className="truncate px-2 py-1 text-xs">{m.title}</p>
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="mt-4 flex gap-2">
                <button type="button" className="btn-primary" disabled={picked.length === 0 || addPicked.isPending} onClick={() => addPicked.mutate()}>
                  Add {picked.length || ''} to capsule
                </button>
                <button type="button" className="btn-ghost" onClick={() => { setPicking(false); setPicked([]); }}>Close</button>
              </div>
            </div>
          )}

          {contentMemories.length > 0 && (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {contentMemories.map((m) => {
                const cover = coverOf(m);
                return (
                  <li key={m.id} className="polaroid">
                    <div className="aspect-[4/3] overflow-hidden bg-blush/50">
                      {cover && <SignedMedia path={cover.storage_path} mediaType={cover.media_type} alt={m.title} className="h-full w-full object-cover" />}
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <p className="truncate font-medium">{m.title}</p>
                      <button type="button" onClick={() => removeMemory.mutate(m.id)} aria-label={`Remove ${m.title}`} className="rounded-full p-2 text-mocha hover:bg-blush/60">
                        <FontAwesomeIcon icon={faXmark} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="card space-y-4 p-6">
            <h3 className="font-heading text-xl font-semibold">Write a note to the future</h3>
            <textarea
              aria-label="Your note"
              rows={4}
              maxLength={5000}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="input handwritten resize-y text-2xl"
              placeholder="Dear future us…"
            />
            <button type="button" className="btn-primary" disabled={!message.trim() || postMessage.isPending} onClick={() => postMessage.mutate()}>
              <FontAwesomeIcon icon={faPaperPlane} /> Add note
            </button>
            {contentMessages.length > 0 && (
              <ul className="space-y-3 pt-2">
                {contentMessages.map((msg) => (
                  <li key={msg.id} className="flex items-start justify-between gap-3 rounded-2xl bg-white/70 p-4">
                    <p className="handwritten text-xl">{msg.body}</p>
                    {msg.created_by === user?.id && (
                      <button type="button" onClick={() => removeMessage.mutate(msg.id)} aria-label="Delete note" className="rounded-full p-2 text-mocha hover:bg-blush/60">
                        <FontAwesomeIcon icon={faTrashCan} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {!isDraft && !revealed && status !== 'opened' && (
        <p className="flex items-center justify-center gap-2 text-sm text-mocha">
          <BrandIcon className="text-rose" aria-hidden="true" /> The contents stay hidden until the opening day.
        </p>
      )}

      <ConfirmDialog
        open={confirmSeal}
        title="Seal this capsule?"
        message="Once sealed, the memories, notes, name, and opening date can't be changed or seen until the day it opens."
        confirmLabel="Seal capsule"
        busy={seal.isPending}
        onConfirm={() => seal.mutate()}
        onCancel={() => setConfirmSeal(false)}
      />
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this capsule?"
        message="This draft capsule and everything inside it will be removed. The memories themselves are kept."
        confirmLabel="Delete capsule"
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

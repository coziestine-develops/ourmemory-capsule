import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft,
  faBackward,
  faChevronDown,
  faChevronUp,
  faCirclePlay,
  faForward,
  faPause,
  faPen,
  faPlus,
  faStar,
  faTrashCan,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { useRelationship } from '../../hooks/useRelationship';
import { useToast } from '../../contexts/ToastContext';
import {
  addMemoriesToAlbum,
  deleteAlbum,
  getAlbum,
  listAlbumMemories,
  removeMemoryFromAlbum,
  swapAlbumOrder,
  updateAlbum,
} from '../../services/albums';
import { listMemoryPicker } from '../../services/memories';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { SignedMedia } from '../../components/memories/SignedMedia';
import { coverOf } from '../../components/memories/coverOf';
import { errorMessage, formatDate } from '../../lib/format';

export default function AlbumDetailPage() {
  const { id = '' } = useParams();
  const { data: relationship } = useRelationship();
  const relationshipId = relationship?.id ?? '';
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [slideshow, setSlideshow] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  const album = useQuery({ queryKey: ['album', id], queryFn: () => getAlbum(id), enabled: !!id });
  const items = useQuery({ queryKey: ['album-memories', id], queryFn: () => listAlbumMemories(id), enabled: !!id });
  const picker = useQuery({
    queryKey: ['memory-picker', relationshipId],
    enabled: adding && !!relationshipId,
    queryFn: () => listMemoryPicker(relationshipId),
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['album', id] });
    await queryClient.invalidateQueries({ queryKey: ['album-memories', id] });
    await queryClient.invalidateQueries({ queryKey: ['albums'] });
  };
  const onError = (e: unknown) => toast(errorMessage(e), 'error');

  const save = useMutation({
    mutationFn: () => updateAlbum(id, { name: name.trim(), description: description.trim() || null }),
    onSuccess: async () => { await refresh(); setEditing(false); toast('Album updated.'); },
    onError,
  });
  const remove = useMutation({
    mutationFn: () => deleteAlbum(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['albums'] });
      toast('Album deleted. Your memories are still safe.');
      navigate('/albums', { replace: true });
    },
    onError,
  });
  const addSelected = useMutation({
    mutationFn: () => addMemoriesToAlbum(id, selected, items.data?.length ?? 0),
    onSuccess: async () => { await refresh(); setSelected([]); setAdding(false); toast('Memories added to the album.'); },
    onError,
  });
  const removeItem = useMutation({
    mutationFn: (memoryId: string) => removeMemoryFromAlbum(id, memoryId),
    onSuccess: async () => { await refresh(); toast('Removed from album. The memory stays in your collection.'); },
    onError,
  });
  const setCover = useMutation({
    mutationFn: (memoryId: string) => updateAlbum(id, { cover_memory_id: memoryId }),
    onSuccess: async () => { await refresh(); toast('Album cover updated.'); },
    onError,
  });
  const move = useMutation({
    mutationFn: ({ index, dir }: { index: number; dir: -1 | 1 }) => {
      const list = items.data ?? [];
      const a = list[index];
      const b = list[index + dir];
      return swapAlbumOrder(id, { memoryId: a.memory.id, order: a.display_order }, { memoryId: b.memory.id, order: b.display_order });
    },
    onSuccess: refresh,
    onError,
  });

  useEffect(() => {
    if (album.data) {
      setName(album.data.name);
      setDescription(album.data.description ?? '');
    }
  }, [album.data]);

  useEffect(() => {
    if (!playing || slideshow === null) return;
    const count = items.data?.length ?? 0;
    if (count === 0) return;
    const timer = window.setInterval(() => setSlideshow((i) => ((i ?? 0) + 1) % count), 4500);
    return () => window.clearInterval(timer);
  }, [playing, slideshow, items.data]);

  if (album.error) return <p role="alert">{errorMessage(album.error)}</p>;
  if (!album.data) return <p className="handwritten animate-pulse text-2xl text-mocha">Opening the album…</p>;

  const list = items.data ?? [];
  const existingIds = new Set(list.map((row) => row.memory.id));
  const available = (picker.data ?? []).filter((m) => !existingIds.has(m.id));
  const slideMemory = slideshow !== null ? list[slideshow]?.memory : undefined;
  const slideCover = slideMemory ? coverOf(slideMemory) : undefined;

  return (
    <div className="mx-auto max-w-6xl space-y-6 sm:space-y-8">
      <Link to="/albums" className="inline-flex items-center gap-2 text-sm font-medium text-mocha hover:text-espresso">
        <FontAwesomeIcon icon={faArrowLeft} /> All albums
      </Link>

      <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        {editing ? (
          <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) save.mutate(); }} className="grid w-full max-w-xl gap-3">
            <label htmlFor="edit-name" className="sr-only">Album name</label>
            <input id="edit-name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className="input font-heading text-2xl" />
            <label htmlFor="edit-desc" className="sr-only">Description</label>
            <input id="edit-desc" maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} className="input" placeholder="A short description" />
            <div className="flex gap-2">
              <button type="submit" className="btn-primary" disabled={save.isPending}>Save</button>
              <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </form>
        ) : (
          <div>
            <h1 className="font-heading text-3xl font-semibold break-words sm:text-4xl md:text-5xl">{album.data.name}</h1>
            <p className="handwritten mt-2 text-2xl text-mocha">
              {album.data.description ?? `${list.length} ${list.length === 1 ? 'memory' : 'memories'} together`}
            </p>
          </div>
        )}
        {!editing && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost" onClick={() => setEditing(true)}><FontAwesomeIcon icon={faPen} /> Edit</button>
            <button type="button" className="btn-ghost" disabled={list.length === 0} onClick={() => { setSlideshow(0); setPlaying(false); }}>
              <FontAwesomeIcon icon={faCirclePlay} /> Slideshow
            </button>
            <button type="button" className="btn-ghost" onClick={() => setAdding((v) => !v)}><FontAwesomeIcon icon={faPlus} /> Add memories</button>
            <button type="button" className="btn-ghost" onClick={() => setConfirmDelete(true)} aria-label="Delete album"><FontAwesomeIcon icon={faTrashCan} /></button>
          </div>
        )}
      </header>

      {adding && (
        <section aria-labelledby="picker-heading" className="card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 id="picker-heading" className="font-heading text-2xl font-semibold">Choose memories</h2>
            <span className="text-sm text-mocha">{selected.length} selected</span>
          </div>
          {available.length === 0 ? (
            <p className="handwritten text-xl text-mocha">Every memory is already in this album.</p>
          ) : (
            <div className="grid max-h-96 grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4 md:grid-cols-6">
              {available.map((m) => {
                const on = selected.includes(m.id);
                const cover = coverOf(m);
                return (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setSelected((s) => (on ? s.filter((x) => x !== m.id) : [...s, m.id]))}
                    className={`overflow-hidden rounded-2xl border-2 text-left transition ${on ? 'border-mocha' : 'border-transparent'}`}
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
          <div className="mt-5 flex gap-2">
            <button type="button" className="btn-primary" disabled={selected.length === 0 || addSelected.isPending} onClick={() => addSelected.mutate()}>
              Add {selected.length || ''} to album
            </button>
            <button type="button" className="btn-ghost" onClick={() => { setAdding(false); setSelected([]); }}>Close</button>
          </div>
        </section>
      )}

      {items.isLoading && <p className="handwritten animate-pulse text-xl text-mocha">Gathering the album…</p>}

      {!items.isLoading && list.length === 0 && (
        <p className="handwritten text-2xl text-mocha">This album is waiting for its first memory.</p>
      )}

      {list.length > 0 && (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((row, index) => {
            const cover = coverOf(row.memory);
            const isCover = album.data.cover_memory_id === row.memory.id;
            return (
              <li key={row.memory.id} className="polaroid">
                <div className="aspect-[4/3] overflow-hidden bg-blush/50">
                  {cover && <SignedMedia path={cover.storage_path} mediaType={cover.media_type} alt={row.memory.title} className="h-full w-full object-cover" />}
                </div>
                <div className="mt-3 min-w-0">
                  <Link to={`/memories/${row.memory.id}`} className="block truncate font-heading text-lg font-semibold hover:underline">{row.memory.title}</Link>
                  <p className="text-xs text-mocha">{formatDate(row.memory.memory_date)}</p>
                </div>
                <div className="mt-3 flex items-center gap-1">
                  <button type="button" onClick={() => setCover.mutate(row.memory.id)} aria-pressed={isCover} aria-label="Use as album cover" className={`rounded-full p-2 ${isCover ? 'text-rose' : 'text-mocha hover:bg-blush/60'}`}>
                    <FontAwesomeIcon icon={faStar} />
                  </button>
                  <button type="button" onClick={() => move.mutate({ index, dir: -1 })} disabled={index === 0} aria-label="Move earlier" className="rounded-full p-2 text-mocha hover:bg-blush/60 disabled:opacity-30">
                    <FontAwesomeIcon icon={faChevronUp} />
                  </button>
                  <button type="button" onClick={() => move.mutate({ index, dir: 1 })} disabled={index === list.length - 1} aria-label="Move later" className="rounded-full p-2 text-mocha hover:bg-blush/60 disabled:opacity-30">
                    <FontAwesomeIcon icon={faChevronDown} />
                  </button>
                  <button type="button" onClick={() => removeItem.mutate(row.memory.id)} aria-label="Remove from album" className="ml-auto rounded-full p-2 text-mocha hover:bg-blush/60">
                    <FontAwesomeIcon icon={faXmark} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {slideshow !== null && slideMemory && (
        <div role="dialog" aria-modal="true" aria-label="Slideshow" className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-espresso/95 p-6 text-ivory">
          <button type="button" onClick={() => { setSlideshow(null); setPlaying(false); }} className="absolute right-6 top-6 rounded-full p-3 text-ivory hover:bg-white/10" aria-label="Close slideshow">
            <FontAwesomeIcon icon={faXmark} className="text-xl" />
          </button>
          <div className="w-full max-w-4xl">
            <div className="overflow-hidden rounded-[1.5rem] bg-black/20">
              {slideCover && (
                <SignedMedia path={slideCover.storage_path} mediaType={slideCover.media_type} alt={slideMemory.title} controls className="max-h-[70dvh] w-full object-contain" />
              )}
            </div>
            <p className="mt-5 text-center font-heading text-3xl">{slideMemory.title}</p>
            <p className="handwritten mt-1 text-center text-xl text-blush">{formatDate(slideMemory.memory_date)}</p>
            <div className="mt-6 flex items-center justify-center gap-4">
              <button type="button" className="rounded-full p-3 hover:bg-white/10" aria-label="Previous" onClick={() => setSlideshow((i) => ((i ?? 0) - 1 + list.length) % list.length)}>
                <FontAwesomeIcon icon={faBackward} />
              </button>
              <button type="button" className="rounded-full bg-white/15 p-4 hover:bg-white/25" aria-label={playing ? 'Pause' : 'Play'} onClick={() => setPlaying((p) => !p)}>
                <FontAwesomeIcon icon={playing ? faPause : faCirclePlay} />
              </button>
              <button type="button" className="rounded-full p-3 hover:bg-white/10" aria-label="Next" onClick={() => setSlideshow((i) => ((i ?? 0) + 1) % list.length)}>
                <FontAwesomeIcon icon={faForward} />
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this album?"
        message="The album will be removed, but every memory inside it stays in your collection."
        confirmLabel="Delete album"
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

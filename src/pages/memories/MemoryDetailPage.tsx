import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft,
  faCalendar,
  faDownload,
  faLocationDot,
  faPen,
  faTrash,
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useSignedUrl } from '../../hooks/useSignedUrl';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { SignedMedia } from '../../components/memories/SignedMedia';
import { MemoryReactions } from '../../components/memories/MemoryReactions';
import { MemoryComments } from '../../components/memories/MemoryComments';
import { deleteMemory, getMemory, setFavorite } from '../../services/memories';
import type { MemoryMedia } from '../../types';
import { errorMessage, formatDate } from '../../lib/format';
import { BrandIcon } from '../../components/common/BrandIcon';

function DownloadLink({ media }: { media: MemoryMedia }) {
  const { data: url } = useSignedUrl(media.storage_path);
  return (
    <a
      href={url ?? '#'}
      download={media.original_filename}
      aria-disabled={!url}
      className="inline-flex items-center gap-2 text-sm font-medium text-mocha underline-offset-4 hover:underline"
    >
      <FontAwesomeIcon icon={faDownload} />
      Download {media.original_filename}
    </a>
  );
}

export default function MemoryDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);

  const memory = useQuery({
    queryKey: ['memory', id],
    enabled: !!id,
    queryFn: () => getMemory(id!),
  });

  const toggleFavorite = useMutation({
    mutationFn: (next: boolean) => setFavorite(id!, next),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['memory', id] });
      await queryClient.invalidateQueries({ queryKey: ['memories'] });
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  const remove = useMutation({
    mutationFn: () => deleteMemory(memory.data!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['memories'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast('Memory deleted.');
      navigate('/memories', { replace: true });
    },
    onError: (error) => {
      setConfirming(false);
      toast(errorMessage(error), 'error');
    },
  });

  if (memory.isLoading) return <p className="handwritten animate-pulse text-xl text-mocha">Opening your memory…</p>;
  if (memory.error || !memory.data) {
    return (
      <div className="space-y-4">
        <p role="alert" className="font-heading text-2xl">This memory couldn't be found.</p>
        <Link to="/memories" className="btn-ghost">Back to memories</Link>
      </div>
    );
  }

  const data = memory.data;
  const media = [...(data.memory_media ?? [])].sort((a, b) => a.display_order - b.display_order);
  const cover = media.find((item) => item.is_cover) ?? media[0];
  const others = media.filter((item) => item.id !== cover?.id);
  const authorLabel = data.created_by === user?.id ? 'You' : 'Your lover';

  return (
    <article className="mx-auto max-w-4xl space-y-6 sm:space-y-8">
      <div className="flex items-center justify-between gap-4">
        <Link to="/memories" className="inline-flex items-center gap-2 text-sm font-medium text-mocha hover:text-espresso">
          <FontAwesomeIcon icon={faArrowLeft} /> Back to memories
        </Link>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn-ghost px-3"
            aria-pressed={data.is_favorite}
            aria-label={data.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
            onClick={() => toggleFavorite.mutate(!data.is_favorite)}
            disabled={toggleFavorite.isPending}
          >
            <BrandIcon className={data.is_favorite ? 'text-rose' : ''} />
          </button>
          <Link to={`/memories/${data.id}/edit`} className="btn-ghost px-3" aria-label="Edit memory">
            <FontAwesomeIcon icon={faPen} />
          </Link>
          <button type="button" className="btn-ghost px-3" aria-label="Delete memory" onClick={() => setConfirming(true)}>
            <FontAwesomeIcon icon={faTrash} />
          </button>
        </div>
      </div>

      {cover && (
        <div className="polaroid">
          <div className="overflow-hidden bg-blush">
            <SignedMedia
              path={cover.storage_path}
              mediaType={cover.media_type}
              alt={data.title}
              controls
              className="max-h-[70dvh] w-full object-contain"
            />
          </div>
        </div>
      )}

      <header>
        <h1 className="font-heading text-3xl font-semibold break-words sm:text-4xl md:text-5xl">{data.title}</h1>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-mocha">
          <li className="flex items-center gap-2">
            <FontAwesomeIcon icon={faCalendar} /> {formatDate(data.memory_date)}
            {data.memory_time && ` at ${data.memory_time.slice(0, 5)}`}
          </li>
          {data.location && (
            <li className="flex items-center gap-2"><FontAwesomeIcon icon={faLocationDot} /> {data.location}</li>
          )}
          <li>{data.category}</li>
          {data.mood && <li>Feeling {data.mood.toLowerCase()}</li>}
        </ul>
      </header>

      {data.description && (
        <div className="whitespace-pre-line text-lg leading-relaxed">{data.description}</div>
      )}

      {others.length > 0 && (
        <section aria-labelledby="more-photos" className="space-y-4">
          <h2 id="more-photos" className="font-heading text-2xl font-semibold">More from this day</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {others.map((item) => (
              <figure key={item.id} className="polaroid">
                <div className="aspect-square overflow-hidden bg-blush">
                  <SignedMedia path={item.storage_path} mediaType={item.media_type} alt={item.original_filename} className="h-full w-full object-cover" />
                </div>
                <figcaption className="mt-2">
                  <DownloadLink media={item} />
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      <MemoryReactions memoryId={data.id} />

      <MemoryComments memoryId={data.id} />

      {cover && (
        <p className="border-t border-blush pt-6 text-sm text-mocha">
          Added by {authorLabel} on {formatDate(data.created_at, { month: 'short', day: 'numeric', year: 'numeric' })}
          {' · '}
          <DownloadLink media={cover} />
        </p>
      )}

      <ConfirmDialog
        open={confirming}
        title="Delete this memory?"
        message="This removes the story and every photo or video attached to it. It can't be undone."
        confirmLabel="Delete memory"
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
        onCancel={() => setConfirming(false)}
      />
    </article>
  );
}

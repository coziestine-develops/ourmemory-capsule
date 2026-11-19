import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFolderOpen, faPlus } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useRelationship } from '../../hooks/useRelationship';
import { createAlbum, listAlbums } from '../../services/albums';
import { PageHeader } from '../../components/common/PageHeader';
import { EmptyState } from '../../components/common/EmptyState';
import { SignedMedia } from '../../components/memories/SignedMedia';
import { coverOf } from '../../components/memories/coverOf';
import { errorMessage } from '../../lib/format';
import { BrandIcon } from '../../components/common/BrandIcon';

export default function AlbumsPage() {
  const { user } = useAuth();
  const { data: relationship } = useRelationship();
  const relationshipId = relationship?.id ?? '';
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const albums = useQuery({
    queryKey: ['albums', relationshipId],
    enabled: !!relationshipId,
    queryFn: () => listAlbums(relationshipId),
  });

  const create = useMutation({
    mutationFn: () => createAlbum(relationshipId, user!.id, name.trim(), description.trim()),
    onSuccess: async (id) => {
      await queryClient.invalidateQueries({ queryKey: ['albums'] });
      toast('Album created.');
      navigate(`/albums/${id}`);
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 sm:space-y-8">
      <PageHeader
        title="Albums"
        subtitle="Collections of our best moments"
        action={
          <button type="button" className="btn-primary" onClick={() => setCreating((v) => !v)} aria-expanded={creating}>
            <FontAwesomeIcon icon={faPlus} /> New album
          </button>
        }
      />

      {creating && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate();
          }}
          className="card grid gap-4 p-6 md:grid-cols-[1fr_1.4fr_auto] md:items-end"
        >
          <div>
            <label htmlFor="album-name" className="label">Album name</label>
            <input id="album-name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Our Firsts" />
          </div>
          <div>
            <label htmlFor="album-desc" className="label">Description (optional)</label>
            <input id="album-desc" maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} className="input" placeholder="The first of everything" />
          </div>
          <button type="submit" className="btn-primary" disabled={create.isPending || !name.trim()}>
            {create.isPending ? 'Creating…' : 'Create album'}
          </button>
        </form>
      )}

      {albums.error && <p role="alert" className="text-sm">{errorMessage(albums.error)}</p>}

      {albums.data && albums.data.length === 0 && (
        <EmptyState
          icon={faFolderOpen}
          title="No albums yet"
          message="Gather your favorite moments into a little album for the two of you."
          action={<button type="button" className="btn-primary" onClick={() => setCreating(true)}><FontAwesomeIcon icon={faPlus} /> Create an album</button>}
        />
      )}

      {albums.data && albums.data.length > 0 && (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {albums.data.map((album) => {
            const cover = album.cover ? coverOf(album.cover) : undefined;
            return (
              <Link key={album.id} to={`/albums/${album.id}`} className="group card overflow-hidden p-4 transition hover:-translate-y-1">
                <div className="polaroid transition group-hover:-rotate-1">
                  <div className="aspect-[4/3] overflow-hidden bg-blush/50">
                    {cover ? (
                      <SignedMedia path={cover.storage_path} mediaType={cover.media_type} alt={album.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-rose">
                        <BrandIcon className="text-4xl" aria-hidden="true" />
                      </div>
                    )}
                  </div>
                </div>
                <div className="px-2 pb-2 pt-4">
                  <h2 className="font-heading text-2xl font-semibold">{album.name}</h2>
                  <p className="handwritten text-lg text-mocha">
                    {album.count} {album.count === 1 ? 'memory' : 'memories'}{album.description ? ` · ${album.description}` : ''}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

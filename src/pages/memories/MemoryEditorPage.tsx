import { useEffect, useRef, useState, type DragEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft,
  faChevronDown,
  faChevronUp,
  faCircleNotch,
  faCheck,
  faCloudArrowUp,
  faImage,
  faStar,
  faTriangleExclamation,
  faVideo,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useRelationship } from '../../hooks/useRelationship';
import { addMemoryFiles, createMemory, getMemory, updateMemory } from '../../services/memories';
import { memorySchema, type MemoryFormValues, ACCEPTED_FILE_TYPES, validateFile, getMediaType, resolveMime } from '../../schemas/memory';
import { MEMORY_CATEGORIES, type MediaType } from '../../types';
import { errorMessage, todayIso } from '../../lib/format';
import { SignedMedia } from '../../components/memories/SignedMedia';

interface PendingFile {
  id: string;
  file: File;
  previewUrl: string;
  mediaType: MediaType;
  status: 'ready' | 'uploading' | 'done' | 'failed';
}

const DEFAULT_VALUES: MemoryFormValues = {
  title: '',
  description: '',
  memory_date: todayIso(),
  memory_time: '',
  location: '',
  category: 'Everyday Moments',
  mood: '',
  is_favorite: false,
};

/** Local key for a selected file. Works even where crypto.randomUUID is unavailable. */
function makeLocalId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Copies a picked photo into memory. On many phones (Android Chrome especially) the File handed over by the
 * picker is only a handle to the gallery; it can go stale as soon as the input is reset or the picker closes,
 * which leaves a broken preview and a failed upload. A copy held in memory stays readable.
 */
async function snapshotFile(file: File): Promise<File> {
  if (getMediaType(file) !== 'image') return file; // videos are too big to copy into memory
  const buffer = await file.arrayBuffer();
  return new File([buffer], file.name, { type: resolveMime(file), lastModified: file.lastModified });
}

function PendingPreview({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 text-mocha">
        <FontAwesomeIcon icon={faImage} className="text-3xl" aria-hidden="true" />
        <span className="text-xs">Preview unavailable</span>
      </div>
    );
  }
  return <img src={src} alt={`Preview of ${name}`} className="h-full w-full object-cover" onError={() => setFailed(true)} />;
}

export default function MemoryEditorPage() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const { data: relationship } = useRelationship();

  const existing = useQuery({
    queryKey: ['memory', id],
    enabled: isEdit,
    queryFn: () => getMemory(id!),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<MemoryFormValues>({ resolver: zodResolver(memorySchema), defaultValues: DEFAULT_VALUES });

  const [files, setFiles] = useState<PendingFile[]>([]);
  const [coverId, setCoverId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const filesRef = useRef<PendingFile[]>([]);
  filesRef.current = files;
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!existing.data) return;
    const m = existing.data;
    reset({
      title: m.title,
      description: m.description ?? '',
      memory_date: m.memory_date,
      memory_time: m.memory_time ? m.memory_time.slice(0, 5) : '',
      location: m.location ?? '',
      category: m.category as MemoryFormValues['category'],
      mood: m.mood ?? '',
      is_favorite: m.is_favorite,
    });
  }, [existing.data, reset]);

  useEffect(() => {
    return () => filesRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
  }, []);

  const addFiles = async (incoming: FileList | File[]) => {
    const picked = Array.from(incoming);
    const next: PendingFile[] = [];
    for (const original of picked) {
      const problem = validateFile(original);
      if (problem) {
        toast(problem, 'error');
        continue;
      }
      let file: File;
      try {
        file = await snapshotFile(original);
      } catch {
        toast(`${original.name} couldn't be read. Please pick it again.`, 'error');
        continue;
      }
      next.push({
        id: makeLocalId(),
        file,
        previewUrl: URL.createObjectURL(file),
        mediaType: getMediaType(file)!,
        status: 'ready',
      });
    }
    if (next.length === 0) return;
    setFiles((prev) => [...prev, ...next]);
    setCoverId((prev) => prev ?? next[0].id);
  };

  const removeFile = (fileId: string) => {
    const target = files.find((item) => item.id === fileId);
    if (target) URL.revokeObjectURL(target.previewUrl);
    const remaining = files.filter((item) => item.id !== fileId);
    setFiles(remaining);
    if (coverId === fileId) setCoverId(remaining[0]?.id ?? null);
  };

  const moveFile = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= files.length) return;
    const next = [...files];
    [next[index], next[target]] = [next[target], next[index]];
    setFiles(next);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length > 0) void addFiles(event.dataTransfer.files);
  };

  const save = useMutation({
    mutationFn: async (values: MemoryFormValues) => {
      if (isEdit) {
        await updateMemory(id!, values);
        const failed = files.length > 0
          ? await addMemoryFiles(
              id!,
              relationship!.id,
              user!.id,
              files.map((item) => ({ file: item.file, isCover: item.id === coverId })),
              existingMedia.length,
              (index, status) => setFiles((prev) => prev.map((item, i) => (i === index ? { ...item, status } : item))),
            )
          : [];
        return { memoryId: id!, failed };
      }
      return createMemory({
        relationshipId: relationship!.id,
        userId: user!.id,
        values,
        files: files.map((item) => ({ file: item.file, isCover: item.id === coverId })),
        onFileStatus: (index, status) =>
          setFiles((prev) => prev.map((item, i) => (i === index ? { ...item, status } : item))),
      });
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['memories'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      await queryClient.invalidateQueries({ queryKey: ['memory', result.memoryId] });
      if (result.failed.length > 0) {
        const details = result.failed.map((f) => `${f.name} (${f.reason})`).join('; ');
        toast(`Memory saved, but ${result.failed.length} file${result.failed.length === 1 ? '' : 's'} didn't upload: ${details}`, 'error');
      } else {
        toast(isEdit ? 'Memory updated.' : 'Memory saved to your scrapbook.');
      }
      navigate(`/memories/${result.memoryId}`, { replace: true });
    },
    onError: (error) => toast(errorMessage(error, 'Unable to save this memory.'), 'error'),
  });

  if (isEdit && existing.isLoading) return <p className="handwritten animate-pulse text-xl text-mocha">Opening your memory…</p>;
  if (isEdit && existing.error) return <p role="alert" className="text-sm">{errorMessage(existing.error)}</p>;

  const existingMedia = existing.data?.memory_media ?? [];
  const busy = isSubmitting || save.isPending;

  return (
    <div className="mx-auto max-w-3xl space-y-6 sm:space-y-8">
      <Link to={isEdit ? `/memories/${id}` : '/memories'} className="inline-flex items-center gap-2 text-sm font-medium text-mocha hover:text-espresso">
        <FontAwesomeIcon icon={faArrowLeft} /> {isEdit ? 'Back to memory' : 'Back to memories'}
      </Link>

      <header>
        <h1 className="font-heading text-4xl font-semibold">{isEdit ? 'Edit memory' : 'A new memory'}</h1>
        <p className="handwritten mt-1 text-xl text-mocha">Write down what you want to remember.</p>
      </header>

      <form onSubmit={handleSubmit((values) => save.mutate(values))} noValidate className="space-y-8">
        <fieldset className="grid gap-5 rounded-3xl bg-white p-6 md:p-8" disabled={busy}>
          <legend className="sr-only">Memory details</legend>

          <div>
            <label htmlFor="title" className="mb-1.5 block text-sm font-medium">Title</label>
            <input id="title" className="input" aria-invalid={!!errors.title} aria-describedby={errors.title ? 'title-error' : undefined} {...register('title')} />
            {errors.title && <p id="title-error" className="mt-1.5 text-sm text-espresso">{errors.title.message}</p>}
          </div>

          <div>
            <label htmlFor="description" className="mb-1.5 block text-sm font-medium">The story</label>
            <textarea id="description" rows={5} className="input resize-y" {...register('description')} />
            {errors.description && <p className="mt-1.5 text-sm text-espresso">{errors.description.message}</p>}
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label htmlFor="memory_date" className="mb-1.5 block text-sm font-medium">Date</label>
              <input id="memory_date" type="date" className="input" aria-invalid={!!errors.memory_date} {...register('memory_date')} />
              {errors.memory_date && <p className="mt-1.5 text-sm text-espresso">{errors.memory_date.message}</p>}
            </div>
            <div>
              <label htmlFor="memory_time" className="mb-1.5 block text-sm font-medium">Time (optional)</label>
              <input id="memory_time" type="time" className="input" {...register('memory_time')} />
            </div>
            <div>
              <label htmlFor="location" className="mb-1.5 block text-sm font-medium">Location</label>
              <input id="location" placeholder="Where were you?" className="input" {...register('location')} />
            </div>
            <div>
              <label htmlFor="category" className="mb-1.5 block text-sm font-medium">Category</label>
              <select id="category" className="input" {...register('category')}>
                {MEMORY_CATEGORIES.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label htmlFor="mood" className="mb-1.5 block text-sm font-medium">Mood (optional)</label>
              <input id="mood" placeholder="Cozy, giggly, nostalgic…" className="input" {...register('mood')} />
            </div>
          </div>

          <label className="flex items-center gap-3 text-sm font-medium">
            <input type="checkbox" className="h-4 w-4 accent-[#4D0909]" {...register('is_favorite')} />
            Mark as a favorite
          </label>
        </fieldset>

        <section aria-labelledby="photos-heading" className="space-y-4">
          <h2 id="photos-heading" className="font-heading text-2xl font-semibold">Photos &amp; videos</h2>

          {isEdit && existingMedia.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
                {existingMedia.map((media) => (
                  <div key={media.id} className="polaroid">
                    <div className="aspect-square overflow-hidden bg-blush">
                      <SignedMedia path={media.storage_path} mediaType={media.media_type} alt={media.original_filename} className="h-full w-full object-cover" />
                    </div>
                  </div>
                ))}
              </div>
          ) : null}
          {isEdit && existingMedia.length === 0 && files.length === 0 && (
            <p className="text-sm text-mocha">This memory has no photos yet. Add some below.</p>
          )}
          <>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                className={`rounded-3xl border-2 border-dashed p-5 text-center sm:p-8 transition ${dragging ? 'border-mocha bg-blush' : 'border-cocoa/50 bg-white'}`}
              >
                <FontAwesomeIcon icon={faCloudArrowUp} className="text-3xl text-rose" aria-hidden="true" />
                <p className="mt-3 font-medium">Drag photos or videos here</p>
                <p className="mt-1 text-sm text-mocha">JPG, PNG, MP4 or MOV. Photos up to 20 MB, videos up to 500 MB.</p>
                <button type="button" className="btn-ghost mt-4 w-full max-w-xs sm:w-auto" onClick={() => inputRef.current?.click()} disabled={busy}>
                  Choose files
                </button>
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  accept={ACCEPTED_FILE_TYPES}
                  className="sr-only"
                  aria-label="Choose photos or videos"
                  onChange={(e) => {
                    const input = e.target;
                    const picked: File[] = input.files ? Array.from(input.files) : [];
                    // Only reset the input once the files have been copied; resetting earlier can invalidate them on phones.
                    void addFiles(picked).finally(() => {
                      input.value = '';
                    });
                  }}
                />
              </div>

              {files.length > 0 && (
                <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4" aria-label="Selected files">
                  {files.map((item, index) => (
                    <li key={item.id} className="polaroid relative min-w-0 !p-2 !pb-3 sm:!p-3 sm:!pb-5">
                      <div className="aspect-square overflow-hidden bg-blush">
                        {item.mediaType === 'image' ? (
                          <PendingPreview src={item.previewUrl} name={item.file.name} />
                        ) : (
                          <div className="flex h-full items-center justify-center text-mocha">
                            <FontAwesomeIcon icon={faVideo} className="text-3xl" aria-label="Video" />
                          </div>
                        )}
                      </div>
                      <p className="mt-2 truncate text-xs text-mocha" title={item.file.name}>{item.file.name}</p>

                      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-1 gap-y-1.5">
                        <button
                          type="button"
                          onClick={() => setCoverId(item.id)}
                          aria-pressed={coverId === item.id}
                          className={`inline-flex min-h-10 items-center rounded-full px-3 py-1 text-xs sm:min-h-0 sm:px-2 ${coverId === item.id ? 'bg-mocha text-white' : 'text-mocha hover:bg-blush'}`}
                        >
                          <FontAwesomeIcon icon={faStar} className="mr-1" />
                          {coverId === item.id ? 'Cover' : 'Set cover'}
                        </button>
                        <div className="flex items-center">
                          <button type="button" onClick={() => moveFile(index, -1)} aria-label={`Move ${item.file.name} earlier`} className="flex h-10 w-10 items-center justify-center text-mocha hover:text-espresso sm:h-8 sm:w-8" disabled={busy}>
                            <FontAwesomeIcon icon={faChevronUp} />
                          </button>
                          <button type="button" onClick={() => moveFile(index, 1)} aria-label={`Move ${item.file.name} later`} className="flex h-10 w-10 items-center justify-center text-mocha hover:text-espresso sm:h-8 sm:w-8" disabled={busy}>
                            <FontAwesomeIcon icon={faChevronDown} />
                          </button>
                          <button type="button" onClick={() => removeFile(item.id)} aria-label={`Remove ${item.file.name}`} className="flex h-10 w-10 items-center justify-center text-mocha hover:text-espresso sm:h-8 sm:w-8" disabled={busy}>
                            <FontAwesomeIcon icon={faXmark} />
                          </button>
                        </div>
                      </div>

                      {item.status !== 'ready' && (
                        <p className="mt-2 flex items-center gap-1.5 text-xs text-espresso" role="status">
                          <FontAwesomeIcon
                            icon={item.status === 'uploading' ? faCircleNotch : item.status === 'done' ? faCheck : faTriangleExclamation}
                            spin={item.status === 'uploading'}
                          />
                          {item.status === 'uploading' ? 'Uploading…' : item.status === 'done' ? 'Uploaded' : 'Upload failed'}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
          </>
        </section>

        <div className="flex flex-col-reverse gap-3 pb-4 sm:flex-row sm:justify-end sm:pb-0 [&>button]:w-full sm:[&>button]:w-auto">
          <button type="button" className="btn-ghost" onClick={() => navigate(-1)} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            <FontAwesomeIcon icon={faImage} />
            {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Save memory'}
          </button>
        </div>
      </form>
    </div>
  );
}

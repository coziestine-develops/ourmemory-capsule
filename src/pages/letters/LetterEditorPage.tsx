import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faFeather } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useRelationship } from '../../hooks/useRelationship';
import { createLetter, getLetter, updateLetter, type LetterValues } from '../../services/letters';
import { errorMessage } from '../../lib/format';
import { LETTER_CATEGORIES, LETTER_TEMPLATES } from '../../types';

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function LetterEditorPage() {
  const { id } = useParams();
  const isEdit = !!id;
  const { user } = useAuth();
  const { data: relationship } = useRelationship();
  const relationshipId = relationship?.id ?? '';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const existing = useQuery({ queryKey: ['letter', id], enabled: isEdit, queryFn: () => getLetter(id!) });

  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<LetterValues & { open_local: string }>({
    defaultValues: { title: '', recipient: '', content: '', category: 'Love Letters', open_at: null, open_local: '' },
  });

  useEffect(() => {
    if (existing.data) {
      reset({
        title: existing.data.title,
        recipient: existing.data.recipient ?? '',
        content: existing.data.content,
        category: existing.data.category,
        open_at: existing.data.open_at,
        open_local: toLocalInput(existing.data.open_at),
      });
    }
  }, [existing.data, reset]);

  const openLocal = watch('open_local');

  const save = async (values: LetterValues & { open_local: string }) => {
    const openAt = values.open_local ? new Date(values.open_local).toISOString() : null;
    if (openAt && new Date(openAt).getTime() <= Date.now()) {
      toast('Choose a date in the future to seal this letter.', 'error');
      return;
    }
    const payload: LetterValues = {
      title: values.title,
      recipient: values.recipient,
      content: values.content,
      category: values.category,
      open_at: openAt,
    };
    try {
      if (isEdit) {
        await updateLetter(id!, payload);
        await queryClient.invalidateQueries({ queryKey: ['letter', id] });
        toast('Letter saved.');
        navigate(`/letters/${id}`, { replace: true });
      } else {
        const newId = await createLetter(relationshipId, user!.id, payload);
        await queryClient.invalidateQueries({ queryKey: ['letters'] });
        toast(openAt ? 'Letter sealed. It will open on its day.' : 'Letter saved.');
        navigate(`/letters/${newId}`, { replace: true });
      }
    } catch (e) {
      toast(errorMessage(e, 'Unable to save this letter.'), 'error');
    }
  };

  const mutation = useMutation({ mutationFn: save });

  return (
    <div className="mx-auto max-w-3xl space-y-6 sm:space-y-8">
      <Link to={isEdit ? `/letters/${id}` : '/letters'} className="inline-flex items-center gap-2 text-sm font-medium text-mocha hover:text-espresso">
        <FontAwesomeIcon icon={faArrowLeft} /> Back
      </Link>

      <header>
        <h1 className="font-heading text-3xl font-semibold break-words sm:text-4xl md:text-5xl">{isEdit ? 'Edit letter' : 'Write a letter'}</h1>
        <p className="handwritten mt-2 text-2xl text-mocha">Say the thing you'd say across a table.</p>
      </header>

      {!isEdit && (
        <section aria-labelledby="templates-heading" className="space-y-3">
          <h2 id="templates-heading" className="text-sm font-medium text-mocha">Start from a template</h2>
          <div className="flex flex-wrap gap-2">
            {LETTER_TEMPLATES.map((t) => (
              <button
                key={t.title}
                type="button"
                className="chip"
                onClick={() => {
                  setValue('title', t.title);
                  setValue('category', t.category);
                }}
              >
                <FontAwesomeIcon icon={faFeather} className="text-rose" /> {t.title}
              </button>
            ))}
          </div>
        </section>
      )}

      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} noValidate className="card space-y-6 p-6 md:p-10">
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label htmlFor="title" className="label">Title</label>
            <input id="title" className="input" aria-invalid={!!errors.title} {...register('title', { required: 'Give your letter a title.', maxLength: { value: 120, message: 'Keep the title under 120 characters.' } })} />
            {errors.title && <p className="mt-1.5 text-sm text-espresso">{errors.title.message}</p>}
          </div>
          <div>
            <label htmlFor="category" className="label">Category</label>
            <select id="category" className="input" {...register('category')}>
              {LETTER_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="recipient" className="label">To (optional)</label>
            <input id="recipient" className="input" placeholder="My love" {...register('recipient')} />
          </div>
          <div>
            <label htmlFor="open_local" className="label">Open on (optional)</label>
            <input id="open_local" type="datetime-local" className="input" {...register('open_local')} />
            <p className="mt-1.5 text-xs text-cocoa">
              {openLocal ? 'Your lover will only see this letter after that date.' : 'Leave empty to share it right away.'}
            </p>
          </div>
        </div>

        <div>
          <label htmlFor="content" className="label">Your letter</label>
          <textarea
            id="content"
            rows={12}
            className="input handwritten resize-y text-2xl leading-relaxed"
            aria-invalid={!!errors.content}
            {...register('content', { required: 'Write something from your heart.', maxLength: { value: 20000, message: 'This letter is a little too long.' } })}
          />
          {errors.content && <p className="mt-1.5 text-sm text-espresso">{errors.content.message}</p>}
        </div>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" className="btn-ghost" onClick={() => navigate(-1)} disabled={isSubmitting}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : openLocal ? 'Seal letter' : 'Save letter'}
          </button>
        </div>
      </form>
    </div>
  );
}

import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faLock, faPen, faTrashCan, faLockOpen } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { deleteLetter, getLetter } from '../../services/letters';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { Countdown } from '../../components/common/Countdown';
import { errorMessage, formatDate } from '../../lib/format';

export default function LetterDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);

  const letter = useQuery({ queryKey: ['letter', id], queryFn: () => getLetter(id), enabled: !!id });

  const remove = useMutation({
    mutationFn: () => deleteLetter(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['letters'] });
      toast('Letter deleted.');
      navigate('/letters', { replace: true });
    },
    onError: (e) => toast(errorMessage(e), 'error'),
  });

  if (letter.error) return <p role="alert" className="text-sm">{errorMessage(letter.error)}</p>;
  if (!letter.data) return <p className="handwritten animate-pulse text-2xl text-mocha">Unfolding your letter…</p>;

  const data = letter.data;
  const mine = data.created_by === user?.id;
  const sealed = !!data.open_at && new Date(data.open_at).getTime() > Date.now();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <Link to="/letters" className="inline-flex items-center gap-2 text-sm font-medium text-mocha hover:text-espresso">
          <FontAwesomeIcon icon={faArrowLeft} /> All letters
        </Link>
        {mine && (
          <div className="flex gap-2">
            <Link to={`/letters/${id}/edit`} className="btn-ghost px-3" aria-label="Edit letter"><FontAwesomeIcon icon={faPen} /></Link>
            <button type="button" className="btn-ghost px-3" aria-label="Delete letter" onClick={() => setConfirming(true)}><FontAwesomeIcon icon={faTrashCan} /></button>
          </div>
        )}
      </div>

      <article className="relative overflow-hidden rounded-[2rem] border border-white bg-[#FFFCF6] p-5 shadow-romantic sm:p-8 md:p-14">
        <div className="absolute inset-x-0 top-0 h-2 bg-gradient-to-r from-blush via-rose to-blush" aria-hidden="true" />
        <p className="handwritten text-xl text-rose">{data.category}</p>
        <h1 className="handwritten mt-2 text-4xl leading-tight text-espresso sm:text-5xl md:text-6xl">{data.title}</h1>
        <p className="mt-3 text-sm text-cocoa">
          {data.recipient ? `For ${data.recipient} · ` : ''}Written {formatDate(data.created_at, { month: 'long', day: 'numeric', year: 'numeric' })}
        </p>

        {sealed ? (
          <div className="mt-10 flex flex-col items-center rounded-3xl bg-blush/40 p-10 text-center">
            <FontAwesomeIcon icon={faLock} className="text-3xl text-rose" aria-hidden="true" />
            <p className="mt-4 font-heading text-2xl">Sealed until {formatDate(data.open_at!, { month: 'long', day: 'numeric', year: 'numeric' })}</p>
            <p className="handwritten mt-2 text-xl text-mocha">Only you can read this for now. It opens in <Countdown target={data.open_at!} /></p>
            <p className="mt-5 text-sm text-mocha">Your letter</p>
            <p className="handwritten mt-2 max-w-prose whitespace-pre-wrap text-left text-xl leading-relaxed sm:text-2xl text-espresso">{data.content}</p>
          </div>
        ) : (
          <>
            {data.open_at && (
              <p className="mt-6 flex items-center gap-2 text-sm text-mocha">
                <FontAwesomeIcon icon={faLockOpen} className="text-rose" aria-hidden="true" />
                Opened on {formatDate(data.open_at, { month: 'long', day: 'numeric', year: 'numeric' })}
              </p>
            )}
            <div className="handwritten mt-8 whitespace-pre-wrap text-2xl leading-relaxed text-espresso md:text-[1.7rem]">{data.content}</div>
          </>
        )}
      </article>

      <ConfirmDialog
        open={confirming}
        title="Delete this letter?"
        message="This letter will be gone for good, including any date it was sealed for."
        confirmLabel="Delete letter"
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}

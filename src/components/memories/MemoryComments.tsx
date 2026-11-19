import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPaperPlane, faTrashCan } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useTableRealtime } from '../../hooks/useTableRealtime';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { addMemoryComment, deleteMemoryComment, listMemoryComments } from '../../services/memoryInteractions';
import { errorMessage, formatDate } from '../../lib/format';
import type { MemoryComment } from '../../types';

export const COMMENT_MAX_LENGTH = 1000;

export function MemoryComments({ memoryId }: { memoryId: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const queryKey = ['memory-comments', memoryId];
  const [body, setBody] = useState('');
  const [pendingDelete, setPendingDelete] = useState<MemoryComment | null>(null);

  const comments = useQuery({
    queryKey,
    queryFn: () => listMemoryComments(memoryId),
  });
  useTableRealtime('memory_comments', `memory_id=eq.${memoryId}`, queryKey);

  const add = useMutation({
    mutationFn: () => addMemoryComment(memoryId, user!.id, body),
    onSuccess: async () => {
      setBody('');
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => toast(errorMessage(error), 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteMemoryComment(id),
    onSuccess: async () => {
      setPendingDelete(null);
      await queryClient.invalidateQueries({ queryKey });
      toast('Comment deleted.');
    },
    onError: (error) => {
      setPendingDelete(null);
      toast(errorMessage(error), 'error');
    },
  });

  const canSend = body.trim().length > 0 && !add.isPending;

  return (
    <section aria-labelledby="comments-heading" className="space-y-4">
      <h2 id="comments-heading" className="font-heading text-2xl font-semibold">
        Comments {comments.data && comments.data.length > 0 && <span className="text-mocha">({comments.data.length})</span>}
      </h2>

      {comments.data && comments.data.length === 0 && (
        <p className="handwritten text-lg text-mocha">No comments yet. Say something sweet about this one.</p>
      )}

      {(comments.data ?? []).length > 0 && (
        <ul className="space-y-3">
          {comments.data!.map((comment) => {
            const mine = comment.author_id === user?.id;
            const name = comment.author?.display_name ?? (mine ? 'You' : 'Your lover');
            return (
              <li key={comment.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm">
                    <span className="font-semibold text-espresso">{name}</span>
                    <span className="ml-2 text-xs text-cocoa">
                      {formatDate(comment.created_at, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </p>
                  {mine && (
                    <button
                      type="button"
                      aria-label="Delete comment"
                      onClick={() => setPendingDelete(comment)}
                      className="-mr-2 -mt-1 rounded-full p-2 text-mocha hover:bg-blush/60"
                    >
                      <FontAwesomeIcon icon={faTrashCan} />
                    </button>
                  )}
                </div>
                <p className="mt-2 whitespace-pre-line break-words text-base leading-relaxed">{comment.body}</p>
              </li>
            );
          })}
        </ul>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSend) add.mutate();
        }}
        className="space-y-2"
      >
        <label htmlFor="comment-body" className="label">Leave a comment</label>
        <textarea
          id="comment-body"
          rows={3}
          maxLength={COMMENT_MAX_LENGTH}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="I still think about this day…"
          className="input resize-y"
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-cocoa">{body.length}/{COMMENT_MAX_LENGTH}</span>
          <button type="submit" className="btn-primary" disabled={!canSend}>
            <FontAwesomeIcon icon={faPaperPlane} /> {add.isPending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </form>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this comment?"
        message="It will be removed for both of you. This can't be undone."
        confirmLabel="Delete comment"
        busy={remove.isPending}
        onConfirm={() => pendingDelete && remove.mutate(pendingDelete.id)}
        onCancel={() => setPendingDelete(null)}
      />
    </section>
  );
}

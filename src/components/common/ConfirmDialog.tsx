import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, message, confirmLabel, busy = false, onConfirm, onCancel }: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-espresso/40 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => !busy && onCancel()}
        >
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-description"
            className="w-full max-w-sm rounded-3xl bg-ivory p-6 shadow-polaroid"
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 12, opacity: 0 }}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="confirm-title" className="font-heading text-2xl font-semibold">
              {title}
            </h2>
            <p id="confirm-description" className="mt-2 text-sm text-mocha">
              {message}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" className="btn-ghost" onClick={onCancel} disabled={busy}>
                Keep it
              </button>
              <button type="button" className="btn-danger" onClick={onConfirm} disabled={busy}>
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowRightFromBracket, faBell, faCamera, faCheck, faDownload, faRightFromBracket, faTrashCan, faUser, faLock } from '@fortawesome/free-solid-svg-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useRelationship } from '../../hooks/useRelationship';
import { updateDisplayName, updateRelationship, leaveRelationship } from '../../services/relationships';
import { setUsername, describeLoverError } from '../../services/loverRequests';
import { clearNotifications } from '../../services/notifications';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { PageHeader } from '../../components/common/PageHeader';
import { Avatar } from '../../components/common/Avatar';
import { AVATAR_ACCEPTED } from '../../services/profile';
import { useAvatarActions } from '../../hooks/useProfile';
import { errorMessage } from '../../lib/format';
import { listAllMemoriesForExport } from '../../services/memories';
import { buildMemoriesPdf, downloadMemoriesPdf } from '../../lib/exportMemories';
import { BrandIcon } from '../../components/common/BrandIcon';

function Section({ title, icon, children }: { title: string; icon?: typeof faUser; children: ReactNode }) {
  return (
    <section className="card space-y-5 p-6 md:p-8" aria-labelledby={`${title}-heading`}>
      <h2 id={`${title}-heading`} className="flex items-center gap-3 font-heading text-2xl font-semibold">
        {icon ? <FontAwesomeIcon icon={icon} className="text-rose" aria-hidden="true" /> : <BrandIcon className="text-rose" />} {title}
      </h2>
      {children}
    </section>
  );
}

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const { data: relationship } = useRelationship();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [name, setName] = useState((user?.user_metadata?.display_name as string | undefined) ?? '');
  const [username, setUsernameInput] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [relName, setRelName] = useState('');
  const [relStart, setRelStart] = useState('');
  const [confirmLeave, setConfirmLeave] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { profile, upload, remove, busy: avatarBusy } = useAvatarActions();

  useEffect(() => {
    if (profile?.username) setUsernameInput(profile.username);
  }, [profile?.username]);

  useEffect(() => {
    if (relationship) {
      setRelName(relationship.name);
      setRelStart(relationship.start_date ?? '');
    }
  }, [relationship]);

  const onError = (e: unknown) => toast(errorMessage(e), 'error');

  const saveProfile = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Enter the name you want to be called.');
      const nextUsername = username.trim().replace(/^@/, '').toLowerCase();
      if (!/^[a-z0-9_.]{3,30}$/.test(nextUsername)) throw new Error('Use 3 to 30 letters, numbers, dots, or underscores.');
      await updateDisplayName(user!.id, trimmed);
      const { error } = await supabase.auth.updateUser({ data: { display_name: trimmed } });
      if (error) throw error;
      if (nextUsername !== profile?.username) await setUsername(nextUsername);
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
    onSuccess: () => toast('Your profile is updated.'),
    onError: (e) => toast(describeLoverError(e), 'error'),
  });

  const savePassword = useMutation({
    mutationFn: async () => {
      if (password.length < 8) throw new Error('Use at least 8 characters.');
      if (password !== confirmPassword) throw new Error('Passwords do not match.');
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
    },
    onSuccess: () => {
      setPassword('');
      setConfirmPassword('');
      toast('Your password has been changed.');
    },
    onError,
  });

  const saveRelationship = useMutation({
    mutationFn: () => updateRelationship(relationship!.id, { name: relName, start_date: relStart || null }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['relationship'] });
      toast('Your space is updated.');
    },
    onError,
  });

  const clearAll = useMutation({
    mutationFn: () => clearNotifications(user!.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast('Notifications cleared.');
    },
    onError,
  });

  const exportData = useMutation({
    mutationFn: async () => {
      const memories = await listAllMemoriesForExport(relationship!.id);
      const doc = buildMemoriesPdf(memories, relationship!.name);
      const stamp = new Date().toLocaleDateString('en-CA');
      downloadMemoriesPdf(doc, `evermore-memories-${stamp}.pdf`);
      return memories.length;
    },
    onSuccess: (count) => toast(count === 1 ? 'Exported 1 memory.' : `Exported ${count} memories.`),
    onError,
  });

  const leave = useMutation({
    mutationFn: () => leaveRelationship(user!.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['relationship'] });
      toast('You have left the shared space.');
      navigate('/onboarding', { replace: true });
    },
    onError: (e) => {
      setConfirmLeave(false);
      onError(e);
    },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6 sm:space-y-8">
      <PageHeader title="Settings" subtitle="Make this space feel like yours" />

      <Section title="Your profile" icon={faUser}>
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
          <Avatar name={name || user?.email || 'You'} path={profile?.avatar_path} ring className="h-24 w-24 text-4xl" />
          <div className="text-center sm:text-left">
            <p className="label !mb-1">Profile photo</p>
            <p className="text-sm text-mocha">JPG or PNG. It is cropped to a square and shown in the sidebar and on your shared space.</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
              <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()} disabled={avatarBusy}>
                <FontAwesomeIcon icon={faCamera} /> {profile?.avatar_path ? 'Change photo' : 'Upload photo'}
              </button>
              {profile?.avatar_path && (
                <button type="button" className="btn-ghost" onClick={() => remove.mutate()} disabled={avatarBusy}>
                  <FontAwesomeIcon icon={faTrashCan} /> Remove
                </button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept={AVATAR_ACCEPTED.join(',')}
              className="hidden"
              onChange={(e) => {
                const input = e.target;
                const file = input.files?.[0];
                if (!file) return;
                // Copy the photo first: on phones the picked file can go stale once the input is reset.
                void file
                  .arrayBuffer()
                  .then((buf) => new File([buf], file.name, { type: file.type, lastModified: file.lastModified }))
                  .catch(() => file)
                  .then((copy) => upload.mutate(copy))
                  .finally(() => { input.value = ''; });
              }}
            />
          </div>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); saveProfile.mutate(); }} className="space-y-4">
          <div>
            <label htmlFor="display-name" className="label">Display name</label>
            <input id="display-name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} className="input" />
          </div>
          <div>
            <label htmlFor="username" className="label">Username</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-cocoa" aria-hidden="true">@</span>
              <input id="username" maxLength={30} autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => setUsernameInput(e.target.value)} className="input pl-9" />
            </div>
            <p className="mt-1.5 text-xs text-mocha">Your lover finds you by this username. Letters, numbers, dots, and underscores.</p>
          </div>
          <div>
            <p className="label">Email</p>
            <p className="rounded-2xl bg-blush/40 px-4 py-3 text-sm text-mocha">{user?.email}</p>
          </div>
          <button type="submit" className="btn-primary" disabled={saveProfile.isPending}><FontAwesomeIcon icon={faCheck} /> Save profile</button>
        </form>
      </Section>

      <Section title="Password" icon={faLock}>
        <form onSubmit={(e) => { e.preventDefault(); savePassword.mutate(); }} className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="new-pw" className="label">New password</label>
            <input id="new-pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="input" />
          </div>
          <div>
            <label htmlFor="confirm-pw" className="label">Confirm password</label>
            <input id="confirm-pw" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="input" />
          </div>
          <div className="sm:col-span-2">
            <button type="submit" className="btn-primary" disabled={savePassword.isPending || !password}>Change password</button>
          </div>
        </form>
      </Section>

      {relationship && (
        <Section title="Your shared space">
          <form onSubmit={(e) => { e.preventDefault(); saveRelationship.mutate(); }} className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="rel-name" className="label">Space name</label>
              <input id="rel-name" required maxLength={80} value={relName} onChange={(e) => setRelName(e.target.value)} className="input" />
            </div>
            <div>
              <label htmlFor="rel-start" className="label">Start date</label>
              <input id="rel-start" type="date" value={relStart} onChange={(e) => setRelStart(e.target.value)} className="input" />
            </div>
            <div className="sm:col-span-2">
              <button type="submit" className="btn-primary" disabled={saveRelationship.isPending}>Save space</button>
            </div>
          </form>
        </Section>
      )}

      {relationship && (
        <Section title="Your data" icon={faDownload}>
          <p className="text-sm text-mocha">Download a copy of your memories as a PDF: titles, descriptions, dates, locations, moods, and favorites. Photos and videos are not included.</p>
          <button type="button" className="btn-ghost" onClick={() => exportData.mutate()} disabled={exportData.isPending}>
            <FontAwesomeIcon icon={faDownload} /> {exportData.isPending ? 'Preparing…' : 'Export memories as PDF'}
          </button>
        </Section>
      )}

      <Section title="Notifications" icon={faBell}>
        <p className="text-sm text-mocha">Clear your notification history. New activity from your lover will still appear.</p>
        <button type="button" className="btn-ghost" onClick={() => clearAll.mutate()} disabled={clearAll.isPending}>
          <FontAwesomeIcon icon={faTrashCan} /> Clear notifications
        </button>
      </Section>

      <Section title="Account" icon={faRightFromBracket}>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button type="button" className="btn-ghost" onClick={async () => { await signOut(); navigate('/login', { replace: true }); }}>
            <FontAwesomeIcon icon={faArrowRightFromBracket} /> Sign out
          </button>
          {relationship && (
            <button type="button" className="btn-danger" onClick={() => setConfirmLeave(true)}>
              Leave shared space
            </button>
          )}
        </div>
      </Section>

      <ConfirmDialog
        open={confirmLeave}
        title="Leave this shared space?"
        message="You will lose access to its memories, albums, letters, and capsules. Your lover keeps theirs. This can't be undone."
        confirmLabel="Leave space"
        busy={leave.isPending}
        onConfirm={() => leave.mutate()}
        onCancel={() => setConfirmLeave(false)}
      />
    </div>
  );
}

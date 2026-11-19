import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useRelationship } from '../../hooks/useRelationship';
import { useProfile } from '../../hooks/useProfile';
import { createRelationship, describeRelationshipError, updateDisplayName } from '../../services/relationships';
import { setUsername, describeLoverError } from '../../services/loverRequests';
import { todayIso } from '../../lib/format';
import { AddLoverPanel } from '../../components/relationship/AddLoverPanel';
import { IncomingLoverRequests } from '../../components/relationship/IncomingLoverRequests';

const usernamePattern = /^[a-z0-9_.]{3,30}$/;

const profileSchema = z.object({
  display_name: z.string().trim().min(1, 'Enter the name you want to be called.').max(60),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(usernamePattern, 'Use 3 to 30 letters, numbers, dots, or underscores.'),
});

const spaceSchema = z.object({
  name: z.string().trim().min(1, 'Give your space a name.').max(80),
  start_date: z.string().min(1, 'Choose the day your story began.'),
});

type Step = 'profile' | 'space' | 'lover';

export function OnboardingPage() {
  const { user } = useAuth();
  const { data: relationship, isLoading } = useRelationship();
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>('profile');
  const [relationshipId, setRelationshipId] = useState<string | null>(null);

  const profileForm = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      display_name: (user?.user_metadata?.display_name as string | undefined) ?? '',
      username: '',
    },
  });

  // Prefill the username for people who already have one (for example, after a migration).
  useEffect(() => {
    if (profile?.username && !profileForm.getValues('username')) {
      profileForm.setValue('username', profile.username);
    }
  }, [profile?.username]);

  const spaceForm = useForm<z.infer<typeof spaceSchema>>({
    resolver: zodResolver(spaceSchema),
    defaultValues: { name: '', start_date: todayIso() },
  });

  const saveProfile = useMutation({
    mutationFn: async (values: z.infer<typeof profileSchema>) => {
      await updateDisplayName(user!.id, values.display_name);
      if (values.username !== profile?.username) await setUsername(values.username);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['profile'] });
      setStep('space');
    },
    onError: (error) => toast(describeLoverError(error), 'error'),
  });

  const saveSpace = useMutation({
    mutationFn: (values: z.infer<typeof spaceSchema>) => createRelationship(values.name, values.start_date),
    onSuccess: async (id) => {
      setRelationshipId(id);
      await queryClient.invalidateQueries({ queryKey: ['relationship'] });
      setStep('lover');
    },
    onError: (error) => toast(describeRelationshipError(error), 'error'),
  });

  if (isLoading) return null;
  if (relationship) return <Navigate to="/" replace />;

  const stepNumber = step === 'profile' ? 1 : step === 'space' ? 2 : 3;

  return (
    <div className="mx-auto w-full max-w-xl space-y-6 px-1 py-4 sm:py-8 md:py-12">
      <IncomingLoverRequests />

      <div>
        <p className="handwritten text-lg text-mocha sm:text-xl">Step {stepNumber} of 3</p>

        {step === 'profile' && (
          <section className="mt-2">
            <h1 className="font-heading text-3xl font-semibold leading-tight [overflow-wrap:anywhere] sm:text-4xl">Welcome to Memory Capsule.</h1>
            <p className="mt-2 text-sm text-mocha sm:text-base">Let's create a little space for all the moments that matter. First, what should we call you, and what username should your lover search for?</p>
            <form onSubmit={profileForm.handleSubmit((v) => saveProfile.mutate(v))} noValidate className="mt-6 w-full space-y-5 sm:mt-8">
              <div className="min-w-0">
                <label htmlFor="display_name" className="mb-1.5 block text-sm font-medium">Display name</label>
                <input id="display_name" className="input" aria-invalid={!!profileForm.formState.errors.display_name} {...profileForm.register('display_name')} />
                {profileForm.formState.errors.display_name && (
                  <p className="mt-1.5 text-sm text-espresso">{profileForm.formState.errors.display_name.message}</p>
                )}
              </div>
              <div className="min-w-0">
                <label htmlFor="username" className="mb-1.5 block text-sm font-medium">Username</label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-cocoa" aria-hidden="true">@</span>
                  <input
                    id="username"
                    className="input pl-9"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    maxLength={30}
                    aria-invalid={!!profileForm.formState.errors.username}
                    {...profileForm.register('username')}
                  />
                </div>
                <p className="mt-1.5 text-xs text-mocha">Your lover finds you by this. Letters, numbers, dots, and underscores.</p>
                {profileForm.formState.errors.username && (
                  <p className="mt-1.5 text-sm text-espresso">{profileForm.formState.errors.username.message}</p>
                )}
              </div>
              <button type="submit" className="btn-primary w-full sm:w-auto" disabled={saveProfile.isPending}>
                {saveProfile.isPending ? 'Saving…' : 'Continue'}
              </button>
            </form>
          </section>
        )}

        {step === 'space' && (
          <section className="mt-2">
            <h1 className="font-heading text-3xl font-semibold leading-tight [overflow-wrap:anywhere] sm:text-4xl">Name your space.</h1>
            <p className="mt-2 text-sm text-mocha sm:text-base">Pick a name and the day your story began. The day count starts from there.</p>
            <form onSubmit={spaceForm.handleSubmit((v) => saveSpace.mutate(v))} noValidate className="mt-6 w-full space-y-5 sm:mt-8">
              <div className="min-w-0">
                <label htmlFor="space_name" className="mb-1.5 block text-sm font-medium">Space name</label>
                <input id="space_name" placeholder="Sam & Alex" className="input" aria-invalid={!!spaceForm.formState.errors.name} {...spaceForm.register('name')} />
                {spaceForm.formState.errors.name && <p className="mt-1.5 text-sm text-espresso">{spaceForm.formState.errors.name.message}</p>}
              </div>
              <div className="min-w-0">
                <label htmlFor="start_date" className="mb-1.5 block text-sm font-medium">Relationship start date</label>
                <input id="start_date" type="date" className="input min-w-0 max-w-full" aria-invalid={!!spaceForm.formState.errors.start_date} {...spaceForm.register('start_date')} />
                {spaceForm.formState.errors.start_date && <p className="mt-1.5 text-sm text-espresso">{spaceForm.formState.errors.start_date.message}</p>}
              </div>
              <button type="submit" className="btn-primary w-full sm:w-auto" disabled={saveSpace.isPending}>
                {saveSpace.isPending ? 'Creating…' : 'Create our space'}
              </button>
            </form>
          </section>
        )}

        {step === 'lover' && relationshipId && (
          <section className="mt-2 w-full space-y-6">
            <h1 className="font-heading text-3xl font-semibold leading-tight [overflow-wrap:anywhere] sm:text-4xl">Your little memory space is ready.</h1>
            <p className="text-sm text-mocha sm:text-base">Add your lover now by username, or do it later from the dashboard.</p>
            <AddLoverPanel />
            <button type="button" className="btn-primary w-full sm:w-auto" onClick={() => navigate('/', { replace: true })}>
              Go to the dashboard
            </button>
          </section>
        )}
      </div>
    </div>
  );
}

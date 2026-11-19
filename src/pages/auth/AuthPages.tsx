import { forwardRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faArrowRight,
  faCircleExclamation,
  faEnvelope,
  faEye,
  faEyeSlash,
  faLock,
  faUser,
} from '@fortawesome/free-solid-svg-icons';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { errorMessage } from '../../lib/format';
import { ACCESS_DENIED_MESSAGE, isAllowedEmail } from '../../lib/access';
import { Logo } from '../../components/common/Logo';
import { BrandIcon } from '../../components/common/BrandIcon';

const email = z.string().trim().email('Enter a valid email address.');
const password = z.string().min(8, 'Use at least 8 characters.');

const loginSchema = z.object({ email, password: z.string().min(1, 'Enter your password.') });

const signUpSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter your name.').max(60),
    email,
    password,
    confirm: z.string(),
  })
  .refine((values) => values.password === values.confirm, {
    message: 'Passwords do not match.',
    path: ['confirm'],
  });

const emailOnlySchema = z.object({ email });

const newPasswordSchema = z
  .object({ password, confirm: z.string() })
  .refine((values) => values.password === values.confirm, {
    message: 'Passwords do not match.',
    path: ['confirm'],
  });


export function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return "That email and password don't match. Try again.";
  if (m.includes('email not confirmed')) return 'Please verify your email first. Check your inbox for the link.';
  if (m.includes('too many') || m.includes('rate limit')) return 'Too many attempts. Wait a minute and try again.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'An account with this email already exists. Try signing in.';
  if (m.includes('failed to fetch') || m.includes('network')) return "Can't reach the server. Check your internet connection and try again.";
  if (m.includes('email_not_allowed')) return ACCESS_DENIED_MESSAGE;
  return message;
}

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  icon?: IconDefinition;
  trailing?: ReactNode;
};

const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, error, id, name, icon, trailing, ...rest }, ref) => {
    const inputId = id ?? name ?? label;
    return (
      <div>
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-espresso">
          {label}
        </label>
        <div className="relative">
          {icon && (
            <FontAwesomeIcon
              icon={icon}
              aria-hidden="true"
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-cocoa"
            />
          )}
          <input
            ref={ref}
            id={inputId}
            name={name}
            aria-invalid={!!error}
            aria-describedby={error ? `${inputId}-error` : undefined}
            className={`input ${icon ? 'pl-11' : ''} ${trailing ? 'pr-12' : ''}`}
            {...rest}
          />
          {trailing && <div className="absolute right-2 top-1/2 -translate-y-1/2">{trailing}</div>}
        </div>
        {error && (
          <p id={`${inputId}-error`} className="mt-1.5 flex items-center gap-1.5 text-sm text-espresso">
            <FontAwesomeIcon icon={faCircleExclamation} className="text-rose" aria-hidden="true" />
            {error}
          </p>
        )}
      </div>
    );
  },
);
TextField.displayName = 'TextField';

function PasswordToggle({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={visible ? 'Hide password' : 'Show password'}
      className="flex h-9 w-9 items-center justify-center rounded-full text-cocoa transition hover:bg-blush hover:text-espresso"
    >
      <FontAwesomeIcon icon={visible ? faEyeSlash : faEye} />
    </button>
  );
}

function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[1.1fr_1fr]">
      <aside className="hero-gradient relative hidden overflow-hidden md:flex md:flex-col md:gap-16 md:p-14">
        <BrandIcon aria-hidden="true" className="pointer-events-none absolute right-16 top-24 text-4xl text-rose/40" />
        <BrandIcon aria-hidden="true" className="pointer-events-none absolute bottom-32 left-14 text-2xl text-rose/30" />
        <BrandIcon aria-hidden="true" className="pointer-events-none absolute right-40 bottom-16 text-5xl text-rose/20" />

        <Logo />

        <div className="max-w-md">
          <h2 className="font-heading text-5xl font-semibold leading-tight">
            Every moment deserves a place to stay.
          </h2>
          <p className="handwritten mt-5 text-2xl text-mocha">A private space for the two of us.</p>
        </div>
        
        <p className="mt-auto text-sm text-mocha">Only you and your lover can see what's in here.</p>
      </aside>

      <main className="flex min-h-dvh items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 flex justify-center md:hidden">
            <Logo align="center" />
          </div>
          <div className="card p-6 sm:p-8 md:p-10">
            <h1 className="font-heading text-3xl font-semibold">{title}</h1>
            {subtitle && <p className="mt-2 text-sm text-mocha">{subtitle}</p>}
            <div className="mt-7">{children}</div>
          </div>
        </div>
      </main>
    </div>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, beginEntrance, endEntrance, accessDenied, clearAccessDenied } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const from = (location.state as { from?: string } | null)?.from;
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });

  if (session) return <Navigate to={from ?? '/'} replace />;

  const onSubmit = async (values: z.infer<typeof loginSchema>) => {
    setFormError(null);
    clearAccessDenied();
    if (!isAllowedEmail(values.email)) {
      setFormError(ACCESS_DENIED_MESSAGE);
      return;
    }
    // Start the welcome loader before the session lands, so the dashboard never flashes first.
    beginEntrance();
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: values.email.trim(),
        password: values.password,
      });
      if (error) {
        endEntrance();
        setFormError(friendlyAuthError(error.message));
        return;
      }
      navigate(from ?? '/', { replace: true });
    } catch (err) {
      endEntrance();
      setFormError(friendlyAuthError(errorMessage(err)));
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your shared space.">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          icon={faEnvelope}
          placeholder="you@example.com"
          error={errors.email?.message}
          {...register('email')}
        />
        <TextField
          label="Password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          icon={faLock}
          error={errors.password?.message}
          trailing={<PasswordToggle visible={showPassword} onToggle={() => setShowPassword((v) => !v)} />}
          {...register('password')}
        />
        {(formError || accessDenied) && (
          <p role="alert" className="rounded-2xl bg-blush/60 px-4 py-3 text-sm text-espresso">{formError ?? ACCESS_DENIED_MESSAGE}</p>
        )}
        <button type="submit" className="btn-primary w-full py-3" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
          {!isSubmitting && <FontAwesomeIcon icon={faArrowRight} />}
        </button>
      </form>
      <div className="mt-7 flex flex-col gap-3 text-center text-sm text-mocha">
        <Link to="/forgot-password" className="underline-offset-4 hover:text-espresso hover:underline">
          Forgot your password?
        </Link>
        <p>
          New here?{' '}
          <Link to="/signup" className="font-semibold text-espresso underline-offset-4 hover:underline">
            Create your space
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}

export function SignUpPage() {
  const navigate = useNavigate();
  const { beginEntrance } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof signUpSchema>>({ resolver: zodResolver(signUpSchema) });

  const onSubmit = async (values: z.infer<typeof signUpSchema>) => {
    setFormError(null);
    if (!isAllowedEmail(values.email)) {
      setFormError(ACCESS_DENIED_MESSAGE);
      return;
    }
    try {
      const { data, error } = await supabase.auth.signUp({
        email: values.email.trim(),
        password: values.password,
        options: {
          data: { display_name: values.name.trim() },
          emailRedirectTo: `${window.location.origin}/login`,
        },
      });
      if (error) {
        setFormError(friendlyAuthError(error.message));
        return;
      }
      if (data.session) {
        beginEntrance();
        navigate('/onboarding', { replace: true });
      } else {
        setSentTo(values.email.trim());
      }
    } catch (err) {
      setFormError(friendlyAuthError(errorMessage(err)));
    }
  };

  if (sentTo) {
    return (
      <AuthShell title="Check your inbox" subtitle={`We sent a verification link to ${sentTo}.`}>
        <p className="text-sm text-mocha">Open the link to verify your email. Then sign in to set up your space.</p>
        <Link to="/login" className="btn-primary mt-7 w-full py-3">Go to sign in</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Create your account" subtitle="Start a little space for the moments that matter.">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        <TextField label="Your name" autoComplete="given-name" icon={faUser} error={errors.name?.message} {...register('name')} />
        <TextField label="Email" type="email" autoComplete="email" icon={faEnvelope} error={errors.email?.message} {...register('email')} />
        <TextField
          label="Password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          icon={faLock}
          error={errors.password?.message}
          trailing={<PasswordToggle visible={showPassword} onToggle={() => setShowPassword((v) => !v)} />}
          {...register('password')}
        />
        <TextField
          label="Confirm password"
          type={showConfirm ? 'text' : 'password'}
          autoComplete="new-password"
          icon={faLock}
          error={errors.confirm?.message}
          trailing={<PasswordToggle visible={showConfirm} onToggle={() => setShowConfirm((v) => !v)} />}
          {...register('confirm')}
        />
        {formError && <p role="alert" className="text-sm text-espresso">{formError}</p>}
        <button type="submit" className="btn-primary w-full py-3" disabled={isSubmitting}>
          {isSubmitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="mt-7 text-center text-sm text-mocha">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-espresso underline-offset-4 hover:underline">Sign in</Link>
      </p>
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const { toast } = useToast();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof emailOnlySchema>>({ resolver: zodResolver(emailOnlySchema) });

  const onSubmit = async (values: z.infer<typeof emailOnlySchema>) => {
    if (!isAllowedEmail(values.email)) {
      toast(ACCESS_DENIED_MESSAGE, 'error');
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(values.email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      toast(errorMessage(error), 'error');
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <AuthShell title="Check your email" subtitle="If an account exists for that address, a reset link is on its way.">
        <Link to="/login" className="btn-primary w-full py-3">Back to sign in</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Reset your password" subtitle="We'll email you a link to choose a new one.">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        <TextField label="Email" type="email" autoComplete="email" icon={faEnvelope} error={errors.email?.message} {...register('email')} />
        <button type="submit" className="btn-primary w-full py-3" disabled={isSubmitting}>
          {isSubmitting ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
      <p className="mt-7 text-center text-sm text-mocha">
        <Link to="/login" className="underline-offset-4 hover:underline">Back to sign in</Link>
      </p>
    </AuthShell>
  );
}

export function ResetPasswordPage() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof newPasswordSchema>>({ resolver: zodResolver(newPasswordSchema) });

  if (loading) return null;

  if (!session) {
    return (
      <AuthShell title="This link has expired" subtitle="Reset links work once and expire after a short time.">
        <Link to="/forgot-password" className="btn-primary w-full py-3">Request a new link</Link>
      </AuthShell>
    );
  }

  const onSubmit = async (values: z.infer<typeof newPasswordSchema>) => {
    const { error } = await supabase.auth.updateUser({ password: values.password });
    if (error) {
      toast(errorMessage(error), 'error');
      return;
    }
    toast('Your password has been updated.');
    navigate('/', { replace: true });
  };

  return (
    <AuthShell title="Choose a new password" subtitle="Use at least 8 characters.">
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        <TextField
          label="New password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          icon={faLock}
          error={errors.password?.message}
          trailing={<PasswordToggle visible={showPassword} onToggle={() => setShowPassword((v) => !v)} />}
          {...register('password')}
        />
        <TextField
          label="Confirm new password"
          type={showConfirm ? 'text' : 'password'}
          autoComplete="new-password"
          icon={faLock}
          error={errors.confirm?.message}
          trailing={<PasswordToggle visible={showConfirm} onToggle={() => setShowConfirm((v) => !v)} />}
          {...register('confirm')}
        />
        <button type="submit" className="btn-primary w-full py-3" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Save new password'}
        </button>
      </form>
    </AuthShell>
  );
}
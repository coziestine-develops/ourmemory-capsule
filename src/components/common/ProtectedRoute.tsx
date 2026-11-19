import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { fetchRelationship, useRelationship } from '../../hooks/useRelationship';
import { errorMessage } from '../../lib/format';

/** How long the welcome loader plays after signing in. */
const WELCOME_MS = 3000;

export function FullPageLoader() {
  return (
    <div className="hero-gradient flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center" role="status" aria-live="polite">
      <img src="/icons.png" alt="Memory Capsule logo" className="h-16 w-auto object-contain sm:h-20" />
      <p className="font-heading text-2xl font-semibold text-espresso sm:text-3xl">Memory Capsule</p>
      <p className="handwritten animate-pulse text-lg text-mocha sm:text-xl">Opening your capsule…</p>
    </div>
  );
}

/** Neutral placeholder for refreshes: same background as the app, no logo and no text. */
function QuietPlaceholder() {
  return <div className="hero-gradient min-h-dvh" aria-hidden="true" />;
}

export function RequireAuth() {
  const { session, user, loading, entering, endEntrance } = useAuth();
  const location = useLocation();
  const queryClient = useQueryClient();

  // While the welcome loader plays, fetch the user's space in the background so the app is ready when it ends.
  useEffect(() => {
    if (!entering || !user) return;
    void queryClient.prefetchQuery({
      queryKey: ['relationship', user.id],
      queryFn: () => fetchRelationship(user.id),
    });
  }, [entering, user, queryClient]);

  // The welcome loader plays only for the moment after a sign-in, then clears itself.
  useEffect(() => {
    if (!entering) return;
    const timer = window.setTimeout(endEntrance, WELCOME_MS);
    return () => window.clearTimeout(timer);
  }, [entering, endEntrance]);

  // Signed-out visitors are sent straight to sign-in: no loader, no delay.
  if (loading) return <QuietPlaceholder />;
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (entering) return <FullPageLoader />;
  return <Outlet />;
}

export function RequireRelationship() {
  const { data, isLoading, error } = useRelationship();
  // A page refresh never shows the welcome loader; only the quiet background while the space loads.
  if (isLoading) return <QuietPlaceholder />;
  if (error) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="font-heading text-2xl font-semibold">We couldn't load your space.</p>
        <p className="text-sm text-mocha">{errorMessage(error)}</p>
      </div>
    );
  }
  if (!data) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}

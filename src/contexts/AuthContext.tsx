import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { isAllowedEmail } from '../lib/access';
import { clearRelationshipCache } from '../lib/relationshipCache';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /** True only while the post-sign-in welcome loader is playing. Never true for signed-out visitors. */
  entering: boolean;
  /** True when a session for an email outside the allowlist was signed out, so the sign-in page can explain why. */
  accessDenied: boolean;
  clearAccessDenied: () => void;
  /** Call right before a sign-in or sign-up request so the welcome loader can play. */
  beginEntrance: () => void;
  endEntrance: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [entering, setEntering] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    // Only the allowed accounts may hold a session. Anyone else is signed out at once.
    const admit = (next: Session | null) => {
      if (next && !isAllowedEmail(next.user.email)) {
        setAccessDenied(true);
        void supabase.auth.signOut();
        setSession(null);
        return;
      }
      setSession(next);
    };
    supabase.auth.getSession().then(({ data }) => {
      admit(data.session);
      setLoading(false);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => admit(next));
    return () => subscription.subscription.unsubscribe();
  }, []);

  const beginEntrance = useCallback(() => setEntering(true), []);
  const endEntrance = useCallback(() => setEntering(false), []);
  const clearAccessDenied = useCallback(() => setAccessDenied(false), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      entering,
      accessDenied,
      clearAccessDenied,
      beginEntrance,
      endEntrance,
      signOut: async () => {
        setEntering(false);
        clearRelationshipCache();
        await supabase.auth.signOut();
      },
    }),
    [session, loading, entering, accessDenied, clearAccessDenied, beginEntrance, endEntrance],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

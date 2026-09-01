import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { uploadUserAvatar } from '../lib/uploadAvatar';
import { friendlySignUpError } from '../lib/username';
import { unregisterPush } from '../lib/push';
import { clearSignedUrlCache } from '../lib/mediaUrl';
import { unsubscribeWebPush } from '../lib/webPush';

export type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_emoji: string;
  avatar_color: string;
  avatar_url: string | null;
  /** ISO timestamp of the last username change; null means never changed.
   *  What the Profile screen reads to work out when the next one is allowed —
   *  the 30-day rule itself is enforced by a trigger on the table. */
  username_changed_at: string | null;
};

/** What the sign-up screen collects for the new profile's look. */
export type SignUpAvatar = {
  emoji: string;
  color: string;
  /** Base64 of a picked photo; uploaded after the session exists. */
  photoBase64?: string | null;
  photoExt?: string;
};

/**
 * Sign-up finishes in one of two shapes, and the caller has to tell them apart.
 *
 * With "Confirm email" enabled, Supabase creates the user but returns no
 * session — the account is real yet unusable until the emailed link is opened.
 * Returning only an error string could not express that: no error and no
 * session looked identical to a completed sign-up, so the screen fell silent
 * and the person was left on the form with no idea an email had been sent.
 */
export type SignUpResult = {
  error: string | null;
  /** True when the account exists but is waiting on the emailed link. */
  needsConfirmation: boolean;
};

type AuthContextValue = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signUp: (
    email: string,
    password: string,
    username: string,
    displayName: string,
    avatar?: SignUpAvatar
  ) => Promise<SignUpResult>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  /** True from a successful sign-up until the welcome screen is dismissed.
   *  Signing up puts a session in place immediately, which swaps the whole
   *  navigator over to the app — this is what lets the welcome moment land
   *  in between instead of dumping a brand-new user straight into an empty
   *  chat list. */
  justSignedUp: boolean;
  clearJustSignedUp: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [justSignedUp, setJustSignedUp] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const loadProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select(
        'id, username, display_name, avatar_emoji, avatar_color, avatar_url, username_changed_at'
      )
      .eq('id', userId)
      .single();
    setProfile(data);
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setProfile(null);
      return;
    }
    loadProfile(session.user.id);

    const channel = supabase
      .channel(`user-profile-${session.user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${session.user.id}`,
        },
        () => {
          loadProfile(session.user.id);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id, loadProfile]);

  const refreshProfile = useCallback(async () => {
    if (session?.user) await loadProfile(session.user.id);
  }, [session?.user?.id, loadProfile]);

  async function signUp(
    email: string,
    password: string,
    username: string,
    displayName: string,
    avatar?: SignUpAvatar
  ) {
    setJustSignedUp(true);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
          display_name: displayName,
          // Read by the handle_new_user trigger so the profile is created with
          // the look they picked instead of a random one.
          avatar_emoji: avatar?.emoji ?? '',
          avatar_color: avatar?.color ?? '',
        },
      },
    });
    if (error) {
      setJustSignedUp(false);
      return { error: friendlySignUpError(error.message), needsConfirmation: false };
    }

    /*
     * No session means "Confirm email" is on and the link has been sent. The
     * navigator stays on the auth stack in that case, so justSignedUp is
     * cleared: it exists to slot the welcome screen between sign-up and the
     * app, and there is no session here for it to sit in front of.
     */
    if (!data.session) {
      setJustSignedUp(false);
      return { error: null, needsConfirmation: true };
    }

    // A picked photo can only be uploaded once a session exists — storage
    // policies key off auth.uid(). With email confirmation on there's no
    // session yet, so the photo is simply skipped rather than failing signup.
    const newUserId = data.session?.user.id;
    if (avatar?.photoBase64 && newUserId) {
      const { url } = await uploadUserAvatar(
        avatar.photoBase64,
        newUserId,
        avatar.photoExt ?? 'jpg'
      );
      if (url) {
        await supabase.from('profiles').update({ avatar_url: url }).eq('id', newUserId);
        await loadProfile(newUserId);
      }
    }

    return { error: null, needsConfirmation: false };
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error?.message ?? null;
  }

  async function signOut() {
    setJustSignedUp(false);
    // Before the session goes: the delete is RLS-scoped to the signed-in
    // user, so doing it after signOut() would silently no-op and leave this
    // device receiving the previous account's messages.
    await unregisterPush();
    await unsubscribeWebPush();
    // Signatures outlive the session otherwise — the next account on this
    // device would inherit working links to the previous one's media.
    clearSignedUrlCache();
    await supabase.auth.signOut();
  }

  const clearJustSignedUp = useCallback(() => setJustSignedUp(false), []);

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        loading,
        signUp,
        signIn,
        signOut,
        refreshProfile,
        justSignedUp,
        clearJustSignedUp,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

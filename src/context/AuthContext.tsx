import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { uploadUserAvatar } from '../lib/uploadAvatar';
import { friendlySignUpError } from '../lib/username';

export type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_emoji: string;
  avatar_color: string;
  avatar_url: string | null;
};

/** What the sign-up screen collects for the new profile's look. */
export type SignUpAvatar = {
  emoji: string;
  color: string;
  /** Base64 of a picked photo; uploaded after the session exists. */
  photoBase64?: string | null;
  photoExt?: string;
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
  ) => Promise<string | null>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

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
      .select('id, username, display_name, avatar_emoji, avatar_color, avatar_url')
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
    if (error) return friendlySignUpError(error.message);

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

    return null;
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error?.message ?? null;
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider
      value={{ session, profile, loading, signUp, signIn, signOut, refreshProfile }}
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

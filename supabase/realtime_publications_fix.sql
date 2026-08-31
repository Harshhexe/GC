-- Fix realtime publication and replica identity for full table payloads and realtime delivery

DO $$
BEGIN
  -- Add profiles to supabase_realtime if not present
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;

  -- Add wordle_attempts to supabase_realtime if not present
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'wordle_attempts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.wordle_attempts;
  END IF;

  -- Set REPLICA IDENTITY FULL on core realtime tables so filters and payloads work reliably
  ALTER TABLE public.messages REPLICA IDENTITY FULL;
  ALTER TABLE public.profiles REPLICA IDENTITY FULL;
  ALTER TABLE public.groups REPLICA IDENTITY FULL;
  ALTER TABLE public.group_members REPLICA IDENTITY FULL;
  ALTER TABLE public.message_reactions REPLICA IDENTITY FULL;
  ALTER TABLE public.media_views REPLICA IDENTITY FULL;
  ALTER TABLE public.hidden_messages REPLICA IDENTITY FULL;
  ALTER TABLE public.pinned_messages REPLICA IDENTITY FULL;
  ALTER TABLE public.polls REPLICA IDENTITY FULL;
  ALTER TABLE public.private_comments REPLICA IDENTITY FULL;
END $$;

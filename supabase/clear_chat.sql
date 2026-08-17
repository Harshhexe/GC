-- Clear chat for me: hides all messages in this group for the current user only.
-- Other members continue to see everything normally.
CREATE OR REPLACE FUNCTION clear_chat_for_me(p_group_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Insert hides for all current messages in this group for the calling user
  INSERT INTO public.hidden_messages (message_id, user_id)
  SELECT m.id, v_user_id
  FROM public.messages m
  WHERE m.group_id = p_group_id
  ON CONFLICT (message_id, user_id) DO NOTHING;
END;
$$;

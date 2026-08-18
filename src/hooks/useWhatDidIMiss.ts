import { useCallback, useEffect, useRef, useState } from 'react';
import { invokeGCAI, type AIError, type WhatDidIMissResult } from '../lib/ai';
import { supabase } from '../lib/supabase';

type State = {
  loading: boolean;
  result: WhatDidIMissResult | null;
  error: AIError | null;
  cached: boolean;
};

const IDLE: State = { loading: false, result: null, error: null, cached: false };

/**
 * Runs the `what_did_i_miss` operation for a group.
 *
 * Deliberately thin: the missed window, the model, the prompt and the citation
 * validation all live server-side. The screen's only job is to show whatever
 * comes back, so there is no client-side notion of "what counts as missed"
 * that could drift from the server's.
 *
 * Fires once per mount. Consumes the missed boundary on success so subsequent
 * clicks without new messages know you are caught up!
 */
export function useWhatDidIMiss(groupId: string) {
  const [state, setState] = useState<State>({ ...IDLE, loading: true });

  const inFlight = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    if (inFlight.current) return null;
    inFlight.current = true;
    setState((s) => ({ ...s, loading: true, error: null }));

    const response = await invokeGCAI<WhatDidIMissResult>(groupId, 'what_did_i_miss');

    inFlight.current = false;
    if (!mounted.current) return response;

    if (response.ok) {
      setState({
        loading: false,
        result: response.result,
        error: null,
        cached: response.cached,
      });

      // Retires the missed boundary for this viewing session so returning to chat
      // and tapping AI again without new messages accurately reports "caught up".
      supabase.rpc('gc_consume_missed_boundary', { p_group_id: groupId }).then(undefined, () => {});
    } else {
      setState({ loading: false, result: null, error: response.error, cached: false });
    }
    return response;
  }, [groupId]);

  useEffect(() => {
    setState({ ...IDLE, loading: true });
    run();
  }, [run]);

  return { ...state, retry: run };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { invokeGCAI, type AIError, type WhatDidIMissResult } from '../lib/ai';

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
 * Fires once per mount. The server caches on the exact message set, so a
 * remount with nothing new costs a cache read rather than a model call.
 */
export function useWhatDidIMiss(groupId: string) {
  const [state, setState] = useState<State>({ ...IDLE, loading: true });

  // Survives remounts of the effect but not of the screen — enough to stop
  // StrictMode's double-invoke from firing two requests.
  const inFlight = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setState((s) => ({ ...s, loading: true, error: null }));

    const response = await invokeGCAI<WhatDidIMissResult>(groupId, 'what_did_i_miss');

    inFlight.current = false;
    if (!mounted.current) return;

    if (response.ok) {
      setState({
        loading: false,
        result: response.result,
        error: null,
        cached: response.cached,
      });
    } else {
      setState({ loading: false, result: null, error: response.error, cached: false });
    }
  }, [groupId]);

  useEffect(() => {
    setState({ ...IDLE, loading: true });
    run();
  }, [run]);

  return { ...state, retry: run };
}

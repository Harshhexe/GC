import { useEffect, useState } from 'react';

const START_HOUR = 0; // midnight
const END_HOUR = 5; // 5 AM

function isAfterHours(d: Date) {
  const h = d.getHours();
  return h >= START_HOUR && h < END_HOUR;
}

/** GC AFTER DARK — true between midnight and 5 AM. Re-checks each minute so
 *  the mode flips while the app is open, not just on cold start. */
export function useAfterHours() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  return { afterHours: isAfterHours(now), now };
}

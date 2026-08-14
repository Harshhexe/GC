import { useEffect, useState, useCallback } from 'react';

export type ElevenElevenState = {
  isWishTime: boolean;
  secondsRemaining: number;
  isTimesUp: boolean;
  dismissTimesUp: () => void;
};

/**
 * Real-time hook for the 11:11 "Make a Wish" & "Time's Up" event.
 *
 * - Active: 11:11:00 - 11:11:59 (both AM & PM) with live 60-second countdown.
 * - Time's Up: 11:12:00 - 11:17:00 (5-minute grace window following 11:11).
 */
export function useElevenEleven(): ElevenElevenState {
  const [now, setNow] = useState(() => new Date());
  const [dismissedHour, setDismissedHour] = useState<number | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();

  const isElevenHour = hours === 11 || hours === 23;
  const isWishTime = isElevenHour && minutes === 11;
  const secondsRemaining = isWishTime ? 60 - seconds : 0;

  // Post-window for 5 minutes (11:12 to 11:16 inclusive)
  const isTimesUpWindow = isElevenHour && minutes >= 12 && minutes <= 16;
  const isTimesUp = isTimesUpWindow && dismissedHour !== hours;

  const dismissTimesUp = useCallback(() => {
    setDismissedHour(hours);
  }, [hours]);

  return {
    isWishTime,
    secondsRemaining,
    isTimesUp,
    dismissTimesUp,
  };
}

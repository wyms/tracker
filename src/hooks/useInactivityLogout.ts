import { useEffect, useRef } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../services/firebase';
import { useAppStore } from '../store/useAppStore';

const INACTIVITY_TIMEOUT = 10 * 60 * 1000; // 10 minutes

export function useInactivityLogout() {
  const user = useAppStore((s) => s.user);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user || !auth) return;

    function resetTimer() {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (auth) signOut(auth).catch(() => {});
      }, INACTIVITY_TIMEOUT);
    }

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach((e) => window.removeEventListener(e, resetTimer));
    };
  }, [user]);
}

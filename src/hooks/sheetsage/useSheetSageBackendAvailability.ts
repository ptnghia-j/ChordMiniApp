import { useEffect } from 'react';
import { useSheetSageActions } from '@/stores/analysisStore';

export function useSheetSageBackendAvailability(enabled: boolean): void {
  const {
    setIsCheckingSheetSageBackend,
    setIsSheetSageBackendAvailable,
    setSheetSageBackendError,
  } = useSheetSageActions();

  useEffect(() => {
    if (!enabled) {
      setIsCheckingSheetSageBackend(false);
      setIsSheetSageBackendAvailable(null);
      setSheetSageBackendError(null);
      return;
    }

    let cancelled = false;

    const checkBackend = async () => {
      setIsCheckingSheetSageBackend(true);
      setSheetSageBackendError(null);

      try {
        const response = await fetch('/api/transcribe-sheetsage?health=1', {
          method: 'GET',
          cache: 'no-store',
        });
        const payload = await response.json().catch(() => null);
        if (cancelled) return;

        const available = Boolean(payload?.available);
        setIsSheetSageBackendAvailable(available);
        setSheetSageBackendError(available ? null : (payload?.error || 'Sheet Sage backend unavailable.'));
      } catch (error: unknown) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'Sheet Sage backend unavailable.';
        setIsSheetSageBackendAvailable(false);
        setSheetSageBackendError(message);
      } finally {
        if (!cancelled) {
          setIsCheckingSheetSageBackend(false);
        }
      }
    };

    void checkBackend();

    return () => {
      cancelled = true;
    };
  }, [
    enabled,
    setIsCheckingSheetSageBackend,
    setIsSheetSageBackendAvailable,
    setSheetSageBackendError,
  ]);
}

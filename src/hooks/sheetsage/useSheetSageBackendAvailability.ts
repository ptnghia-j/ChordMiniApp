import { useEffect } from 'react';
import { useSheetSageActions } from '@/stores/analysisStore';
import { useSheetSageBackendAvailabilityQuery } from '@/hooks/query/useSheetSageQueries';

export function useSheetSageBackendAvailability(enabled: boolean): void {
  const {
    setIsCheckingSheetSageBackend,
    setIsSheetSageBackendAvailable,
    setSheetSageBackendError,
  } = useSheetSageActions();
  const { data, error, isFetching } = useSheetSageBackendAvailabilityQuery(enabled);

  useEffect(() => {
    if (!enabled) {
      setIsCheckingSheetSageBackend(false);
      setIsSheetSageBackendAvailable(null);
      setSheetSageBackendError(null);
      return;
    }

    setIsCheckingSheetSageBackend(isFetching);
    setSheetSageBackendError(null);
  }, [
    enabled,
    isFetching,
    setIsCheckingSheetSageBackend,
    setIsSheetSageBackendAvailable,
    setSheetSageBackendError,
  ]);

  useEffect(() => {
    if (!enabled || !data) {
      return;
    }

    setIsSheetSageBackendAvailable(data.available);
    setSheetSageBackendError(data.error);
  }, [data, enabled, setIsSheetSageBackendAvailable, setSheetSageBackendError]);

  useEffect(() => {
    if (!enabled || !error) {
      return;
    }

    const message = error instanceof Error ? error.message : 'Sheet Sage backend unavailable.';
    setIsSheetSageBackendAvailable(false);
    setSheetSageBackendError(message);
  }, [
    enabled,
    error,
    setIsSheetSageBackendAvailable,
    setSheetSageBackendError,
  ]);
}

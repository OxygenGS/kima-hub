'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { useLanguage } from '@/lib/i18n/language-context';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useLanguage();

  useEffect(() => {
    console.error('Route error:', error);
  }, [error]);

  return (
    <div className="flex h-screen items-center justify-center bg-black">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-4">
          {t("Something went wrong")}
        </h2>
        <p className="text-[var(--text-secondary)] mb-6">
          {t("An unexpected error occurred. Please try again.")}
        </p>
        <Button onClick={reset}>{t("Try again")}</Button>
      </div>
    </div>
  );
}

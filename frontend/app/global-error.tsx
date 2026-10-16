'use client';

import { useEffect } from 'react';
import { useStoredLocale } from '@/lib/i18n/language-context';
import { translate } from '@/lib/i18n/translations';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const locale = useStoredLocale();
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);

  useEffect(() => {
    console.error('Global error:', error);
  }, [error]);

  return (
    <html lang={locale}>
      <body>
        <div className="flex h-screen items-center justify-center bg-black">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white mb-4">
              {t("Application Error")}
            </h2>
            <p className="text-[var(--text-secondary)] mb-6">
              {t("A critical error occurred. Please reload the page.")}
            </p>
            <button
              onClick={reset}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              {t("Reload Application")}
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}

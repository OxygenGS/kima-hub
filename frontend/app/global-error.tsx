'use client';

import { useEffect } from 'react';
import { Button } from "@/components/ui/Button";
import { useStoredLocale } from "@/lib/i18n/language-context";
import { translate } from "@/lib/i18n/translations";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const locale = useStoredLocale();
  useEffect(() => {
    console.error('Global error:', error);
  }, [error]);

  return (
    <html>
      <body>
        <div className="flex h-screen items-center justify-center bg-black">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white mb-4">
              {translate(locale, "Application Error")}
            </h2>
            <p className="text-[var(--text-secondary)] mb-6">
              {translate(locale, "A critical error occurred. Please reload the page.")}
            </p>
            <Button
              variant="primary"
              onClick={reset}
            >
              {translate(locale, "Reload Application")}
            </Button>
          </div>
        </div>
      </body>
    </html>
  );
}

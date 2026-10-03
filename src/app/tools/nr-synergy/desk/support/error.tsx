"use client";

import ModuleError from "../../_home/ModuleError";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ModuleError error={error} reset={reset} />;
}

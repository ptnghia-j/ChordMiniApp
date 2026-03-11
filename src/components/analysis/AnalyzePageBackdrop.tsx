interface AnalyzePageBackdropProps {
  thumbnailUrl?: string | null;
  showFooterTransition?: boolean;
}

export default function AnalyzePageBackdrop({
  thumbnailUrl,
  showFooterTransition = false,
}: AnalyzePageBackdropProps) {
  const backgroundStyle = thumbnailUrl
    ? { backgroundImage: `url("${thumbnailUrl}")` }
    : undefined;

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {thumbnailUrl ? (
        <>
          <div
            data-testid="analyze-thumbnail-backdrop"
            className="absolute inset-[-12%] scale-110 bg-cover bg-center opacity-30 blur-3xl saturate-150 dark:opacity-35"
            style={backgroundStyle}
          />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(96,165,250,0.18),transparent_42%),radial-gradient(circle_at_82%_18%,rgba(168,85,247,0.16),transparent_34%)] dark:bg-[radial-gradient(circle_at_top,rgba(96,165,250,0.16),transparent_42%),radial-gradient(circle_at_82%_18%,rgba(192,132,252,0.14),transparent_34%)]" />
        </>
      ) : null}

      <div className="absolute inset-0 bg-gradient-to-b from-white/92 via-slate-50/84 to-white/96 dark:from-slate-950/76 dark:via-slate-950/82 dark:to-slate-950/95" />

      {showFooterTransition ? (
        <div data-testid="analyze-footer-transition" className="absolute inset-x-0 bottom-0 h-64">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/22 to-white/72 dark:via-slate-950/26 dark:to-slate-950/88" />
          <div className="absolute left-1/2 top-14 h-24 w-[90vw] max-w-[1100px] -translate-x-1/2 rounded-full bg-sky-400/12 blur-3xl dark:bg-sky-300/10" />
          <div className="absolute inset-x-10 bottom-0 h-20 rounded-t-[999px] bg-white/45 blur-2xl dark:bg-slate-400/10" />
        </div>
      ) : null}
    </div>
  );
}
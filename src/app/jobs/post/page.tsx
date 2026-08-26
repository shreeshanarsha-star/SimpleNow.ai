import Link from "next/link";
import LogoMark from "@/components/LogoMark";
import PublicJobPostingForm from "@/components/tools/PublicJobPostingForm";

export const dynamic = "force-dynamic";

const VERIFY_BANNER: Record<string, { tone: "good" | "critical"; text: string }> = {
  success: { tone: "good", text: "Email verified — thanks! Your posting(s) now note a confirmed email." },
  invalid: { tone: "critical", text: "That verification link is invalid or has expired." },
  missing_token: { tone: "critical", text: "That verification link is missing its token." },
};

// Job Postings.ai — public, free, unauthenticated. Recreated from the old
// askshree-app repo: anyone can upload JDs and get up to 3 free
// AI-structured postings per IP; signed-in users bypass the limit.
// Deliberately NOT under /tools (middleware gates that to signed-in users
// only) — same reasoning as /apply being its own public surface.
export default async function PostJobPage({
  searchParams,
}: {
  searchParams: Promise<{ verify?: string }>;
}) {
  const { verify } = await searchParams;
  const banner = verify ? VERIFY_BANNER[verify] : undefined;

  return (
    <div className="min-h-screen bg-page">
      <header className="border-b border-border bg-surface">
        <div className="max-w-[1000px] mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/jobs" className="flex items-center gap-2.5">
            <LogoMark size={30} />
            <div>
              <div className="font-bold text-[15.5px] leading-tight">Askshree</div>
              <small className="block font-medium text-[10.5px] text-ink-muted tracking-wide">
                JOB BOARD
              </small>
            </div>
          </Link>
          <Link href="/jobs" className="text-[12px] font-bold text-ink-muted">
            Browse open roles
          </Link>
        </div>
      </header>

      <main className="max-w-[1000px] mx-auto px-6 py-10">
        <h1 className="text-[26px] font-bold m-0">Job Postings.ai</h1>
        <p className="text-[13.5px] text-ink-muted mt-1.5 max-w-xl">
          Post a role free — no account required for your first 3 postings.
        </p>

        {banner && (
          <div
            className={`text-[12.5px] rounded-sm px-3 py-2 mt-4 max-w-2xl ${
              banner.tone === "good" ? "bg-good-wash text-good-text" : "bg-critical-wash text-critical"
            }`}
          >
            {banner.text}
          </div>
        )}

        <div className="mt-8">
          <PublicJobPostingForm />
        </div>
      </main>
    </div>
  );
}

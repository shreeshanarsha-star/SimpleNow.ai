import QuestionnaireForm from "@/components/tools/QuestionnaireForm";
import Logo from "@/components/Logo";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ApplyQuestionnairePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <div className="min-h-screen bg-page">
      <header className="border-b border-border bg-surface">
        <div className="max-w-[700px] mx-auto px-6 py-4">
          <Link href="/" className="flex flex-col items-start gap-0.5">
            <Logo height={26} />
            <small className="block font-medium text-[10.5px] text-ink-muted tracking-wide">
              APPLY.AI
            </small>
          </Link>
        </div>
      </header>
      <main className="max-w-[700px] mx-auto px-6 py-10">
        <QuestionnaireForm token={token} />
      </main>
    </div>
  );
}

import { getNrsContext, hasNrsAccess } from "@/lib/nrs/member";
import DeskNav from "./_components/DeskNav";

export const dynamic = "force-dynamic";

// Shell for the Desk tab: Support / Travel sub-tabs (only the desks the
// caller can use). Each desk page still enforces its own access.
export default async function DeskLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getNrsContext();
  const allowed: ("support" | "travel")[] = [];
  if (ctx && hasNrsAccess(ctx)) {
    if (ctx.desk.support) allowed.push("support");
    if (ctx.desk.travel) allowed.push("travel");
  }
  return (
    <div className="flex flex-col gap-4 min-w-0">
      <DeskNav allowed={allowed} />
      {children}
    </div>
  );
}

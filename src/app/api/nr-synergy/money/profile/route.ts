import { guardMember, ok, run } from "@/lib/nrs/invoice/kit";
import { reportingCurrency } from "@/lib/nrs/invoice/fx";
import { countryCurrency, numericLimits } from "@/lib/nrs/invoice/moneyServer";
import { loadCountryCalendar } from "@/lib/nrs/dates";
import type { MoneyProfileDto } from "@/lib/nrs/invoice/types";

export const dynamic = "force-dynamic";

// GET: what the Money tab needs to know about the caller.
export async function GET() {
  return run(async () => {
    const g = await guardMember("money");
    const today = new Date().toISOString().slice(0, 10);
    const [rc, cc, cal, sig, terms] = await Promise.all([
      reportingCurrency(g.admin, g.orgId),
      countryCurrency(g.admin, g.orgId, g.member.home_country),
      loadCountryCalendar(g.admin, g.orgId, g.member.home_country, today, today),
      g.admin.from("nrs_signatures").select("member_id").eq("member_id", g.member.id).maybeSingle(),
      g.admin
        .from("nrs_contract_terms")
        .select("id", { count: "exact", head: true })
        .eq("member_id", g.member.id)
        .not("verified_at", "is", null),
    ]);
    const body: MoneyProfileDto = {
      memberId: g.member.id,
      fullName: g.member.full_name,
      homeCountry: g.member.home_country,
      countryCurrency: cc ?? rc,
      reportingCurrency: rc,
      engagementType: g.ctx.engagementType,
      isFinance: g.ctx.isFinance,
      hasSignature: !!sig.data,
      hasVerifiedTerms: (terms.count ?? 0) > 0,
      expenseLimits: numericLimits(cal.expenseLimits),
    };
    return ok(body);
  });
}

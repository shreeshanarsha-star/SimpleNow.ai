import { t } from "@/lib/nrs/i18n/en";
import { PageSkeleton } from "../_home/ui";

export default function Loading() {
  return <PageSkeleton label={t("common.loading")} />;
}

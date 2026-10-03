import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { knowledge as s } from "@/lib/nrs/i18n/en/knowledge";
import { gatePage } from "../../_home/gate";
import { Card, EmptyLine, PageHeader, ProgressBar, SectionTitle, fill, linkClass } from "../../_home/ui";
import JourneyStep from "./JourneyStep";
import Transcript from "./Transcript";

interface JoeMedia {
  md_message_title: string | null;
  md_video_url: string | null;
  md_transcript: string | null;
}

interface ValueRow {
  id: string;
  name: string;
  meaning: string;
  behaviours: string[];
  not_this: string[];
  leader_message: string | null;
}

/** An embeddable player for an https video URL, or null to show a plain link. */
function videoEmbed(raw: string | null): { kind: "iframe" | "video"; src: string } | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.replace(/^www\./, "");
  if (host === "youtube.com" || host === "m.youtube.com") {
    const v = u.searchParams.get("v");
    if (v && /^[\w-]{6,20}$/.test(v)) return { kind: "iframe", src: `https://www.youtube-nocookie.com/embed/${v}` };
    const m = /^\/embed\/([\w-]{6,20})/.exec(u.pathname);
    if (m) return { kind: "iframe", src: `https://www.youtube-nocookie.com/embed/${m[1]}` };
  }
  if (host === "youtu.be") {
    const id = u.pathname.slice(1);
    if (/^[\w-]{6,20}$/.test(id)) return { kind: "iframe", src: `https://www.youtube-nocookie.com/embed/${id}` };
  }
  if (host === "vimeo.com") {
    const m = /^\/(\d+)/.exec(u.pathname);
    if (m) return { kind: "iframe", src: `https://player.vimeo.com/video/${m[1]}` };
  }
  if (host === "player.vimeo.com") return { kind: "iframe", src: u.toString() };
  if (/\.(mp4|webm|ogg)$/i.test(u.pathname)) return { kind: "video", src: u.toString() };
  return null;
}

export default async function NrSynergyJoePage() {
  const gate = await gatePage("knowledge");
  if (!gate.ok) return gate.node;
  const { member } = gate;
  const supabase = await createClient();

  const [mediaRes, valuesRes, progressRes] = await Promise.all([
    supabase
      .from("nrs_joe_media")
      .select("md_message_title, md_video_url, md_transcript")
      .eq("org_id", member.org_id)
      .maybeSingle(),
    supabase
      .from("nrs_values")
      .select("id, name, meaning, behaviours, not_this, leader_message")
      .eq("org_id", member.org_id)
      .order("sort", { ascending: true })
      .order("name", { ascending: true }),
    supabase.from("nrs_joe_progress").select("step, reflection, completed_at").eq("member_id", member.id),
  ]);
  if (mediaRes.error) throw new Error(mediaRes.error.message);
  if (valuesRes.error) throw new Error(valuesRes.error.message);
  if (progressRes.error) throw new Error(progressRes.error.message);

  const media = mediaRes.data as JoeMedia | null;
  const hasMedia = !!(media && (media.md_message_title || media.md_video_url || media.md_transcript));
  const values = (valuesRes.data ?? []) as ValueRow[];
  const progress = new Map(
    ((progressRes.data ?? []) as { step: string; reflection: string | null; completed_at: string }[]).map((p) => [p.step, p])
  );
  const embed = videoEmbed(media?.md_video_url ?? null);
  const safeVideoLink = media?.md_video_url && /^https:\/\//i.test(media.md_video_url) ? media.md_video_url : null;

  const steps = [
    ...(hasMedia ? [{ key: "md_message", label: s.joe.stepMd }] : []),
    ...values.map((v) => ({ key: v.id, label: fill(s.joe.stepValue, { name: v.name }) })),
  ];
  const doneCount = steps.filter((st) => progress.has(st.key)).length;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/tools/nr-synergy/knowledge" className={`${linkClass} text-[12.5px] self-start`}>
        ← {s.back}
      </Link>
      <PageHeader title={s.joe.title} subtitle={s.joe.card} />

      <Card labelledBy="nrs-md">
        <SectionTitle id="nrs-md">{media?.md_message_title || s.joe.mdMessage}</SectionTitle>
        {!hasMedia ? (
          <EmptyLine>{s.joe.mdEmpty}</EmptyLine>
        ) : (
          <div className="flex flex-col gap-3">
            {embed?.kind === "iframe" && (
              <div className="relative w-full aspect-video rounded-sm overflow-hidden bg-page">
                <iframe
                  src={embed.src}
                  title={media?.md_message_title || s.joe.mdMessage}
                  className="absolute inset-0 w-full h-full"
                  allow="encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                  loading="lazy"
                />
              </div>
            )}
            {embed?.kind === "video" && (
              <video src={embed.src} controls preload="metadata" className="w-full rounded-sm bg-page">
                <track kind="captions" />
              </video>
            )}
            {!embed && safeVideoLink && (
              <a href={safeVideoLink} target="_blank" rel="noopener noreferrer" className={`${linkClass} text-[13px] self-start`}>
                {s.joe.watch}
              </a>
            )}
            {media?.md_transcript && <Transcript text={media.md_transcript} />}
          </div>
        )}
      </Card>

      <Card labelledBy="nrs-values">
        <SectionTitle id="nrs-values">{s.joe.values}</SectionTitle>
        {values.length === 0 ? (
          <EmptyLine>{s.joe.valuesEmpty}</EmptyLine>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {values.map((v) => (
              <li key={v.id} className="border border-border rounded-sm p-4 flex flex-col gap-2">
                <h3 className="text-[15px] font-bold text-ink">{v.name}</h3>
                <p className="text-[13px] text-ink-2">{v.meaning}</p>
                {v.behaviours.length > 0 && (
                  <div>
                    <h4 className="text-[11.5px] font-bold uppercase tracking-wide text-good-text">{s.joe.behaviours}</h4>
                    <ul className="list-disc pl-5 text-[12.5px] text-ink-2">
                      {v.behaviours.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {v.not_this.length > 0 && (
                  <div>
                    <h4 className="text-[11.5px] font-bold uppercase tracking-wide text-critical">{s.joe.notThis}</h4>
                    <ul className="list-disc pl-5 text-[12.5px] text-ink-2">
                      {v.not_this.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {v.leader_message && (
                  <blockquote className="border-l-4 border-brand/40 pl-3 text-[12.5px] italic text-ink-2">
                    <span className="sr-only">{s.joe.leaderMessage}: </span>
                    {v.leader_message}
                  </blockquote>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card labelledBy="nrs-journey">
        <SectionTitle
          id="nrs-journey"
          aside={
            steps.length > 0 ? (
              <span className="text-[12px] text-ink-muted">{fill(s.joe.journeyProgress, { done: doneCount, total: steps.length })}</span>
            ) : undefined
          }
        >
          {s.joe.journey}
        </SectionTitle>
        <p className="text-[12.5px] text-ink-muted mb-3">{s.joe.journeyBody}</p>
        {steps.length > 0 && (
          <div className="mb-4">
            <ProgressBar pct={(doneCount / steps.length) * 100} label={s.joe.journey} />
          </div>
        )}
        {steps.length === 0 ? (
          <EmptyLine>{s.joe.valuesEmpty}</EmptyLine>
        ) : (
          <ol className="flex flex-col gap-2">
            {steps.map((st) => {
              const p = progress.get(st.key);
              return (
                <JourneyStep
                  key={st.key}
                  step={st.key}
                  label={st.label}
                  completedAt={p?.completed_at ?? null}
                  reflection={p?.reflection ?? ""}
                />
              );
            })}
          </ol>
        )}
      </Card>
    </div>
  );
}

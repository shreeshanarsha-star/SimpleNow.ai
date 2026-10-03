"use client";

import { useId, useState, type FormEvent } from "react";
import { home as s } from "@/lib/nrs/i18n/en/home";
import { REACTIONS, type FeedPost } from "./feedTypes";
import Markdown from "./Markdown";
import { useAction } from "./useAction";
import { ErrorLine, Pill, fill, fmtDateTime, inputClass, primaryButtonClass, secondaryButtonClass } from "./ui";

export default function PostCard({ post, canInteract, tz }: { post: FeedPost; canInteract: boolean; tz: string }) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const react = useAction();
  const send = useAction();

  async function onComment(e: FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;
    const ok = await send.run("/api/nr-synergy/home/comments", { post_id: post.id, body: comment });
    if (ok) {
      setComment("");
      setOpen(true);
    }
  }

  const commentsId = `${uid}-comments`;
  const count = post.comments.length;

  return (
    <li className="bg-surface border border-border rounded-md p-4 sm:p-5 flex flex-col gap-3 min-w-0">
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {post.pinned && <Pill tone="brand">{s.feed.pinned}</Pill>}
          <Pill>{s.feed.kind[post.kind]}</Pill>
        </div>
        <h3 className="text-[15.5px] font-bold text-ink break-words">{post.title}</h3>
        <p className="text-[11.5px] text-ink-muted">
          {post.author ? `${post.author} · ` : ""}
          <time dateTime={post.published_at}>{fmtDateTime(post.published_at, tz)}</time>
        </p>
      </header>

      <Markdown source={post.body} />

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={s.feed.reactions}>
        {REACTIONS.map((r) => {
          const active = post.mine.includes(r);
          return (
            <button
              key={r}
              type="button"
              aria-pressed={active}
              disabled={!canInteract || react.pending}
              onClick={() => void react.run("/api/nr-synergy/home/reactions", { post_id: post.id, emoji: r })}
              className={`rounded-full border px-2.5 py-1 text-[11.5px] font-bold transition-colors disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                active ? "border-brand bg-brand-wash text-brand-dark" : "border-border text-ink-2 hover:bg-page"
              }`}
            >
              {s.feed.reaction[r]}
              {post.counts[r] > 0 ? ` ${post.counts[r]}` : ""}
            </button>
          );
        })}
        <button
          type="button"
          className={`${secondaryButtonClass} ml-auto`}
          aria-expanded={open}
          aria-controls={commentsId}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? s.feed.hideComments : fill(s.feed.showComments, { count })}
        </button>
      </div>
      {react.error && <ErrorLine>{react.error}</ErrorLine>}

      <div id={commentsId} hidden={!open} className="flex flex-col gap-2 border-t border-border pt-3">
        {post.comments.length > 0 && (
          <ul className="flex flex-col gap-2" aria-label={fill(s.feed.comments, { count })}>
            {post.comments.map((c) => (
              <li key={c.id} className="rounded-sm bg-page px-3 py-2">
                <p className="text-[11.5px] font-bold text-ink-2">
                  {c.author} · <time dateTime={c.created_at}>{fmtDateTime(c.created_at, tz)}</time>
                </p>
                <p className="text-[12.5px] text-ink whitespace-pre-line break-words">{c.body}</p>
              </li>
            ))}
          </ul>
        )}
        {canInteract && (
          <form onSubmit={onComment} className="flex flex-col sm:flex-row gap-2">
            <label htmlFor={`${uid}-c`} className="sr-only">
              {s.feed.commentLabel}
            </label>
            <input
              id={`${uid}-c`}
              className={inputClass}
              maxLength={2000}
              placeholder={s.feed.commentPlaceholder}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <button type="submit" className={`${primaryButtonClass} shrink-0`} disabled={send.pending || !comment.trim()}>
              {send.pending ? s.feed.sending : s.feed.comment}
            </button>
          </form>
        )}
        {send.error && <ErrorLine>{send.error}</ErrorLine>}
      </div>
    </li>
  );
}

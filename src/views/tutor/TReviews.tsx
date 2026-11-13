"use client";

import { useCallback, useEffect, useState } from "react";
import { AvatarTile } from "@/components/shared/AvatarTile";
import { EmptyState, LoadingView } from "@/components/shared/Section";
import { StatusPill } from "@/components/shared/StatusPill";
import { dateOf, fromNow } from "@/lib/format";
import { MessageSquareQuote, Star } from "lucide-react";

interface ReviewItem {
  id: string;
  student: { id: string; name: string; color: string };
  rating: number;
  comment: string | null;
  subject: string;
  title: string;
  at: string;
  mode: string;
}

interface ReviewsData {
  reviews: ReviewItem[];
  stats: { avg: number; count: number; distribution: Record<string, number> };
  profile: { rating: number; reviewCount: number };
}

function Stars({ n, size = 14 }: { n: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${n} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          style={{ width: size, height: size }}
          className={i < n ? "fill-[#F4A54B] text-[#F4A54B]" : "text-muted-foreground/40"}
        />
      ))}
    </span>
  );
}

export function TReviews() {
  const [data, setData] = useState<ReviewsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/tutor/reviews");
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message || "Could not load reviews.");
      setData(json.data as ReviewsData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load reviews.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="sk-card p-6">
        <EmptyState
          icon={Star}
          title="Reviews unavailable"
          sub={error}
          action={
            <button className="sk-btn sk-btn-primary sk-btn-sm" onClick={load}>
              Try again
            </button>
          }
        />
      </div>
    );
  }
  if (!data) return <LoadingView label="Loading reviews…" />;

  const dist = data.stats.distribution ?? {};
  const maxCount = Math.max(...Object.values(dist), 1);

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-extrabold tracking-tight">Parent reviews</h1>
          <p className="text-[12.5px] text-muted-foreground mt-0.5">
            {data.profile.reviewCount} lifetime ratings · {data.stats.count} on-platform session review{data.stats.count === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        {/* summary */}
        <section className="sk-card p-5 space-y-4 lg:sticky lg:top-4" aria-label="Rating summary">
          <div className="flex items-end gap-3">
            <div className="text-[46px] font-extrabold leading-none text-brand-navy tabular">
              {data.profile.rating.toFixed(1)}
            </div>
            <div className="pb-1.5">
              <Stars n={Math.round(data.profile.rating)} size={16} />
              <div className="text-[11.5px] text-muted-foreground mt-1">{data.profile.reviewCount} ratings</div>
            </div>
          </div>
          <div className="space-y-1.5">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = dist[String(star)] ?? 0;
              return (
                <div key={star} className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold w-3 text-muted-foreground tabular">{star}</span>
                  <Star className="w-3 h-3 fill-[#F4A54B] text-[#F4A54B] shrink-0" />
                  <div className="sk-progress-track flex-1 !h-[7px]">
                    <div className="sk-progress-fill" style={{ width: `${Math.round((count / maxCount) * 100)}%` }} />
                  </div>
                  <span className="text-[11px] text-muted-foreground w-5 text-right tabular">{count}</span>
                </div>
              );
            })}
          </div>
          <div className="sk-well p-3 text-[11.5px] text-muted-foreground leading-relaxed">
            Reviews appear after a session is released from escrow. Ratings feed your Trust score (25 of 100 points) and
            your rank in parent search.
          </div>
        </section>

        {/* review cards */}
        <section className="lg:col-span-2 space-y-4" aria-label="Reviews">
          {data.reviews.length === 0 ? (
            <div className="sk-card p-6">
              <EmptyState
                icon={MessageSquareQuote}
                title="No session reviews yet"
                sub="After your next completed session, the family can rate the class and leave a note — it will appear here."
              />
            </div>
          ) : (
            <ul className="space-y-4">
              {data.reviews.map((r) => (
                <li key={r.id} className="sk-card p-5 space-y-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                      <AvatarTile name={r.student.name} color={r.student.color} size={40} />
                      <div className="min-w-0">
                        <div className="font-bold text-[13.5px] truncate">{r.student.name}</div>
                        <div className="text-[11.5px] text-muted-foreground truncate">{r.title}</div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <Stars n={r.rating} />
                      <div className="text-[11px] text-muted-foreground mt-1">{dateOf(r.at)} · {fromNow(r.at)}</div>
                    </div>
                  </div>
                  {r.comment ? (
                    <p className="text-[13px] leading-relaxed">“{r.comment}”</p>
                  ) : (
                    <p className="text-[12.5px] text-muted-foreground italic">Rated without a written note.</p>
                  )}
                  <div className="flex items-center gap-1.5">
                    <StatusPill tone="blue" dot={false}>{r.subject}</StatusPill>
                    <StatusPill tone={r.mode === "home" ? "orange" : "navy"} dot={false}>
                      {r.mode === "home" ? "Home visit" : "Online 1:1"}
                    </StatusPill>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

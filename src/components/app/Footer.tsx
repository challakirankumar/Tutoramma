"use client";

import { useRef, useState } from "react";
import { Download } from "lucide-react";

const SECRET_BUNDLE_URL = "/api/bundle?k=00acf5e76bd586648d16";

export function Footer() {
  const [hint, setHint] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const countRef = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Private easter egg: 5 quick clicks on the copyright text reveal the
  // source-bundle download. Invisible to normal visitors (no visible UI).
  const secretTap = () => {
    if (revealed) return;
    countRef.current += 1;
    if (countRef.current >= 5) {
      setRevealed(true);
      setHint(0);
      return;
    }
    setHint(countRef.current);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      countRef.current = 0;
      setHint(0);
    }, 5000);
  };

  return (
    <footer
      className="mt-auto shrink-0 border-t px-4 sm:px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-1.5 text-[11px] text-muted-foreground"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="flex items-center gap-1.5 font-semibold">
        <span className="gloss-title font-extrabold text-[12px]">Tutor Amma</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden sm:inline">Verified tutors · Escrow payments · Safe home tuition</span>
        <button
          type="button"
          onClick={secretTap}
          className="cursor-default select-none focus:outline-none"
          aria-label="Copyright 2026 Tutor Amma"
          title="© 2026 Tutor Amma"
        >
          © 2026 Tutor Amma
          {hint > 0 && !revealed && (
            <span className="ml-1 opacity-60" aria-hidden>
              · {5 - hint}
            </span>
          )}
        </button>
        {revealed && (
          <a
            href={SECRET_BUNDLE_URL}
            download="tutor-amma-github-repo.zip"
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold text-white transition-colors hover:opacity-90"
            style={{ background: "#14246B" }}
          >
            <Download className="w-3 h-3" aria-hidden />
            Source bundle (3.15 MB)
          </a>
        )}
      </div>
    </footer>
  );
}

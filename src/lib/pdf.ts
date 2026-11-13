/**
 * Tutor Amma — Branded PDF & Print toolkit (client-side, jsPDF).
 *
 * Every exported builder produces a properly structured A4 PDF with the
 * school logo + school name placed in a rich, consistent header on every
 * page, a branded footer with page numbers, and only the content the user
 * asked to print (no dashboard chrome, no browser URL headers).
 *
 * jsPDF is dynamically imported so it never lands in the initial bundle.
 */

export const BRAND = {
  name: "Tutor Amma",
  tagline: "Verified Learning Platform",
  logoUrl: "/brand/tutor-amma-logo-trim.png",
};

/* ----------------------------- palette ----------------------------- */
const NAVY: [number, number, number] = [20, 36, 107];
const ROYAL: [number, number, number] = [49, 91, 229];
const ORANGE: [number, number, number] = [231, 110, 15];
const INK: [number, number, number] = [28, 36, 64];
const GREY: [number, number, number] = [107, 118, 148];
const FAINT: [number, number, number] = [214, 222, 238];
const SOFT: [number, number, number] = [244, 246, 252];
const SOFT_BLUE: [number, number, number] = [237, 242, 254];
const WHITE: [number, number, number] = [255, 255, 255];

/* ----------------------------- geometry ----------------------------- */
const PAGE_W = 210;
const PAGE_H = 297;
const M = 14; // left/right margin (mm)
const CW = PAGE_W - M * 2; // content width
const TOP_Y = 31; // first usable y under the header
const BOTTOM_Y = 277; // last usable y above the footer
const FOOTER_LINE_Y = 283;

/* ----------------------------- money ----------------------------- */
/** Minor-unit paise → "Rs. 7,600.00" (print-safe ASCII; ₹ glyph is not in jsPDF base fonts). */
export function money(paise: number | null | undefined): string {
  const v = (paise ?? 0) / 100;
  return `Rs. ${v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function slug(s: string): string {
  return (s || "doc").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

/* Characters outside WinAnsi/cp1252 render as garbage in jsPDF's standard
   fonts (jsPDF truncates > 255 codepoints to the low byte — em-dashes become
   control chars, ₹ becomes "¹", • becomes '"' …). Map every common offender
   to a print-safe ASCII equivalent. */
const CHAR_MAP: Record<string, string> = {
  "₹": "Rs.", "₨": "Rs.", "€": "EUR", "™": "(TM)", "№": "No.", "⁄": "/",
  /* dashes → hyphen */
  "—": "-", "–": "-", "―": "-", "‒": "-", "−": "-", "﹘": "-", "─": "-", "━": "-",
  /* typographic quotes → ASCII */
  "\u2018": "'", "\u2019": "'", "\u201b": "'", "\u201c": '"', "\u201d": '"',
  "‹": "<", "›": ">", "«": "<<", "»": ">>", "′": "'", "″": '"', "‴": "'''",
  "…": "...",
  /* bullets / markers */
  "•": "-", "‣": "-", "⁃": "-", "◦": "-", "▪": "-", "▫": "-", "●": "-", "○": "-",
  "◉": "-", "►": ">", "▶": ">", "◄": "<", "★": "*", "☆": "*", "✓": "Yes", "✔": "Yes",
  "✗": "No", "✘": "No",
  /* subscripts → digits (6CO₂ → 6CO2) */
  "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
  "₊": "+", "₋": "-", "ₓ": "x", "ₙ": "n",
  /* superscripts beyond the cp1252-safe ¹²³ */
  "⁰": "^0", "⁴": "^4", "⁵": "^5", "⁶": "^6", "⁷": "^7", "⁸": "^8", "⁹": "^9",
  "⁺": "+", "⁻": "-", "ⁿ": "^n", "ⁱ": "^i",
  "⅓": "1/3", "⅔": "2/3", "¼": "1/4", "¾": "3/4", "½": "1/2", "⅕": "1/5", "⅙": "1/6", "⅛": "1/8",
  "⅜": "3/8", "⅝": "5/8", "⅞": "7/8", "⅐": "1/7", "⅑": "1/9",
  "π": "pi", "√": "sqrt", "∞": "inf", "≈": "~", "≠": "!=", "≤": "<=", "≥": ">=", "±": "+/-",
  "Σ": "sum", "∑": "sum", "∏": "product", "∫": "integral", "∂": "d", "∇": "grad",
  "θ": "theta", "α": "alpha", "β": "beta", "γ": "gamma", "δ": "delta", "ε": "epsilon",
  "λ": "lambda", "μ": "mu", "φ": "phi", "ω": "omega", "ψ": "psi", "ρ": "rho", "τ": "tau",
  "η": "eta", "κ": "kappa", "ν": "nu", "ξ": "xi", "ζ": "zeta", "Δ": "delta", "∆": "delta",
  "Ω": "ohm", "Θ": "theta", "Π": "pi", "Φ": "phi", "Λ": "lambda",
  "∈": " in ", "∉": " not in ", "⊂": "subset", "⊆": "subset", "∩": "and", "∪": "or",
  "∅": "empty set", "∴": "therefore", "∵": "because", "∝": "proportional to",
  "≡": "=", "≅": "congruent", "∼": "~", "⊕": "(+)", "⊗": "(x)", "∥": "||",
  "→": "->", "←": "<-", "↔": "<->", "⇒": "=>", "⇐": "<=", "⇔": "<=>",
  "↑": "up", "↓": "down", "∠": "angle", "⊥": "perpendicular", "⋅": "*", "∙": "*", "∕": "/",
  "\u00a0": " ", "\u200b": "", "\ufeff": "",
};
function san(s: string): string {
  if (!s) return s;
  let out = "";
  for (const ch of String(s)) {
    const code = ch.codePointAt(0) ?? 0;
    if (code <= 255) {
      /* drop C0 control chars except tab/CR/LF — they can break PDF strings */
      if (code < 32 && code !== 9 && code !== 10 && code !== 13) continue;
      out += ch; // Latin-1 — safe in standard fonts
    } else {
      const mapped = CHAR_MAP[ch];
      if (mapped !== undefined) out += mapped;
      else if (code >= 0x1f300 && code <= 0x1faff) out += ""; // emoji — drop
      else out += "?";
    }
  }
  return out;
}

/* ----------------------------- logo cache ----------------------------- */
let logoCache: string | null = null;

/** Measures a data-URL image (PNG/JPEG only) so custom logos keep their
 *  aspect ratio inside PDFs. Returns null for anything undrawable. */
async function measureImage(
  dataUrl: string
): Promise<{ w: number; h: number; format: "PNG" | "JPEG" } | null> {
  const format = dataUrl.startsWith("data:image/png")
    ? "PNG"
    : dataUrl.startsWith("data:image/jpeg")
      ? "JPEG"
      : null;
  if (!format) return null;
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("decode failed"));
      i.src = dataUrl;
    });
    if (!img.naturalWidth || !img.naturalHeight) return null;
    return { w: img.naturalWidth, h: img.naturalHeight, format };
  } catch {
    return null;
  }
}

async function loadLogo(): Promise<string | null> {
  if (logoCache !== null) return logoCache;
  try {
    const res = await fetch(BRAND.logoUrl);
    if (!res.ok) throw new Error("logo fetch failed");
    const blob = await res.blob();
    logoCache = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  } catch {
    logoCache = null;
  }
  return logoCache;
}

/* ----------------------------- core engine ----------------------------- */
class Pdf {
  doc: any;
  y = TOP_Y;
  logo: string | null = null;
  /* resolved logo geometry — defaults match the trimmed brand logo (≈1878:397) */
  logoW = 38;
  logoH = 38 / (1878 / 397);
  logoFormat = "PNG";
  title: string;
  subtitle: string;

  constructor(
    doc: any,
    title: string,
    subtitle: string,
    logo: string | null,
    logoSize?: { w: number; h: number; format: string }
  ) {
    this.doc = doc;
    this.title = title;
    this.subtitle = subtitle;
    this.logo = logo;
    if (logo && logoSize) {
      // custom logo — keep its own aspect ratio, capped to a tasteful size
      const ratio = logoSize.w / Math.max(1, logoSize.h);
      this.logoFormat = logoSize.format;
      this.logoH = 8;
      this.logoW = this.logoH * ratio;
      if (this.logoW > 60) {
        this.logoW = 60;
        this.logoH = this.logoW / ratio;
      }
    }
    this.pageHeader();
  }

  /** Branded page header — logo (contains school name) left, doc title right. */
  pageHeader() {
    const d = this.doc;
    d.setFillColor(...WHITE);
    d.rect(0, 0, PAGE_W, 26, "F");

    if (this.logo) {
      // vertically centred on the same band the default logo occupies
      const y = 10.5 + (38 / (1878 / 397) - this.logoH) / 2;
      d.addImage(this.logo, this.logoFormat, M, y, this.logoW, this.logoH);
    } else {
      d.setFont("helvetica", "bold");
      d.setFontSize(15);
      d.setTextColor(...NAVY);
      d.text(BRAND.name, M, 17);
      d.setFont("helvetica", "normal");
      d.setFontSize(6.5);
      d.setTextColor(...GREY);
      d.text(BRAND.tagline.toUpperCase(), M, 21);
    }

    // right-aligned doc title + subtitle
    d.setFont("helvetica", "bold");
    d.setFontSize(12.5);
    d.setTextColor(...NAVY);
    d.text(this.title, PAGE_W - M, 15.5, { align: "right" });
    if (this.subtitle) {
      d.setFont("helvetica", "normal");
      d.setFontSize(8);
      d.setTextColor(...GREY);
      d.text(this.subtitle, PAGE_W - M, 20, { align: "right" });
    }

    // double rule — navy + orange accent (rich, classic)
    d.setDrawColor(...NAVY);
    d.setLineWidth(0.65);
    d.line(M, 24, PAGE_W - M, 24);
    d.setDrawColor(...ORANGE);
    d.setLineWidth(0.45);
    d.line(M, 25.1, M + 24, 25.1);

    this.y = TOP_Y;
  }

  footerPass() {
    const d = this.doc;
    const n = d.getNumberOfPages();
    // Clean footer per the LearnX print standard: thin rule + page numbers only.
    // No brand name, tagline, site text or dates — the user asked for the
    // "Tutor Amma — Verified Learning Platform <date>" line to be gone.
    for (let i = 1; i <= n; i++) {
      d.setPage(i);
      d.setDrawColor(...FAINT);
      d.setLineWidth(0.25);
      d.line(M, FOOTER_LINE_Y, PAGE_W - M, FOOTER_LINE_Y);
      d.setFont("helvetica", "normal");
      d.setFontSize(7);
      d.setTextColor(...GREY);
      d.text(`Page ${i} of ${n}`, PAGE_W - M, FOOTER_LINE_Y + 3.6, { align: "right" });
    }
  }

  space(mm: number) {
    this.y += mm;
  }

  need(mm: number) {
    if (this.y + mm > BOTTOM_Y) {
      this.doc.addPage();
      this.pageHeader();
    }
  }

  /** Wrapped paragraph. Returns nothing; advances y. */
  text(
    s: string,
    opts: {
      size?: number;
      bold?: boolean;
      italic?: boolean;
      color?: [number, number, number];
      x?: number;
      width?: number;
      lineFactor?: number;
      after?: number;
      align?: "left" | "center" | "right";
    } = {}
  ) {
    const d = this.doc;
    const size = opts.size ?? 10;
    const x = opts.x ?? M;
    const width = opts.width ?? CW;
    const lh = size * (opts.lineFactor ?? 1.38) * 0.3528;
    d.setFont("helvetica", opts.bold ? "bold" : opts.italic ? "italic" : "normal");
    d.setFontSize(size);
    d.setTextColor(...(opts.color ?? INK));
    const lines: string[] = d.splitTextToSize(san(s) || "", width);
    for (const line of lines) {
      this.need(lh);
      d.setFont("helvetica", opts.bold ? "bold" : opts.italic ? "italic" : "normal");
      d.setFontSize(size);
      d.setTextColor(...(opts.color ?? INK));
      if (opts.align === "center") d.text(line, x + width / 2, this.y, { align: "center" });
      else if (opts.align === "right") d.text(line, x + width, this.y, { align: "right" });
      else d.text(line, x, this.y);
      this.y += lh;
    }
    if (opts.after) this.y += opts.after;
  }

  /** Section heading — small caps label with navy underline band. */
  heading(s: string, opts: { size?: number } = {}) {
    this.need(16);
    const size = opts.size ?? 11;
    this.space(3.5);
    this.text(s.toUpperCase(), { size, bold: true, color: NAVY, after: 1.6 });
    const d = this.doc;
    d.setDrawColor(...FAINT);
    d.setLineWidth(0.4);
    d.line(M, this.y - 1, PAGE_W - M, this.y - 1);
    this.space(2.4);
  }

  /** Bullet list. */
  bullets(items: string[], opts: { size?: number; numbered?: boolean; color?: [number, number, number] } = {}) {
    const size = opts.size ?? 9.5;
    let n = 1;
    for (const it of items) {
      const marker = opts.numbered ? `${n}.` : "•";
      this.text(`${marker}  ${it}`, { size, x: M + 2, width: CW - 6, color: opts.color });
      n++;
    }
  }

  /** Key/value meta row (label bold grey, value ink). */
  kv(label: string, value: string, opts: { x?: number; width?: number; size?: number } = {}) {
    const x = opts.x ?? M;
    const width = opts.width ?? CW;
    const size = opts.size ?? 9;
    const d = this.doc;
    const lh = size * 1.5 * 0.3528;
    this.need(lh);
    d.setFont("helvetica", "bold");
    d.setFontSize(size);
    d.setTextColor(...GREY);
    d.text(san(label), x, this.y);
    d.setFont("helvetica", "normal");
    d.setTextColor(...INK);
    const lines: string[] = d.splitTextToSize(san(value) || "—", width - 42);
    d.text(lines[0], x + 42, this.y);
    this.y += lh;
    for (let i = 1; i < lines.length; i++) {
      this.need(lh);
      d.setFont("helvetica", "normal");
      d.setFontSize(size);
      d.setTextColor(...INK);
      d.text(lines[i], x + 42, this.y);
      this.y += lh;
    }
  }

  /** Filled tinted box with wrapped text inside. */
  box(
    lines: { text: string; size?: number; bold?: boolean; color?: [number, number, number]; align?: "left" | "center" }[],
    opts: { fill?: [number, number, number]; border?: [number, number, number]; pad?: number; radius?: number } = {}
  ) {
    const d = this.doc;
    const pad = opts.pad ?? 3.5;
    const fill = opts.fill ?? SOFT;
    const border = opts.border ?? FAINT;
    // measure
    let innerH = 0;
    const prepared = lines.map((l) => {
      const size = l.size ?? 9.5;
      /* measure each line in its own font/size so multi-size boxes wrap correctly */
      d.setFont("helvetica", l.bold ? "bold" : "normal");
      d.setFontSize(size);
      const wrapped: string[] = d.splitTextToSize(san(l.text) || "", CW - pad * 2);
      innerH += wrapped.length * size * 1.42 * 0.3528;
      return { ...l, wrapped, size };
    });
    const h = innerH + pad * 2;
    this.need(h + 2);
    d.setFillColor(...fill);
    d.setDrawColor(...border);
    d.setLineWidth(0.3);
    d.roundedRect(M, this.y, CW, h, 2.2, 2.2, "FD");
    let ty = this.y + pad + 2;
    for (const l of prepared) {
      d.setFont("helvetica", l.bold ? "bold" : "normal");
      d.setFontSize(l.size);
      d.setTextColor(...(l.color ?? INK));
      for (const line of l.wrapped) {
        if (l.align === "center") d.text(line, PAGE_W / 2, ty, { align: "center" });
        else d.text(line, M + pad, ty);
        ty += l.size * 1.42 * 0.3528;
      }
    }
    this.y += h + 3.5;
  }

  /** Table via jspdf-autotable. */
  table(head: string[], body: (string | number)[][], opts: { startY?: number; widths?: number[]; fontSize?: number } = {}) {
    const d = this.doc;
    const autoTable = (globalThis as any).__ammaAutoTable;
    autoTable(d, {
      startY: this.y,
      head: [head],
      body: (body.length ? body : [head.map(() => "—")]).map((row) => row.map((cell) => san(String(cell ?? "")))),
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: opts.fontSize ?? 8.6,
        cellPadding: 2.1,
        lineColor: FAINT,
        lineWidth: 0.2,
        textColor: INK,
      },
      headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: "bold", fontSize: opts.fontSize ?? 8.6, halign: "left" },
      alternateRowStyles: { fillColor: [250, 251, 254] },
      columnStyles: opts.widths
        ? opts.widths.reduce((acc: Record<number, any>, w, i) => {
            acc[i] = { cellWidth: w };
            return acc;
          }, {})
        : undefined,
      /* page margins measured from the page EDGES — bottom margin must be
         the distance from the edge, not the content-area boundary */
      margin: { left: M, right: M, top: TOP_Y, bottom: PAGE_H - BOTTOM_Y },
      didDrawPage: () => {
        this.pageHeader();
      },
    });
    this.y = (d.lastAutoTable?.finalY ?? this.y) + 4;
  }

  save(filename: string) {
    this.footerPass();
    this.doc.save(filename);
  }
}

/* ----------------------------- boot helper ----------------------------- */
/** `logoOverride`: undefined → default brand logo · non-empty string → custom
 *  logo (aspect kept) · null → text-only school name (no image at all). */
async function boot(
  title: string,
  subtitle: string,
  opts: { logoOverride?: string | null } = {}
): Promise<Pdf> {
  const [{ jsPDF }, autoTableMod] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  (globalThis as any).__ammaAutoTable = autoTableMod.default;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  let logo: string | null;
  let logoSize: { w: number; h: number; format: string } | undefined;
  if (opts.logoOverride === null) {
    logo = null; // explicit text-only header
  } else if (opts.logoOverride) {
    const m = await measureImage(opts.logoOverride);
    if (m) {
      logo = opts.logoOverride;
      logoSize = m;
    } else {
      logo = await loadLogo(); // unreadable custom logo → graceful default
    }
  } else {
    logo = await loadLogo();
  }
  return new Pdf(doc, title, subtitle, logo, logoSize);
}

async function bootWithToast(
  title: string,
  subtitle: string,
  opts: { logoOverride?: string | null } = {}
): Promise<Pdf | null> {
  try {
    return await boot(title, subtitle, opts);
  } catch (e) {
    console.error("[pdf] boot failed:", e);
    const { toast } = await import("@/hooks/use-toast");
    toast({ title: "Could not prepare the PDF", description: "Please try again.", variant: "destructive" });
    return null;
  }
}

/* ============================================================
 * 1. QUESTION PAPER
 * ============================================================ */
export interface PaperQuestionPdf {
  q: string;
  options?: string[];
  answer: string;
  chapter: string;
  difficulty: string;
  cognitive: string;
  note?: string;
  image?: string; // data URL diagram attached to the question
}
export interface PaperSectionPdf {
  name: string;
  type: string;
  marksEach: number;
  questions: PaperQuestionPdf[];
}
/** Letterhead options for the printed paper (all optional — classic defaults). */
export interface PaperPdfHeader {
  template?: "classic" | "formal" | "minimal";
  schoolName?: string;
  examTitle?: string;
  logoDataUrl?: string; // custom logo · "" = no logo at all · undefined = default brand logo
  showStudentFields?: boolean;
}
export interface PaperPdf {
  title: string;
  board: string;
  grade: string;
  subject: string;
  chapters: string[];
  config: { totalMarks: number; durationMin: number };
  content: { instructions?: string; sections: PaperSectionPdf[] };
  answerKey?: { note?: string; sections: { name: string; answers: string[] }[] };
  provenance?: string;
  createdAt?: string;
  header?: PaperPdfHeader;
  /** Set label for multi-set papers (M1/M4): shown in the masthead + file name. */
  setLabel?: string;
  /** Artifact kind — drives the masthead title (paper | worksheet | assessment | homework | ppt). */
  kind?: "paper" | "worksheet" | "assessment" | "homework" | "ppt";
  /** Student name to pre-fill on a per-student shuffled copy (M3/M4). */
  studentName?: string;
}

/** Draws a question's diagram (PNG/JPEG data URLs only) centred on the page.
 *  Anything else is skipped silently — the paper never fails because of a bad image. */
async function drawQuestionImage(pdf: Pdf, d: any, dataUrl: string) {
  const type = dataUrl.startsWith("data:image/png")
    ? "PNG"
    : dataUrl.startsWith("data:image/jpeg")
      ? "JPEG"
      : null;
  if (!type) return;
  let iw = 0;
  let ih = 0;
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("decode failed"));
      i.src = dataUrl;
    });
    iw = img.naturalWidth;
    ih = img.naturalHeight;
  } catch {
    return;
  }
  if (!iw || !ih) return;
  let w = Math.min(110, CW - 16);
  let h = w * (ih / iw);
  if (h > 130) {
    h = 130;
    w = h * (iw / ih);
  }
  pdf.need(h + 4);
  d.addImage(dataUrl, type, (PAGE_W - w) / 2, pdf.y + 1.5, w, h);
  pdf.y += h + 3.5;
}

const KIND_TITLE: Record<string, string> = {
  paper: "Question Paper",
  worksheet: "Practice Worksheet",
  assessment: "Assessment",
  homework: "Homework Assignment",
  ppt: "Slide Outline",
};

export async function pdfQuestionPaper(paper: PaperPdf, opts: { includeAnswers?: boolean } = {}) {
  /* letterhead options (all optional — classic look is the default) */
  const h = paper.header ?? {};
  const template = h.template === "formal" || h.template === "minimal" ? h.template : "classic";
  const schoolName = (h.schoolName || "").trim() || BRAND.name;
  const examTitle = (h.examTitle || "").trim();
  const showStudentFields = h.showStudentFields !== false;
  const logoOverride = h.logoDataUrl === "" ? null : h.logoDataUrl || undefined;
  const kind = paper.kind && KIND_TITLE[paper.kind] ? paper.kind : "paper";
  const docTitle = KIND_TITLE[kind];

  const pdf = await bootWithToast(docTitle, `${paper.board} · ${paper.grade} · ${paper.subject}`, {
    logoOverride,
  });
  if (!pdf) return;
  const d = pdf.doc;

  /* --- exam masthead (template-aware) --- */
  if (template === "formal") {
    // board-exam letterhead: double-ruled box, logo left, centred institute block
    pdf.space(2);
    const flines: { t: string; size: number; bold: boolean; color: [number, number, number]; after: number }[] = [
      { t: schoolName, size: 15, bold: true, color: NAVY, after: 1.8 },
    ];
    if (examTitle) flines.push({ t: examTitle, size: 10, bold: false, color: INK, after: 1.6 });
    flines.push({ t: `${paper.board}  ·  ${paper.grade}  ·  ${paper.subject}`, size: 8.5, bold: false, color: GREY, after: 0 });
    const lh = (s: number) => s * 1.4 * 0.3528;
    const padV = 6;
    const boxH = padV * 2 + flines.reduce((a, l) => a + lh(l.size) + l.after, 0);
    pdf.need(boxH + 10);
    const by = pdf.y;
    d.setDrawColor(...NAVY);
    d.setLineWidth(0.8);
    d.rect(M - 2, by, CW + 4, boxH);
    d.setDrawColor(...ORANGE);
    d.setLineWidth(0.3);
    d.rect(M - 2 + 1.4, by + 1.4, CW + 4 - 2.8, boxH - 2.8);
    if (pdf.logo) {
      d.addImage(pdf.logo, pdf.logoFormat, M + 3, by + boxH / 2 - pdf.logoH / 2, pdf.logoW, pdf.logoH);
    }
    let ty = by + padV;
    for (const l of flines) {
      d.setFont("helvetica", l.bold ? "bold" : "normal");
      d.setFontSize(l.size);
      d.setTextColor(...l.color);
      const wrapW = pdf.logo ? CW - 34 : CW - 12;
      const wrapped: string[] = d.splitTextToSize(san(l.t), wrapW);
      for (const wl of wrapped) {
        ty += lh(l.size);
        d.text(wl, PAGE_W / 2, ty, { align: "center" });
      }
      ty += l.after;
    }
    pdf.y = by + boxH + 4;
  } else if (template === "minimal") {
    // clean modern: letter-spaced school, big title, orange rule, inline meta
    pdf.space(2);
    pdf.need(10);
    d.setFont("helvetica", "bold");
    d.setFontSize(9);
    d.setTextColor(...GREY);
    d.text(san(schoolName.toUpperCase()), PAGE_W / 2, pdf.y + 3, { align: "center", charSpace: 1.1 });
    pdf.y += 7;
    pdf.text(examTitle || paper.title || `${paper.subject} — ${paper.grade}`, {
      size: 15, bold: true, color: NAVY, align: "center", width: CW, x: M, after: 1.6,
    });
    pdf.text(`${paper.subject} — ${paper.grade}`, { size: 9.5, color: GREY, align: "center", width: CW, x: M, after: 2.4 });
    d.setDrawColor(...ORANGE);
    d.setLineWidth(0.9);
    d.line(PAGE_W / 2 - 12, pdf.y, PAGE_W / 2 + 12, pdf.y);
    pdf.y += 4.5;
    pdf.need(6);
    d.setFont("helvetica", "bold");
    d.setFontSize(9.5);
    d.setTextColor(...NAVY);
    d.text(
      `Time: ${paper.config.durationMin} minutes        Maximum Marks: ${paper.config.totalMarks}`,
      PAGE_W / 2,
      pdf.y + 3,
      { align: "center" }
    );
    pdf.y += 8;
  } else {
    // classic (default) — the rich Tutor Amma banner, school-name aware
    pdf.space(2);
    const kindWord = kind === "paper" ? "EXAMINATION" : docTitle.toUpperCase();
    pdf.text(`${san(schoolName.toUpperCase())} ${kindWord}`, { size: 10, bold: true, color: ORANGE, align: "center", width: CW, x: M, after: 1.4 });
    pdf.text(`${paper.subject} — ${paper.grade}`, { size: 16, bold: true, color: NAVY, align: "center", width: CW, x: M, after: 1.2 });
    pdf.text(examTitle || paper.title || paper.board, { size: 9.5, color: GREY, align: "center", width: CW, x: M, after: 2.6 });
  }

  // meta strip: time / marks (classic + formal share the tinted strip)
  if (template !== "minimal") {
    const stripY = pdf.y;
    d.setFillColor(...SOFT_BLUE);
    d.setDrawColor(...FAINT);
    d.setLineWidth(0.3);
    d.roundedRect(M, stripY, CW, 9, 2, 2, "FD");
    d.setFont("helvetica", "bold");
    d.setFontSize(9.5);
    d.setTextColor(...NAVY);
    d.text(`Time Allowed: ${paper.config.durationMin} minutes`, M + 8, stripY + 5.8);
    d.text(`Maximum Marks: ${paper.config.totalMarks}`, PAGE_W - M - 8, stripY + 5.8, { align: "right" });
    if (paper.setLabel) {
      // set tag centred in the strip — distinct for each anti-cheating variant
      const label = paper.setLabel.toUpperCase();
      const tw = d.getTextWidth(label) + 8;
      d.setFillColor(...ORANGE);
      d.roundedRect(PAGE_W / 2 - tw / 2, stripY + 1.7, tw, 5.6, 1.2, 1.2, "F");
      d.setFont("helvetica", "bold");
      d.setFontSize(8);
      d.setTextColor(...WHITE);
      d.text(label, PAGE_W / 2, stripY + 5.5, { align: "center" });
    }
    pdf.y = stripY + 9 + 5;
  }

  if (showStudentFields) {
    pdf.text(
      paper.studentName
        ? `Name: ${paper.studentName}     Roll No: ____________     Date: ____________`
        : "Name: ______________________________     Roll No: ____________     Date: ____________",
      {
        size: 9.5,
        color: INK,
        after: 4,
      }
    );
  }

  if (paper.content.instructions) {
    pdf.box([
      { text: "General Instructions", size: 9, bold: true, color: NAVY },
      { text: paper.content.instructions, size: 9 },
    ]);
  }

  /* --- sections & questions --- */
  let qNo = 0;
  for (const s of paper.content.sections ?? []) {
    pdf.need(20);
    const d2 = pdf.doc;
    const bandY = pdf.y;
    d2.setFillColor(...NAVY);
    d2.roundedRect(M, bandY, CW, 8, 1.6, 1.6, "F");
    d2.setFont("helvetica", "bold");
    d2.setFontSize(10);
    d2.setTextColor(...WHITE);
    d2.text(san(s.name), M + 4, bandY + 5.4);
    d2.setFontSize(8.5);
    d2.setTextColor(255, 217, 174);
    d2.text(`${s.marksEach} mark${s.marksEach > 1 ? "s" : ""} each`, PAGE_W - M - 4, bandY + 5.4, { align: "right" });
    pdf.y = bandY + 8 + 5;

    for (const q of s.questions ?? []) {
      qNo++;
      const qSize = 10;
      // reserve room on the right for the marks pill so wrapped text never collides with it
      const qW = CW - 26;
      /* measure with the SAME font the text renders in — splitTextToSize uses the
         current font, and a stale smaller one under-measures widths so long
         lines overrun the marks gutter (Q10-type overlap) */
      d.setFont("helvetica", "bold");
      d.setFontSize(qSize);
      const lines: string[] = d.splitTextToSize(san(`${qNo}.  ${q.q}`), qW);
      const qH = lines.length * qSize * 1.4 * 0.3528;
      d.setFont("helvetica", "italic");
      d.setFontSize(8);
      const noteLines = q.note ? d.splitTextToSize(san(q.note), qW - 4) : [];
      const noteH = noteLines.length * 8 * 1.35 * 0.3528;
      pdf.need(Math.max(qH, 6) + (q.options?.length ? 12 : 0) + noteH + 4);

      // question text (wrapped) with marks right-aligned
      d.setFont("helvetica", "bold");
      d.setFontSize(qSize);
      d.setTextColor(...INK);
      let ty = pdf.y;
      for (const line of lines) {
        d.setFont("helvetica", "bold");
        d.setFontSize(qSize);
        d.setTextColor(...INK);
        d.text(line, M + 2, ty);
        ty += qSize * 1.4 * 0.3528;
      }
      // marks pill
      d.setFont("helvetica", "bold");
      d.setFontSize(9);
      d.setTextColor(...ROYAL);
      d.text(`[${s.marksEach}]`, PAGE_W - M - 1, pdf.y);
      pdf.y = ty + 1.2;

      // attached diagram (before the options)
      if (q.image) {
        await drawQuestionImage(pdf, d, q.image);
      }

      if (q.options?.length) {
        // options in 2 columns (row-major: A B / C D), full text on wrap
        const colW = (CW - 20) / 2;
        const letters = ["A", "B", "C", "D", "E", "F"];
        const lineH = 9.5 * 1.4 * 0.3528;
        let rowY = pdf.y;
        let col = 0;
        let rowLines = 1;
        for (let oi = 0; oi < q.options.length; oi++) {
          d.setFont("helvetica", "bold");
          d.setFontSize(9.5);
          d.setTextColor(...GREY);
          const x = M + 9 + col * (colW + 6);
          d.text(`(${letters[oi]})`, x, rowY);
          d.setFont("helvetica", "normal");
          d.setTextColor(...INK);
          const oLines: string[] = d.splitTextToSize(san(q.options[oi]), colW - 10);
          oLines.forEach((ln, li) => d.text(ln, x + 8, rowY + li * lineH));
          rowLines = Math.max(rowLines, oLines.length);
          col++;
          if (col === 2) {
            col = 0;
            rowY += rowLines * lineH + 1.6;
            rowLines = 1;
          }
        }
        if (col !== 0) rowY += rowLines * lineH + 1.6;
        pdf.y = rowY + 1;
      }

      if (q.note) {
        d.setFont("helvetica", "italic");
        d.setFontSize(8);
        d.setTextColor(...ORANGE);
        let ny = pdf.y;
        for (const nl of noteLines) {
          d.text(nl, M + 9, ny);
          ny += 8 * 1.35 * 0.3528;
        }
        pdf.y = ny + 1;
      }
      pdf.space(2.2);
    }
    pdf.space(2.5);
  }

  /* --- chapters covered --- */
  if (paper.chapters?.length) {
    pdf.text(`Syllabus covered: ${paper.chapters.join(" · ")}`, { size: 8.5, color: GREY, after: 2 });
  }

  /* --- answer key --- */
  if (opts.includeAnswers && paper.answerKey?.sections?.length) {
    pdf.doc.addPage();
    pdf.pageHeader();
    pdf.text("ANSWER KEY — PRIVATE TO TEACHER", { size: 11, bold: true, color: [192, 51, 66], after: 1.6 });
    pdf.text(
      `Do not distribute to students. Generated for marking purposes only.${paper.setLabel ? ` — ${paper.setLabel}` : ""}`,
      { size: 8.5, color: GREY, after: 4 }
    );
    let keyNo = 0; // matches the continuous question numbering on the printed paper
    for (const s of paper.content.sections ?? []) {
      const ks = paper.answerKey.sections.find((k) => k.name === s.name);
      const rows = (s.questions ?? []).map((q, i) => {
        keyNo++;
        const a = ks?.answers?.[i] ?? q.answer ?? "—";
        const raw = String(a);
        const ans = s.type === "MCQ" ? raw : raw.replace(/\s+/g, " ");
        return [`Q${keyNo}`, ans.length > 220 ? `${ans.slice(0, 217)}…` : ans, q.chapter, q.difficulty];
      });
      pdf.need(14);
      pdf.text(s.name, { size: 10, bold: true, color: NAVY, after: 1.8 });
      pdf.table(["No.", "Answer / marking scheme", "Chapter", "Level"], rows, { widths: [12, 108, 42, 20] });
    }
    if (paper.answerKey.note) {
      pdf.text(paper.answerKey.note, { size: 8.5, color: GREY });
    }
  }

  const setSuffix = paper.setLabel ? `_${paper.setLabel.replace(/\s+/g, "")}` : "";
  const kindPrefix = kind === "paper" ? "Paper" : KIND_TITLE[kind].replace(/\s+/g, "");
  pdf.save(`TutorAmma_${kindPrefix}_${slug(paper.subject)}_${slug(paper.grade)}${setSuffix}${paper.studentName ? `_${slug(paper.studentName)}` : ""}.pdf`);
}

/* ============================================================
 * 2. LESSON PLAN
 * ============================================================ */
export interface LessonPlanPdf {
  title: string;
  board: string;
  grade: string;
  subject: string;
  chapterNames: string[];
  difficulty: string;
  periods: number;
  periodMinutes: number;
  slideCount: number;
  provenance: string;
  version: number;
  createdAt: string;
  content: {
    learningObjectives?: string[];
    successCriteria?: string[];
    materials?: string[];
    stages?: {
      stage: string;
      durationMinutes: number;
      title: string;
      teacherScript?: string;
      analogy?: string;
      boardWork?: string[];
      workedExamples?: { problem: string; solution: string }[];
      questions?: { q: string; expected: string }[];
      differentiation?: string;
    }[];
    homework?: { tasks?: string[]; expectedOutput?: string };
    assessment?: { formativeChecks?: string[]; evidence?: string; adjustment?: string };
    sourceRefs?: string[];
  };
}

/* tinted 5E containers — mirrors the app's card colours (LearnX lesson-plan arch §10) */
const TINT_EXPLAIN: [number, number, number] = [234, 242, 254]; // pale blue — explanation to say aloud
const TINT_AMBER: [number, number, number] = [253, 244, 230]; // warm amber — analogy / differentiation
const TINT_BOARD: [number, number, number] = [252, 234, 234]; // pale red — board work / diagram

/** Draws a tinted, bordered container with a small caps label and wrapped body text. */
function tintBox(
  pdf: Pdf,
  d: any,
  label: string,
  body: string,
  fill: [number, number, number],
  accent: [number, number, number]
) {
  const size = 9;
  /* measure with the render font (normal 9) — a stale bold/small font skews wraps */
  d.setFont("helvetica", "normal");
  d.setFontSize(size);
  const lines: string[] = d.splitTextToSize(san(body), CW - 14);
  const lh = size * 1.45 * 0.3528;
  const h = 6 + lh + lines.length * lh + 3;
  pdf.need(h + 2);
  const by = pdf.y;
  d.setFillColor(...fill);
  d.setDrawColor(...accent);
  d.setLineWidth(0.35);
  d.roundedRect(M, by, CW, h, 2, 2, "FD");
  d.setFont("helvetica", "bold");
  d.setFontSize(6.8);
  d.setTextColor(...accent);
  d.text(label.toUpperCase(), M + 5, by + 4.4, { charSpace: 0.4 });
  d.setFont("helvetica", "normal");
  d.setFontSize(size);
  d.setTextColor(...INK);
  let ty = by + 6 + lh;
  for (const l of lines) {
    d.text(l, M + 5, ty);
    ty += lh;
  }
  pdf.y = by + h + 3;
}

export async function pdfLessonPlan(plan: LessonPlanPdf) {
  const pdf = await bootWithToast("Lesson Plan", `${plan.board} · ${plan.grade} · ${plan.subject}`);
  if (!pdf) return;
  const d = pdf.doc;
  const c = plan.content;

  pdf.text(plan.title, { size: 16, bold: true, color: NAVY, after: 1.6 });
  pdf.text(
    `${plan.board} · ${plan.grade} · ${plan.subject}   |   ${plan.difficulty} · ${plan.periods} × ${plan.periodMinutes} min · ${plan.slideCount} slides`,
    { size: 9, color: GREY, after: 1.4 }
  );
  pdf.text(`Version ${plan.version} · ${plan.provenance} · prepared ${fmtDate(plan.createdAt)}`, { size: 8.5, color: GREY, after: 4 });

  if (plan.chapterNames?.length) {
    pdf.kv("Chapters", plan.chapterNames.join(", "), { size: 9 });
    pdf.space(1);
  }

  if (c.learningObjectives?.length) {
    pdf.heading("Learning objectives");
    pdf.bullets(c.learningObjectives, { numbered: true });
    pdf.space(2);
  }
  if (c.successCriteria?.length) {
    pdf.heading("Success criteria");
    pdf.bullets(c.successCriteria);
    pdf.space(2);
  }
  if (c.materials?.length) {
    pdf.heading("Materials");
    pdf.text(c.materials.join("  ·  "), { size: 9.5 });
    pdf.space(2);
  }

  for (const s of c.stages ?? []) {
    pdf.need(26);
    const bandY = pdf.y;
    d.setFillColor(...NAVY);
    d.roundedRect(M, bandY, CW, 8, 1.6, 1.6, "F");
    d.setFont("helvetica", "bold");
    d.setFontSize(10);
    d.setTextColor(...WHITE);
    d.text(san(`${s.stage} — ${s.title}`), M + 4, bandY + 5.4);
    d.setFontSize(8.5);
    d.setTextColor(255, 217, 174);
    d.text(`${s.durationMinutes} min`, PAGE_W - M - 4, bandY + 5.4, { align: "right" });
    pdf.y = bandY + 8 + 4.6;

    if (s.teacherScript) {
      tintBox(pdf, d, "Explanation to say aloud", s.teacherScript, TINT_EXPLAIN, ROYAL);
    }
    if (s.analogy) {
      tintBox(pdf, d, "Analogy to use", s.analogy, TINT_AMBER, ORANGE);
    }
    if (s.boardWork?.length) {
      tintBox(pdf, d, "Board work / diagram", s.boardWork.map((w) => `- ${w}`).join("\n"), TINT_BOARD, [192, 51, 66]);
    }
    for (const w of s.workedExamples ?? []) {
      pdf.need(18);
      pdf.text(w.problem, { size: 9.5, bold: true, color: ROYAL, x: M + 3, width: CW - 6, after: 1 });
      pdf.text(w.solution, { size: 9, x: M + 3, width: CW - 6, color: INK, after: 2.6 });
    }
    if (s.questions?.length) {
      pdf.table(
        ["Check question", "Expected answer"],
        s.questions.map((q) => [q.q, q.expected]),
        { widths: [91, 91], fontSize: 8.4 }
      );
    }
    if (s.differentiation) {
      tintBox(pdf, d, "Differentiation — for students who need extra support", s.differentiation, TINT_AMBER, ORANGE);
    }
    pdf.space(2.5);
  }

  if (c.homework?.tasks?.length) {
    pdf.heading("Homework");
    pdf.bullets(c.homework.tasks, { size: 9.5 });
    if (c.homework.expectedOutput) pdf.text(`Expected output: ${c.homework.expectedOutput}`, { size: 8.8, color: GREY });
    pdf.space(2);
  }
  if (c.assessment) {
    pdf.heading("Assessment for learning");
    if (c.assessment.formativeChecks?.length) pdf.bullets(c.assessment.formativeChecks, { size: 9.5 });
    if (c.assessment.evidence) pdf.text(`Evidence: ${c.assessment.evidence}`, { size: 8.8, color: GREY });
    if (c.assessment.adjustment) pdf.text(`If shaky: ${c.assessment.adjustment}`, { size: 8.8, color: GREY });
  }
  if (c.sourceRefs?.length) {
    pdf.space(3);
    pdf.text(`Grounded in: ${c.sourceRefs.join(" · ")}`, { size: 8, color: GREY, italic: true });
  }

  pdf.save(`TutorAmma_LessonPlan_${slug(plan.subject)}_${slug(plan.title)}.pdf`);
}

/* ============================================================
 * 3. INVOICE / RECEIPT
 * ============================================================ */
export interface InvoicePdf {
  invoiceNo: string;
  issuedAt: string;
  status: string;
  billedTo: string;
  billedEmail?: string;
  description: string;
  mode?: string;
  method?: string;
  sessionFee: number;
  platformFee: number;
  total: number;
  currencyNote?: string;
}

export async function pdfInvoice(inv: InvoicePdf) {
  const pdf = await bootWithToast("Invoice", `No. ${inv.invoiceNo}`);
  if (!pdf) return;
  const d = pdf.doc;

  pdf.space(2);
  pdf.kv("Invoice number", inv.invoiceNo, { size: 10 });
  pdf.kv("Issued on", fmtDate(inv.issuedAt), { size: 10 });
  pdf.kv("Billed to", inv.billedTo + (inv.billedEmail ? ` (${inv.billedEmail})` : ""), { size: 10 });
  pdf.kv("Payment status", inv.status.replace(/_/g, " ").toUpperCase(), { size: 10 });
  pdf.space(4);

  pdf.table(
    ["Description", "Mode", "Method", "Session fee", "Platform fee", "Total"],
    [[inv.description, inv.mode ?? "—", inv.method ?? "—", money(inv.sessionFee), money(inv.platformFee), money(inv.total)]],
    { widths: [62, 20, 24, 26, 26, 24] }
  );

  // totals block (right-aligned)
  pdf.need(34);
  const bx = PAGE_W - M - 78;
  const rows: [string, string][] = [
    ["Session fee", money(inv.sessionFee)],
    ["Platform fee", money(inv.platformFee)],
    ["Total paid", money(inv.total)],
  ];
  let by = pdf.y;
  for (const [k, v] of rows) {
    d.setFont("helvetica", "normal");
    d.setFontSize(9.5);
    d.setTextColor(...GREY);
    d.text(k, bx, by);
    d.setFont("helvetica", "bold");
    d.setTextColor(...INK);
    d.text(v, PAGE_W - M, by, { align: "right" });
    by += 6;
  }
  d.setFillColor(...NAVY);
  d.setDrawColor(...NAVY);
  d.setLineWidth(0.3);
  d.roundedRect(bx - 3, by - 1, 81, 9, 1.5, 1.5, "F");
  d.setFont("helvetica", "bold");
  d.setFontSize(10);
  d.setTextColor(...WHITE);
  d.text("TOTAL PAID", bx, by + 5.2);
  d.text(money(inv.total), PAGE_W - M - 1, by + 5.2, { align: "right" });
  pdf.y = by + 14;

  pdf.box(
    [
      {
        text:
          inv.status === "released"
            ? "Funds have been released from escrow to the tutor after a completed, verified session."
            : "This payment is protected by Tutor Amma escrow — funds are held safely and only released after the session is completed and verified.",
        size: 8.8,
      },
    ],
    { fill: SOFT_BLUE }
  );
  pdf.text("Thank you for learning with Tutor Amma.", { size: 9, italic: true, color: GREY, align: "center", width: CW, x: M });

  pdf.save(`TutorAmma_Invoice_${slug(inv.invoiceNo)}.pdf`);
}

/* ============================================================
 * 4. PROGRESS REPORT (parent)
 * ============================================================ */
export interface ProgressReportPdf {
  childName: string;
  grade: string;
  board: string;
  rangeFrom: string;
  rangeTo: string;
  label: string;
  stats: { sessionsCompleted: number; assessments: number; homeworkGraded: number };
  strengths: string[];
  focusAreas: string[];
  nextSteps: string[];
  body: string;
}

export async function pdfProgressReport(rep: ProgressReportPdf) {
  const pdf = await bootWithToast("Progress Report", rep.childName);
  if (!pdf) return;
  const d = pdf.doc;

  pdf.space(2);
  pdf.text(rep.childName, { size: 16, bold: true, color: NAVY, after: 1.4 });
  pdf.text(`${rep.grade} · ${rep.board} — reporting period ${fmtDate(rep.rangeFrom)} to ${fmtDate(rep.rangeTo)}`, {
    size: 9,
    color: GREY,
    after: 4,
  });

  // stats strip
  const stripY = pdf.y;
  const cells = [
    ["Sessions completed", String(rep.stats.sessionsCompleted)],
    ["Assessments taken", String(rep.stats.assessments)],
    ["Homework graded", String(rep.stats.homeworkGraded)],
  ];
  const cw = (CW - 8) / 3;
  cells.forEach(([label, value], i) => {
    const x = M + i * (cw + 4);
    d.setFillColor(...SOFT);
    d.setDrawColor(...FAINT);
    d.setLineWidth(0.3);
    d.roundedRect(x, stripY, cw, 16, 2, 2, "FD");
    d.setFont("helvetica", "bold");
    d.setFontSize(13);
    d.setTextColor(...NAVY);
    d.text(value, x + cw / 2, stripY + 7, { align: "center" });
    d.setFont("helvetica", "normal");
    d.setFontSize(7.5);
    d.setTextColor(...GREY);
    d.text(label.toUpperCase(), x + cw / 2, stripY + 12, { align: "center" });
  });
  pdf.y = stripY + 16 + 6;

  if (rep.strengths?.length) {
    pdf.heading("Strengths");
    pdf.bullets(rep.strengths, { size: 9.5 });
    pdf.space(2);
  }
  if (rep.focusAreas?.length) {
    pdf.heading("Focus areas");
    pdf.bullets(rep.focusAreas, { size: 9.5 });
    pdf.space(2);
  }
  if (rep.nextSteps?.length) {
    pdf.heading("Recommended next steps");
    pdf.bullets(rep.nextSteps, { size: 9.5 });
    pdf.space(2);
  }

  if (rep.body) {
    pdf.heading("Teacher's narrative");
    // markdown-lite — same parsing as the on-screen ReportBody
    const paragraphs = rep.body
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    for (const p of paragraphs) {
      const lines = p.split("\n").map((l) => l.trim()).filter(Boolean);
      const bullets = lines.filter((l) => /^[-•*]\s+/.test(l));
      if (bullets.length > 0 && bullets.length === lines.length) {
        pdf.bullets(bullets.map((b) => b.replace(/^[-•*]\s+/, "")), { size: 9.5 });
      } else {
        pdf.text(lines.join(" "), { size: 9.5 });
      }
      pdf.space(1.6);
    }
  }

  pdf.space(4);
  pdf.need(16);
  d.setDrawColor(...FAINT);
  d.setLineWidth(0.3);
  d.line(M, pdf.y, PAGE_W - M, pdf.y);
  pdf.space(9);
  d.setFont("helvetica", "normal");
  d.setFontSize(8.5);
  d.setTextColor(...GREY);
  d.text("Tutor signature ______________________", M, pdf.y);
  d.text("Parent signature ______________________", PAGE_W - M, pdf.y, { align: "right" });

  pdf.save(`TutorAmma_ProgressReport_${slug(rep.childName)}.pdf`);
}

/* ============================================================
 * 5. EARNINGS STATEMENT (tutor)
 * ============================================================ */
export interface EarningsPdf {
  tutorName: string;
  totals: { lifetime: number; thisMonth: number; escrowHeld: number; pendingPayouts: number; walletAvailable: number };
  series: { label: string; amount: number }[];
  payouts: { amount: number; status: string; bankMask: string; requestedAt: string; paidAt: string | null }[];
}

export async function pdfEarnings(st: EarningsPdf) {
  const pdf = await bootWithToast("Earnings Statement", st.tutorName);
  if (!pdf) return;

  pdf.space(2);
  pdf.kv("Tutor", st.tutorName, { size: 10 });
  pdf.kv("Statement date", fmtDate(new Date()), { size: 10 });
  pdf.space(4);

  pdf.heading("Summary");
  pdf.table(
    ["Metric", "Amount"],
    [
      ["Lifetime earnings", money(st.totals.lifetime)],
      ["This month", money(st.totals.thisMonth)],
      ["Held in escrow", money(st.totals.escrowHeld)],
      ["Payouts pending", money(st.totals.pendingPayouts)],
      ["Wallet available", money(st.totals.walletAvailable)],
    ],
    { widths: [120, 62] }
  );

  if (st.series?.length) {
    pdf.heading("Weekly net earnings");
    pdf.table(
      ["Week", "Net amount"],
      st.series.map((s) => [s.label, money(s.amount)]),
      { widths: [120, 62] }
    );
  }

  if (st.payouts?.length) {
    pdf.heading("Payout history");
    pdf.table(
      ["Requested", "Bank", "Amount", "Status", "Paid on"],
      st.payouts.map((p) => [fmtDate(p.requestedAt), p.bankMask, money(p.amount), p.status, p.paidAt ? fmtDate(p.paidAt) : "—"]),
      { widths: [30, 44, 32, 30, 46] }
    );
  }

  pdf.save(`TutorAmma_Earnings_${slug(st.tutorName)}.pdf`);
}

/* ============================================================
 * 6. ATTENDANCE REPORT (live class)
 * ============================================================ */
export interface AttendancePdf {
  className: string;
  subject: string;
  tutorName: string;
  scheduledAt: string;
  endedAt?: string | null;
  attendees: { name: string; role: string; joinedAt: string; leftAt?: string | null; durationMin: number; status: string }[];
}

export async function pdfAttendance(rep: AttendancePdf) {
  const pdf = await bootWithToast("Live Class Attendance", rep.className);
  if (!pdf) return;

  pdf.space(2);
  pdf.kv("Class", rep.className, { size: 10 });
  pdf.kv("Subject", rep.subject, { size: 10 });
  pdf.kv("Host", rep.tutorName, { size: 10 });
  pdf.kv("Scheduled", fmtDateTime(rep.scheduledAt), { size: 10 });
  if (rep.endedAt) pdf.kv("Ended", fmtDateTime(rep.endedAt), { size: 10 });
  pdf.kv("Attended", `${rep.attendees.length} participant(s)`, { size: 10 });
  pdf.space(4);

  pdf.table(
    ["Participant", "Role", "Joined", "Left", "Duration", "Status"],
    rep.attendees.map((a) => [
      a.name,
      a.role,
      fmtDateTime(a.joinedAt),
      a.leftAt ? fmtDateTime(a.leftAt) : "—",
      `${a.durationMin} min`,
      a.status,
    ]),
    { widths: [46, 22, 34, 34, 20, 26] }
  );

  pdf.save(`TutorAmma_Attendance_${slug(rep.className)}.pdf`);
}

/* ============================================================
 * 7. TIMETABLE (weekly grid)
 * ============================================================ */
export interface TimetablePdf {
  ownerName: string;
  weekLabel: string;
  blocks: { day: number; startMin: number; endMin: number; subject: string; mode: string; tutor: string; title: string }[];
}

export async function pdfTimetable(tt: TimetablePdf) {
  const pdf = await bootWithToast("Weekly Timetable", tt.weekLabel);
  if (!pdf) return;

  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  pdf.space(2);
  pdf.kv("Student", tt.ownerName, { size: 10 });
  pdf.kv("Week", tt.weekLabel, { size: 10 });
  pdf.space(4);

  const rows: (string | number)[][] = [];
  for (let day = 0; day < 7; day++) {
    const dayBlocks = tt.blocks.filter((b) => b.day === day).sort((a, b) => a.startMin - b.startMin);
    if (!dayBlocks.length) continue;
    for (const b of dayBlocks) {
      const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      rows.push([DAYS[day], `${fmt(b.startMin)}–${fmt(b.endMin)}`, b.subject, b.title, b.tutor, b.mode]);
    }
  }
  if (!rows.length) rows.push(["—", "—", "No sessions scheduled this week", "—", "—", "—"]);

  pdf.table(["Day", "Time", "Subject", "Session", "Teacher", "Mode"], rows, { widths: [24, 22, 34, 44, 34, 20] });
  pdf.save(`TutorAmma_Timetable_${slug(tt.ownerName)}.pdf`);
}

/* ============================================================
 * 8. ADMIN OPERATIONS REPORT
 * ============================================================ */
export interface AdminReportPdf {
  title: string;
  periodLabel: string;
  kpis: { label: string; value: string }[];
  sections: { heading: string; head: string[]; rows: (string | number)[][] }[];
}

export async function pdfAdminReport(rep: AdminReportPdf) {
  const pdf = await bootWithToast(rep.title, rep.periodLabel);
  if (!pdf) return;

  pdf.space(2);
  pdf.kv("Report", rep.title, { size: 10 });
  pdf.kv("Period", rep.periodLabel, { size: 10 });
  pdf.space(4);

  pdf.heading("Key indicators");
  pdf.table(
    ["Indicator", "Value"],
    rep.kpis.map((k) => [k.label, k.value]),
    { widths: [120, 62] }
  );

  for (const s of rep.sections) {
    pdf.heading(s.heading);
    pdf.table(s.head, s.rows);
  }

  pdf.save(`TutorAmma_${slug(rep.title)}.pdf`);
}

/* ============================================================
 * CSV export (Excel-friendly)
 * ============================================================ */
export function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))];
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

"use client";

/**
 * Branded Excel export (Tutor Amma spec §27 — Excel standard).
 *
 *  · logo top-left, organisation name + sub-line top-right, accent underline
 *  · report title and filter line, styled navy header row, banded rows,
 *    borders, number/date formats, live SUM/AVERAGE total row
 *  · frozen header row, auto-filter, sensible widths
 *  · print setup: A4, fit to one page wide, repeat header row, footer
 *    "Page x of y" + confidential text — no sheet name or file path
 *
 * Generated in the browser with exceljs (loaded on demand), so the request
 * never round-trips through the worker and nothing from the site chrome leaks
 * into the file.
 */

export interface ExcelColumn {
  header: string;
  key: string;
  width?: number;
  type?: "text" | "number" | "money" | "percent" | "date";
}

export interface ExcelReport {
  fileName: string;
  title: string;
  subtitle?: string;
  columns: ExcelColumn[];
  rows: Record<string, string | number | Date | null | undefined>[];
  /** per-column total: a label string, or "SUM" / "AVERAGE" for a live formula */
  totals?: Record<string, string>;
  orgName?: string;
  orgLine?: string;
  footerText?: string;
}

const NAVY = "FF142366";
const ORANGE = "FFF26B1D";
const BAND = "FFF3F6FB";
const BORDER = "FFD8E0ED";

async function logoBase64(): Promise<string | null> {
  try {
    const res = await fetch("/brand/logo-full.png");
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function colLetter(n: number): string {
  let s = "";
  for (n += 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

export async function exportBrandedExcel(r: ExcelReport): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = r.orgName ?? "Tutor Amma";
  wb.created = new Date();
  const ws = wb.addWorksheet("Report", {
    views: [{ state: "frozen", ySplit: 6, showGridLines: false }],
    pageSetup: {
      paperSize: 9, // A4
      orientation: r.columns.length > 6 ? "landscape" : "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.2, footer: 0.3 },
      printTitlesRow: "6:6",
    },
    headerFooter: {
      oddFooter: `&L&8${(r.footerText ?? "Confidential · Tutor Amma").replace(/&/g, "&&")}&R&8Page &P of &N`,
    },
  });

  const last = colLetter(r.columns.length - 1);
  ws.columns = r.columns.map((c) => ({ key: c.key, width: c.width ?? Math.max(12, c.header.length + 4) }));

  /* rows 1-2: brand band */
  ws.getRow(1).height = 30;
  ws.getRow(2).height = 16;
  const logo = await logoBase64();
  if (logo) {
    const id = wb.addImage({ base64: logo, extension: "png" });
    ws.addImage(id, { tl: { col: 0, row: 0 }, ext: { width: 170, height: 32 } });
  }
  ws.mergeCells(`${colLetter(Math.max(1, r.columns.length - 3))}1:${last}1`);
  const org = ws.getCell(`${colLetter(Math.max(1, r.columns.length - 3))}1`);
  org.value = r.orgName ?? "Tutor Amma — Key to Success";
  org.font = { bold: true, size: 13, color: { argb: NAVY } };
  org.alignment = { horizontal: "right", vertical: "middle" };
  ws.mergeCells(`${colLetter(Math.max(1, r.columns.length - 3))}2:${last}2`);
  const line = ws.getCell(`${colLetter(Math.max(1, r.columns.length - 3))}2`);
  line.value = r.orgLine ?? "Verified tutors · Safe home tuition · India";
  line.font = { size: 9, color: { argb: "FF57627F" } };
  line.alignment = { horizontal: "right" };
  /* accent rule */
  for (let c = 1; c <= r.columns.length; c++) ws.getCell(2, c).border = { bottom: { style: "medium", color: { argb: ORANGE } } };

  /* rows 3-4: title + filter line */
  ws.mergeCells(`A3:${last}3`);
  ws.getCell("A3").value = r.title;
  ws.getCell("A3").font = { bold: true, size: 15, color: { argb: NAVY } };
  ws.getRow(3).height = 24;
  ws.mergeCells(`A4:${last}4`);
  ws.getCell("A4").value = r.subtitle ?? `Generated ${new Date().toLocaleString("en-IN")}`;
  ws.getCell("A4").font = { size: 9.5, italic: true, color: { argb: "FF57627F" } };

  /* row 6: header */
  const header = ws.getRow(6);
  r.columns.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    cell.alignment = { vertical: "middle", horizontal: c.type && c.type !== "text" ? "right" : "left", wrapText: true };
    cell.border = { top: { style: "thin", color: { argb: NAVY } }, bottom: { style: "thin", color: { argb: NAVY } } };
  });
  header.height = 22;

  /* data */
  r.rows.forEach((row, ri) => {
    const xr = ws.getRow(7 + ri);
    r.columns.forEach((c, ci) => {
      const cell = xr.getCell(ci + 1);
      const v = row[c.key];
      cell.value = v === undefined ? null : (v as never);
      cell.border = { bottom: { style: "thin", color: { argb: BORDER } } };
      if (ri % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND } };
      if (c.type === "money") cell.numFmt = '"₹"#,##,##0.00';
      else if (c.type === "number") cell.numFmt = "#,##0";
      else if (c.type === "percent") cell.numFmt = "0%";
      else if (c.type === "date") cell.numFmt = "dd mmm yyyy hh:mm";
      cell.alignment = { vertical: "top", horizontal: c.type && c.type !== "text" ? "right" : "left", wrapText: true };
    });
  });

  /* totals with live formulas */
  if (r.totals && r.rows.length) {
    const tr = ws.getRow(7 + r.rows.length);
    r.columns.forEach((c, ci) => {
      const t = r.totals?.[c.key];
      if (!t) return;
      const cell = tr.getCell(ci + 1);
      const L = colLetter(ci);
      cell.value = t === "SUM" || t === "AVERAGE" ? { formula: `${t}(${L}7:${L}${6 + r.rows.length})` } : t;
      cell.font = { bold: true, color: { argb: NAVY } };
      if (c.type === "money") cell.numFmt = '"₹"#,##,##0.00';
      cell.border = { top: { style: "double", color: { argb: NAVY } } };
      cell.alignment = { horizontal: c.type && c.type !== "text" ? "right" : "left" };
    });
  }

  ws.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6, column: r.columns.length } };
  ws.pageSetup.printArea = `A1:${last}${7 + r.rows.length}`;

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${r.fileName}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

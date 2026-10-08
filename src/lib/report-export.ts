// Client-side report exports: CSV, Excel (.xlsx), and PDF.
// Everything is generated in the browser so exports work offline on store
// nodes and never need a backend round-trip.

// write-excel-file is used instead of SheetJS's npm package: it writes
// generated data only (this module never parses untrusted workbooks), and the
// npm SheetJS build carries unpatched CVE-2023-30533/CVE-2024-22363.
import writeXlsxFile from "write-excel-file/browser";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export type ReportCell = string | number | null | undefined;
export type ReportSection = { title: string; columns: string[]; rows: ReportCell[][] };
export type ExportFormat = "csv" | "xlsx" | "pdf";

// Neutralise spreadsheet formula injection for =, + and @ prefixes. A leading
// minus is left alone: negatives are data, not formulas.
function safeCell(value: ReportCell): string | number {
  if (value == null) return "";
  if (typeof value === "number") return value;
  return /^[=+@]/.test(value) ? `'${value}` : value;
}

function csvCell(value: ReportCell): string {
  return `"${String(safeCell(value)).replaceAll('"', '""')}"`;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportCsv(sections: ReportSection[], fileBase: string) {
  const blocks = sections.map((section) => [
    [`[${section.title}]`],
    section.columns.map(csvCell).join(","),
    ...section.rows.map((row) => row.map(csvCell).join(",")),
    [""],
  ]);
  // BOM keeps Excel reading the file as UTF-8; CRLF matches its CSV import.
  const csv = "﻿" + blocks.flat().join("\r\n");
  triggerDownload(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${fileBase}.csv`);
}

async function exportXlsx(sections: ReportSection[], fileBase: string) {
  await writeXlsxFile(
    sections.map((section, index) => ({
      sheet: (section.title || `Sheet ${index + 1}`).slice(0, 31).replace(/[\\/?*[\]:]/g, " "),
      data: [
        [section.title],
        section.columns,
        ...section.rows.map((row) => row.map(safeCell)),
      ],
    })),
  ).toFile(`${fileBase}.xlsx`);
}

function exportPdf(sections: ReportSection[], fileBase: string) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setFontSize(16);
  doc.text(fileBase, 40, 40);
  let cursor = 64;
  for (const section of sections) {
    autoTable(doc, {
      startY: cursor,
      head: [[section.title]],
      body: [],
      theme: "plain",
      styles: { fontSize: 11, fontStyle: "bold", textColor: [15, 118, 110] },
      margin: { left: 40, right: 40 },
    });
    autoTable(doc, {
      startY: cursor + 18,
      head: [section.columns],
      body: section.rows.map((row) => row.map(safeCell)),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [13, 148, 136] },
      margin: { left: 40, right: 40 },
    });
    const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
    cursor = (finalY?.finalY ?? cursor) + 28;
  }
  doc.save(`${fileBase}.pdf`);
}

export function downloadReport(
  format: ExportFormat,
  fileBase: string,
  sections: ReportSection[],
) {
  if (!sections.length) return;
  const safeBase = fileBase.replace(/[^\w.-]+/g, "-");
  if (format === "csv") exportCsv(sections, safeBase);
  else if (format === "xlsx") void exportXlsx(sections, safeBase);
  else exportPdf(sections, safeBase);
}

import { ReportDoc } from '../../core/services/report.service';

const HEAD = ['Task', 'Assignee', 'Status', 'Date Completed', 'Remarks'];

function rows(s: ReportDoc['summary']): string[][] {
  return s.tasks.map((t) => [t.title, t.assignees ?? '', t.status.replace('_', ' '), t.completed_on ?? '',
    [t.delayed ? 'Delayed' : '', t.carried_over ? 'Carried over' : ''].filter(Boolean).join(', ')]);
}

function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const slug = (d: ReportDoc) => `${d.title}-${d.team ?? d.subject ?? d.organization}-${d.period}`.replace(/[^a-z0-9]+/gi, '-').toLowerCase();

/** CSV cells are quoted, and leading = + - @ are neutralized to prevent spreadsheet formula injection. */
const csvCell = (v: string) => `"${(/^[=+\-@]/.test(v) ? "'" + v : v).replace(/"/g, '""')}"`;

export function exportCsv(d: ReportDoc) {
  const meta = [['Report', d.title], ['Organization', d.organization], ['Section', d.team ?? ''], ['Period', d.period],
    ['Total', String(d.summary.total)], ['Completed', String(d.summary.completed)],
    ['In progress', String(d.summary.in_progress)], ['Pending', String(d.summary.pending)], []];
  const body = [...meta, HEAD, ...rows(d.summary)];
  download(new Blob(['﻿' + body.map((r) => r.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }), slug(d) + '.csv');
}

export async function exportXlsx(d: ReportDoc) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Summary');
  ws.addRows([[d.title.toUpperCase()], ['Organization', d.organization], ['Section', d.team ?? ''], ['Period', d.period], [],
    ['Total tasks', d.summary.total], ['Completed', d.summary.completed], ['In progress', d.summary.in_progress],
    ['Pending', d.summary.pending], ['Completion rate %', d.summary.completion_rate], [], ['Accomplishments'], [d.narrative]]);
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.getColumn(1).width = 28; ws.getColumn(2).width = 36;
  const add = (name: string, s: ReportDoc['summary']) => {
    const sh = wb.addWorksheet(name.slice(0, 31).replace(/[\\/*?:[\]]/g, ' '));
    sh.addRow(HEAD).font = { bold: true };
    rows(s).forEach((r) => sh.addRow(r));
    [40, 28, 14, 16, 24].forEach((w, i) => (sh.getColumn(i + 1).width = w));
  };
  add('Task Details', d.summary);
  d.sections?.forEach((s) => add(s.team, s.summary));
  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), slug(d) + '.xlsx');
}

export async function exportPdf(d: ReportDoc) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF();
  let y = 18;
  doc.setFontSize(10).setTextColor(100).text('PROJECT-X', 14, y);
  doc.setFontSize(16).setTextColor(20).text(d.title.toUpperCase(), 14, (y += 8));
  doc.setFontSize(10).setTextColor(60);
  [['Organization', d.organization], d.division ? ['Division', d.division] : null, d.team ? ['Section', d.team] : null,
    d.subject ? ['Employee', d.subject] : null, ['Reporting period', d.period]]
    .filter((x): x is string[] => !!x).forEach(([k, v]) => doc.text(`${k}: ${v}`, 14, (y += 6)));
  const block = (label: string, s: ReportDoc['summary'], narrative: string) => {
    doc.setFontSize(12).setTextColor(20).text(label, 14, (y += 12));
    doc.setFontSize(10).setTextColor(60);
    doc.text(`Total: ${s.total}   Completed: ${s.completed}   In progress: ${s.in_progress}   Pending: ${s.pending}   Rate: ${s.completion_rate}%`, 14, (y += 6));
    const lines = doc.splitTextToSize(narrative, 180) as string[];
    doc.text(lines, 14, (y += 7)); y += lines.length * 4.5;
    autoTable(doc, { startY: y, head: [HEAD], body: rows(s), styles: { fontSize: 8 }, headStyles: { fillColor: [30, 41, 59] } });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
    if (y > 250) { doc.addPage(); y = 16; }
  };
  block('SUMMARY', d.summary, d.narrative);
  d.sections?.forEach((s) => block(s.team, s.summary, s.narrative));
  doc.save(slug(d) + '.pdf');
}

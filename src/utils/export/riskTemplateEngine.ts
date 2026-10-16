import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

/**
 * Fills the official IBIT Risk Matrix Excel template
 * (public/assets/MATRIZ DE RISCO.xlsx) with live risk data, preserving all
 * original formatting (orange header row, grey spacer band, borders, Arial
 * font). Row count grows/shrinks to match the actual number of risks,
 * copying the template's own last-row styling onto any newly inserted rows.
 *
 * Template layout (1-indexed):
 *   Row 1: header band (orange) — THREATS | RISK PROBABILITY | RISK LEVEL | Impact Area | SOLUTION
 *   Row 2: grey spacer band (decorative, stays empty)
 *   Row 3+: data rows — one per risk
 *
 * Base template ships with 10 data rows (3..12).
 */

const TEMPLATE_URL = '/assets/MATRIZ%20DE%20RISCO.xlsx';
const FIRST_DATA_ROW = 3;
const BASE_DATA_ROWS = 10; // rows 3..12
const COLS = { title: 1, probability: 2, level: 3, impactArea: 4, solution: 5 };

export interface RiskTemplateRow {
  title: string;
  probabilityLabel: string;
  level: number | string;
  impactArea: string;
  solution: string;
}

export interface RiskTemplateExportOptions {
  filename: string;
  rows: RiskTemplateRow[];
}

async function fetchTemplateWorkbook(): Promise<ExcelJS.Workbook> {
  const res = await fetch(TEMPLATE_URL);
  if (!res.ok) {
    throw new Error(`Failed to load risk matrix template (${res.status})`);
  }
  const buffer = await res.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook;
}

export async function exportRiskMatrixFromTemplate(opts: RiskTemplateExportOptions): Promise<void> {
  const workbook = await fetchTemplateWorkbook();
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('Risk matrix template has no worksheet');

  const rowCount = Math.max(opts.rows.length, 1);
  const lastTemplateRow = FIRST_DATA_ROW + BASE_DATA_ROWS - 1;

  if (rowCount > BASE_DATA_ROWS) {
    // Duplicate the last template row (copies its styling) to grow capacity.
    sheet.duplicateRow(lastTemplateRow, rowCount - BASE_DATA_ROWS, true);
  } else if (rowCount < BASE_DATA_ROWS) {
    // Fewer risks than the template's base capacity: clear the leftover rows'
    // values (keep their formatting/borders so the sheet still looks intact).
    for (let r = FIRST_DATA_ROW + rowCount; r <= lastTemplateRow; r++) {
      Object.values(COLS).forEach((col) => {
        sheet.getRow(r).getCell(col).value = null;
      });
    }
  }

  opts.rows.forEach((row, idx) => {
    const r = FIRST_DATA_ROW + idx;
    sheet.getRow(r).getCell(COLS.title).value = row.title;
    sheet.getRow(r).getCell(COLS.probability).value = row.probabilityLabel;
    sheet.getRow(r).getCell(COLS.level).value = row.level;
    sheet.getRow(r).getCell(COLS.impactArea).value = row.impactArea;
    sheet.getRow(r).getCell(COLS.solution).value = row.solution;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: 'application/octet-stream' }), opts.filename);
}

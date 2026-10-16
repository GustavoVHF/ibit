import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

/**
 * Fills the official IBIT RACI Excel template (public/assets/MATRIX RACI.xlsx)
 * with live matrix data, preserving all original formatting (header fill,
 * borders, fonts, caption legend). Column count grows dynamically to fit any
 * number of participants and rows grow to fit any number of tasks, copying
 * the template's own header/body cell styles onto the new cells so nothing
 * looks out of place or unstyled.
 *
 * Template layout (1-indexed):
 *   Row 1: A1 "RACI MATRIX" | B1:G1 merged "PEOPLE" (orange) | H1 "CAPTION" (orange)
 *   Row 2: A2 "ACTIVITY" (orange) | B2..G2 participant names (light fill) | H2 caption line 1
 *   Row 3+: A col = task title (light fill) | B..G = R/A/C/I per participant | H caption lines 2-4 (rows 3-5 only)
 *
 * Base template ships with 6 participant columns (B..G) and 8 task rows (3..10).
 * When there are more participants than 6, extra columns are spliced in before
 * the caption column, copying column G's style. When there are more tasks than
 * 8, extra rows are spliced in before the last template row, copying that
 * row's style.
 */

const TEMPLATE_URL = '/assets/MATRIX%20RACI.xlsx';
const BASE_PARTICIPANT_COLS = 6; // B..G
const FIRST_PARTICIPANT_COL = 2; // B
const CAPTION_COL_BASE = 8; // H (before any column insertion)
const FIRST_TASK_ROW = 3;
const BASE_TASK_ROWS = 8; // rows 3..10

export interface RaciTemplateParticipant {
  name: string;
}

export interface RaciTemplateTask {
  title: string;
  /** Role per participant, same order/length as `participants`. */
  roles: (string | null)[];
}

export interface RaciTemplateExportOptions {
  filename: string;
  matrixTitle: string;
  participants: RaciTemplateParticipant[];
  tasks: RaciTemplateTask[];
}

async function fetchTemplateWorkbook(): Promise<ExcelJS.Workbook> {
  const res = await fetch(TEMPLATE_URL);
  if (!res.ok) {
    throw new Error(`Failed to load RACI template (${res.status})`);
  }
  const buffer = await res.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook;
}

function cloneStyle(cell: ExcelJS.Cell): Partial<ExcelJS.Style> {
  return JSON.parse(JSON.stringify(cell.style));
}

export async function exportRaciFromTemplate(opts: RaciTemplateExportOptions): Promise<void> {
  const workbook = await fetchTemplateWorkbook();
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('RACI template has no worksheet');

  const participantCount = Math.max(opts.participants.length, 1);
  const taskCount = Math.max(opts.tasks.length, 1);

  // --- Expand participant columns if needed (insert before caption column) ---
  let captionCol = CAPTION_COL_BASE;
  if (participantCount > BASE_PARTICIPANT_COLS) {
    const extraCols = participantCount - BASE_PARTICIPANT_COLS;
    const styleSourceCol = FIRST_PARTICIPANT_COL + BASE_PARTICIPANT_COLS - 1; // col G
    for (let i = 0; i < extraCols; i++) {
      const insertAt = captionCol; // always insert right before current caption position
      sheet.spliceColumns(insertAt, 0, []);
      const srcWidth = sheet.getColumn(styleSourceCol).width;
      sheet.getColumn(insertAt).width = srcWidth;
      for (let r = 1; r <= sheet.rowCount; r++) {
        const srcCell = sheet.getRow(r).getCell(styleSourceCol);
        const dstCell = sheet.getRow(r).getCell(insertAt);
        dstCell.style = cloneStyle(srcCell);
      }
      captionCol += 1;
    }
  }
  const lastParticipantCol = FIRST_PARTICIPANT_COL + participantCount - 1;

  // Re-merge the "PEOPLE" header band across all participant columns.
  sheet.unMergeCells(1, FIRST_PARTICIPANT_COL, 1, CAPTION_COL_BASE - 1);
  sheet.mergeCells(1, FIRST_PARTICIPANT_COL, 1, lastParticipantCol);

  // --- Expand task rows if needed (insert before the last template row) ---
  const lastTemplateRow = FIRST_TASK_ROW + BASE_TASK_ROWS - 1;
  if (taskCount > BASE_TASK_ROWS) {
    const extraRows = taskCount - BASE_TASK_ROWS;
    // duplicateRow copies full row styling (fills, borders, fonts) and inserts.
    sheet.duplicateRow(lastTemplateRow, extraRows, true);
  }

  // --- Write matrix title into A1 (keep template's own "RACI MATRIX" style) ---
  sheet.getRow(1).getCell(1).value = opts.matrixTitle.toUpperCase() || 'RACI MATRIX';

  // --- Write participant names (row 2) ---
  opts.participants.forEach((p, idx) => {
    const col = FIRST_PARTICIPANT_COL + idx;
    sheet.getRow(2).getCell(col).value = p.name.toUpperCase();
  });

  // --- Write task rows + role values ---
  opts.tasks.forEach((task, taskIdx) => {
    const row = FIRST_TASK_ROW + taskIdx;
    sheet.getRow(row).getCell(1).value = task.title;
    opts.participants.forEach((_, pIdx) => {
      const col = FIRST_PARTICIPANT_COL + pIdx;
      sheet.getRow(row).getCell(col).value = task.roles[pIdx] || '';
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: 'application/octet-stream' }), opts.filename);
}

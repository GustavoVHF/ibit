import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

/**
 * "Sectioned ledger" Excel layout — inspired by the platform's own budget
 * spreadsheet convention (TRANSACOES E INVENTARIO template): a single sheet
 * with column headers up top, then the dataset broken into named section
 * bands (one full-width dark row per group), each followed by its rows and
 * ending in a small subtotal, with one grand total row at the very bottom.
 *
 * Colors are adapted to the IBIT identity (solar-flame orange header +
 * black-onyx section bands) instead of the original red/yellow scheme.
 */

const HEADER_FILL = 'FFFF7F00'; // solar-flame
const SECTION_FILL = 'FF1A1A1A'; // black-onyx
const SECTION_FONT = 'FFFFFFFF';
const SUBTOTAL_FILL = 'FFFFF3E0'; // soft orange tint
const GRANDTOTAL_FILL = 'FFFF7F00';
const ZEBRA_FILL = 'FFF9FAFB';
const BORDER_COLOR = 'FFE5E7EB';

export type LedgerColumnType = 'string' | 'number' | 'currency';

export interface LedgerColumn<T = any> {
  header: string;
  type: LedgerColumnType;
  width?: number;
  value: (row: T) => any;
}

export interface LedgerGroup<T = any> {
  name: string;
  rows: T[];
}

export interface LedgerExportOptions<T = any> {
  filename: string;
  sheetName: string;
  title: string;
  columns: LedgerColumn<T>[];
  groups: LedgerGroup<T>[];
  /** Index (0-based) of the column that should be summed for subtotal/grand-total rows. */
  totalColumnIndex: number;
}

function numberFormatFor(type: LedgerColumnType): string | undefined {
  if (type === 'currency') return '"R$" #,##0.00';
  if (type === 'number') return '#,##0';
  return undefined;
}

function borderAll() {
  return {
    top: { style: 'thin' as const, color: { argb: BORDER_COLOR } },
    bottom: { style: 'thin' as const, color: { argb: BORDER_COLOR } },
    left: { style: 'thin' as const, color: { argb: BORDER_COLOR } },
    right: { style: 'thin' as const, color: { argb: BORDER_COLOR } },
  };
}

export async function exportLedgerToExcel<T>(opts: LedgerExportOptions<T>): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'IBIT Platform';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(opts.sheetName.slice(0, 31) || 'Dados');
  const colCount = opts.columns.length;

  // Title row
  const titleRow = sheet.addRow([opts.title]);
  titleRow.font = { bold: true, size: 14, color: { argb: 'FF1A1A1A' } };
  sheet.mergeCells(1, 1, 1, colCount);
  titleRow.height = 26;

  const generatedRow = sheet.addRow([`Exportado em ${new Date().toLocaleString('pt-BR')}`]);
  generatedRow.font = { italic: true, size: 9, color: { argb: 'FF9CA3AF' } };
  sheet.mergeCells(2, 1, 2, colCount);
  sheet.addRow([]); // spacer

  // Header row
  const headerRow = sheet.addRow(opts.columns.map((c) => c.header));
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = borderAll();
  });
  headerRow.height = 22;

  let grandTotal = 0;

  opts.groups.forEach((group) => {
    // Section band (full width, dark bg)
    const sectionRow = sheet.addRow([group.name.toUpperCase()]);
    sheet.mergeCells(sectionRow.number, 1, sectionRow.number, colCount);
    sectionRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: SECTION_FONT }, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SECTION_FILL } };
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
    });
    sectionRow.height = 20;

    let subtotal = 0;
    group.rows.forEach((row, idx) => {
      const excelRow = sheet.addRow(opts.columns.map((col) => col.value(row)));
      const totalCellValue = opts.columns[opts.totalColumnIndex].value(row);
      if (typeof totalCellValue === 'number') {
        subtotal += totalCellValue;
        grandTotal += totalCellValue;
      }
      excelRow.eachCell((cell, colNumber) => {
        const col = opts.columns[colNumber - 1];
        const fmt = numberFormatFor(col.type);
        if (fmt) cell.numFmt = fmt;
        cell.border = { bottom: { style: 'hair', color: { argb: BORDER_COLOR } } };
        if (idx % 2 === 1) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA_FILL } };
        }
      });
    });

    // Subtotal row for this section
    const subtotalCells = opts.columns.map((_, i) => (i === opts.totalColumnIndex ? subtotal : i === 0 ? `Subtotal — ${group.name}` : ''));
    const subtotalRow = sheet.addRow(subtotalCells);
    subtotalRow.eachCell((cell, colNumber) => {
      cell.font = { bold: true, size: 9, color: { argb: 'FF7A3B00' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SUBTOTAL_FILL } };
      const col = opts.columns[colNumber - 1];
      const fmt = numberFormatFor(col.type);
      if (colNumber - 1 === opts.totalColumnIndex && fmt) cell.numFmt = fmt;
      cell.border = borderAll();
    });
  });

  // Grand total row
  const grandTotalCells = opts.columns.map((_, i) => (i === opts.totalColumnIndex ? grandTotal : i === 0 ? 'TOTAL GERAL' : ''));
  const grandTotalRow = sheet.addRow(grandTotalCells);
  grandTotalRow.eachCell((cell, colNumber) => {
    cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRANDTOTAL_FILL } };
    const col = opts.columns[colNumber - 1];
    const fmt = numberFormatFor(col.type);
    if (colNumber - 1 === opts.totalColumnIndex && fmt) cell.numFmt = fmt;
    cell.border = borderAll();
  });
  grandTotalRow.height = 24;

  // Column widths
  opts.columns.forEach((col, i) => {
    sheet.getColumn(i + 1).width = col.width ?? Math.max(col.header.length + 4, 14);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: 'application/octet-stream' }), opts.filename);
}

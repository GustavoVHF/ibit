import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

/** IBIT brand palette applied to generated spreadsheets. */
const BRAND = {
  headerFill: 'FFFF7F00', // solar-flame orange
  headerFont: 'FFFFFFFF',
  zebraFill: 'FFF9FAFB',
  borderColor: 'FFE5E7EB',
  titleFont: 'FF1A1A1A',
};

export type ExcelColumnType = 'string' | 'number' | 'currency' | 'date' | 'percent';

export interface ExcelColumn<T = any> {
  header: string;
  key: string;
  type: ExcelColumnType;
  width?: number;
  /** Extract cell value from a row object. Defaults to row[key]. */
  value?: (row: T) => any;
}

export interface ExcelExportOptions<T = any> {
  filename: string;
  sheetName: string;
  title: string;
  columns: ExcelColumn<T>[];
  rows: T[];
}

function numberFormatFor(type: ExcelColumnType): string | undefined {
  switch (type) {
    case 'currency':
      return '"R$" #,##0.00';
    case 'date':
      return 'dd/mm/yyyy';
    case 'percent':
      return '0.0%';
    case 'number':
      return '#,##0';
    default:
      return undefined;
  }
}

/**
 * Builds and downloads a styled .xlsx workbook: title row, brand-colored
 * header row, strict column typing (dates/currency get real numeric/date
 * cell values, not strings), auto-filter on the header row, and subtle
 * zebra striping.
 */
export async function exportToExcel<T>(opts: ExcelExportOptions<T>): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'IBIT Platform';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(opts.sheetName.slice(0, 31) || 'Dados');

  // Title row (merged across all columns)
  const titleRow = sheet.addRow([opts.title]);
  titleRow.font = { bold: true, size: 14, color: { argb: BRAND.titleFont } };
  sheet.mergeCells(1, 1, 1, opts.columns.length);
  titleRow.height = 26;

  const generatedRow = sheet.addRow([`Exportado em ${new Date().toLocaleString('pt-BR')}`]);
  generatedRow.font = { italic: true, size: 9, color: { argb: 'FF9CA3AF' } };
  sheet.mergeCells(2, 1, 2, opts.columns.length);
  sheet.addRow([]); // spacer

  // Header row
  const headerRowIndex = 4;
  const headerRow = sheet.getRow(headerRowIndex);
  opts.columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    cell.font = { bold: true, color: { argb: BRAND.headerFont }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.headerFill } };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.border = {
      top: { style: 'thin', color: { argb: BRAND.borderColor } },
      bottom: { style: 'thin', color: { argb: BRAND.borderColor } },
      left: { style: 'thin', color: { argb: BRAND.borderColor } },
      right: { style: 'thin', color: { argb: BRAND.borderColor } },
    };
  });
  headerRow.height = 22;

  // Data rows with strict typing + zebra striping
  opts.rows.forEach((row, rowIdx) => {
    const excelRow = sheet.addRow(
      opts.columns.map((col) => {
        const raw = col.value ? col.value(row) : (row as any)[col.key];
        if (col.type === 'date' && raw) {
          return raw instanceof Date ? raw : new Date(raw);
        }
        return raw;
      })
    );

    opts.columns.forEach((col, colIdx) => {
      const cell = excelRow.getCell(colIdx + 1);
      const fmt = numberFormatFor(col.type);
      if (fmt) cell.numFmt = fmt;
      cell.border = {
        bottom: { style: 'hair', color: { argb: BRAND.borderColor } },
      };
      if (rowIdx % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND.zebraFill } };
      }
    });
  });

  // Column widths
  opts.columns.forEach((col, i) => {
    sheet.getColumn(i + 1).width = col.width ?? Math.max(col.header.length + 4, 14);
  });

  // Auto-filter on header row
  sheet.autoFilter = {
    from: { row: headerRowIndex, column: 1 },
    to: { row: headerRowIndex, column: opts.columns.length },
  };
  sheet.views = [{ state: 'frozen', ySplit: headerRowIndex }];

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: 'application/octet-stream' }), opts.filename);
}

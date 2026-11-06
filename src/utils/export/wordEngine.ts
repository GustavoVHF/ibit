import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  AlignmentType,
  Footer,
  PageNumber,
  BorderStyle,
  WidthType,
  ShadingType,
} from 'docx';
import { getMessages } from '../../i18n';
import { saveAs } from 'file-saver';

const BRAND_ORANGE = 'FF7F00';
const HEADER_FILL = 'FF7F00';
const ZEBRA_FILL = 'F9FAFB';
/** All generated Word content uses Arial per platform requirement. */
const FONT_FAMILY = 'Arial';

export interface WordTableSection {
  kind: 'table';
  heading?: string;
  headingLevel?: 'h1' | 'h2';
  columnHeaders: string[];
  rows: string[][];
}

export interface WordTextSection {
  kind: 'text';
  heading?: string;
  headingLevel?: 'h1' | 'h2';
  paragraphs: string[];
}

export type WordSection = WordTableSection | WordTextSection;

export interface WordExportOptions {
  filename: string;
  title: string;
  subtitle?: string;
  sections: WordSection[];
}

function headingLevelToDocx(level?: 'h1' | 'h2') {
  return level === 'h2' ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_1;
}

function buildTableSection(section: WordTableSection): (Paragraph | Table)[] {
  const blocks: (Paragraph | Table)[] = [];
  if (section.heading) {
    blocks.push(
      new Paragraph({
        heading: headingLevelToDocx(section.headingLevel),
        spacing: { before: 240, after: 120 },
        children: [new TextRun({ text: section.heading, font: FONT_FAMILY })],
      })
    );
  }

  const headerRow = new TableRow({
    tableHeader: true,
    children: section.columnHeaders.map(
      (h) =>
        new TableCell({
          width: { size: Math.floor(100 / section.columnHeaders.length), type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.SOLID, color: HEADER_FILL, fill: HEADER_FILL },
          children: [
            new Paragraph({
              children: [new TextRun({ text: h, bold: true, color: 'FFFFFF', size: 18, font: FONT_FAMILY })],
            }),
          ],
        })
    ),
  });

  const dataRows = section.rows.map(
    (row, rowIdx) =>
      new TableRow({
        children: row.map(
          (cellText) =>
            new TableCell({
              width: { size: Math.floor(100 / section.columnHeaders.length), type: WidthType.PERCENTAGE },
              shading:
                rowIdx % 2 === 1
                  ? { type: ShadingType.SOLID, color: ZEBRA_FILL, fill: ZEBRA_FILL }
                  : undefined,
              children: [new Paragraph({ children: [new TextRun({ text: cellText ?? '', size: 18, font: FONT_FAMILY })] })],
            })
        ),
      })
  );

  blocks.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
        bottom: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
        left: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
        right: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
        insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'E5E7EB' },
      },
      rows: [headerRow, ...dataRows],
    })
  );

  return blocks;
}

function buildTextSection(section: WordTextSection): Paragraph[] {
  const blocks: Paragraph[] = [];
  if (section.heading) {
    blocks.push(
      new Paragraph({
        heading: headingLevelToDocx(section.headingLevel),
        spacing: { before: 240, after: 120 },
        children: [new TextRun({ text: section.heading, font: FONT_FAMILY })],
      })
    );
  }
  section.paragraphs.forEach((p) => {
    blocks.push(new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: p, font: FONT_FAMILY })] }));
  });
  return blocks;
}

/**
 * Builds and downloads a .docx report with hierarchical structure (H1/H2),
 * native tables, and a numbered footer. Used for narrative/rich-text pages
 * (documents, minutes, RACI/stakeholder narrative exports).
 */
export async function exportToWord(opts: WordExportOptions): Promise<void> {
  const bodyChildren: (Paragraph | Table)[] = [
    new Paragraph({
      children: [new TextRun({ text: opts.title, bold: true, size: 32, color: '1A1A1A', font: FONT_FAMILY })],
      spacing: { after: opts.subtitle ? 40 : 200 },
    }),
  ];

  if (opts.subtitle) {
    bodyChildren.push(
      new Paragraph({
        children: [new TextRun({ text: opts.subtitle, size: 18, color: '9CA3AF', bold: true, font: FONT_FAMILY })],
        spacing: { after: 200 },
      })
    );
  }

  bodyChildren.push(
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: BRAND_ORANGE } },
      spacing: { after: 240 },
    })
  );

  opts.sections.forEach((section) => {
    if (section.kind === 'table') {
      bodyChildren.push(...buildTableSection(section));
    } else {
      bodyChildren.push(...buildTextSection(section));
    }
  });

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: FONT_FAMILY },
        },
      },
    },
    sections: [
      {
        properties: {},
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: getMessages().export.wordPage, size: 16, color: '9CA3AF', font: FONT_FAMILY }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '9CA3AF', font: FONT_FAMILY }),
                  new TextRun({ text: getMessages().export.wordOf, size: 16, color: '9CA3AF', font: FONT_FAMILY }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: '9CA3AF', font: FONT_FAMILY }),
                ],
              }),
            ],
          }),
        },
        children: bodyChildren,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, opts.filename);
}

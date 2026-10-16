import { WordSection, WordTableSection, WordTextSection } from './wordEngine';

/**
 * Minimal TipTap/ProseMirror JSON node shape (loosely typed — editor content
 * is user-authored rich text, so we defensively walk unknown node types).
 */
interface ProseMirrorNode {
  type: string;
  attrs?: Record<string, any>;
  content?: ProseMirrorNode[];
  text?: string;
}

function extractText(node: ProseMirrorNode): string {
  if (node.type === 'text') return node.text || '';
  if (!node.content) return '';
  return node.content.map(extractText).join('');
}

function extractParagraphText(node: ProseMirrorNode): string {
  return extractText(node).trim();
}

/** Converts a TipTap table node into a WordTableSection. */
function convertTable(node: ProseMirrorNode): WordTableSection | null {
  const rows = (node.content || []).filter((n) => n.type === 'tableRow');
  if (rows.length === 0) return null;

  const cellsToText = (row: ProseMirrorNode) =>
    (row.content || []).map((cell) => extractText(cell).trim());

  const [headerRow, ...bodyRows] = rows;
  const columnHeaders = cellsToText(headerRow);
  const dataRows = bodyRows.map(cellsToText);

  return {
    kind: 'table',
    columnHeaders,
    rows: dataRows,
  };
}

/**
 * Walks the top-level nodes of a TipTap document and builds an ordered list
 * of WordSection blocks: headings start new text sections, tables become
 * standalone table sections, everything else becomes a paragraph.
 */
export function tiptapJsonToWordSections(docJson: ProseMirrorNode): WordSection[] {
  const sections: WordSection[] = [];
  let currentText: WordTextSection | null = null;

  const flush = () => {
    if (currentText && currentText.paragraphs.length > 0) {
      sections.push(currentText);
    }
    currentText = null;
  };

  const nodes = docJson.content || [];

  nodes.forEach((node) => {
    switch (node.type) {
      case 'heading': {
        flush();
        const level = node.attrs?.level ?? 1;
        currentText = {
          kind: 'text',
          heading: extractParagraphText(node) || undefined,
          headingLevel: level <= 1 ? 'h1' : 'h2',
          paragraphs: [],
        };
        break;
      }
      case 'table': {
        flush();
        const table = convertTable(node);
        if (table) sections.push(table);
        break;
      }
      case 'bulletList':
      case 'orderedList': {
        if (!currentText) currentText = { kind: 'text', paragraphs: [] };
        (node.content || []).forEach((item, idx) => {
          const prefix = node.type === 'orderedList' ? `${idx + 1}. ` : '• ';
          const text = extractParagraphText(item);
          if (text) currentText!.paragraphs.push(prefix + text);
        });
        break;
      }
      case 'taskList': {
        if (!currentText) currentText = { kind: 'text', paragraphs: [] };
        (node.content || []).forEach((item) => {
          const checked = item.attrs?.checked ? '[x] ' : '[ ] ';
          const text = extractParagraphText(item);
          if (text) currentText!.paragraphs.push(checked + text);
        });
        break;
      }
      case 'blockquote': {
        if (!currentText) currentText = { kind: 'text', paragraphs: [] };
        const text = extractParagraphText(node);
        if (text) currentText!.paragraphs.push(`" ${text} "`);
        break;
      }
      case 'horizontalRule':
        break;
      case 'paragraph':
      default: {
        const text = extractParagraphText(node);
        if (!text) break;
        if (!currentText) currentText = { kind: 'text', paragraphs: [] };
        currentText!.paragraphs.push(text);
        break;
      }
    }
  });

  flush();
  return sections;
}

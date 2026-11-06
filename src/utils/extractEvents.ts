/**
 * extractSyncEvents(tiptapJson)
 * 
 * Traverses a TipTap JSON document and extracts calendar events
 * that have `sync: true`. For events inside tables, the title is
 * extracted from the FIRST CELL of the same row (business rule).
 * For events outside tables, the title is extracted from the
 * surrounding paragraph text or defaults to "Evento de Documento".
 */

import { getMessages } from '../i18n';

export interface SyncEvent {
  title: string;
  date: string;
}

/**
 * Recursively extract all text content from a TipTap JSON node.
 */
function extractText(node: any): string {
  if (!node) return '';
  if (node.type === 'text') return node.text || '';
  if (!node.content) return '';
  return node.content.map((child: any) => extractText(child)).join('');
}

/**
 * Recursively find all calendarEvent nodes inside a node subtree.
 */
function findCalendarEvents(node: any): Array<{ date: string; sync: boolean }> {
  const events: Array<{ date: string; sync: boolean }> = [];
  if (!node) return events;

  if (node.type === 'calendarEvent' && node.attrs) {
    events.push({
      date: node.attrs.date || '',
      sync: !!node.attrs.sync,
    });
  }

  if (node.content) {
    for (const child of node.content) {
      events.push(...findCalendarEvents(child));
    }
  }

  return events;
}

/**
 * Process a single tableRow: extract the title from cell[0],
 * then find any synced calendarEvents in the rest of the row.
 */
function processTableRow(row: any): SyncEvent[] {
  const results: SyncEvent[] = [];
  if (!row.content || row.content.length === 0) return results;

  // Step A: Extract title from the FIRST cell (index 0)
  const firstCell = row.content[0];
  const rowTitle = extractText(firstCell).trim();

  // Step B: Scan the ENTIRE row for calendarEvent nodes with sync=true
  const events = findCalendarEvents(row);

  for (const event of events) {
    if (event.sync && event.date) {
      results.push({
        title: rowTitle || getMessages().errors.untitledEvent,
        date: event.date,
      });
    }
  }

  return results;
}

/**
 * Process a paragraph or other non-table block: use the block's
 * own text as a fallback title.
 */
function processBlock(block: any): SyncEvent[] {
  const results: SyncEvent[] = [];
  if (!block.content) return results;

  const events = findCalendarEvents(block);
  if (events.length === 0) return results;

  // Extract text from the block, excluding the event node itself
  const blockText = extractText(block).trim();

  for (const event of events) {
    if (event.sync && event.date) {
      results.push({
        title: blockText || getMessages().errors.documentEvent,
        date: event.date,
      });
    }
  }

  return results;
}

/**
 * Main entry point. Receives the full TipTap JSON (`editor.getJSON()`)
 * and returns an array of all sync-enabled calendar events.
 */
export function extractSyncEvents(tiptapJson: any): SyncEvent[] {
  const results: SyncEvent[] = [];
  if (!tiptapJson || !tiptapJson.content) return results;

  function walk(nodes: any[]) {
    for (const node of nodes) {
      // TABLE PATH: When we hit a table, iterate its rows directly
      if (node.type === 'table' && node.content) {
        for (const row of node.content) {
          if (row.type === 'tableRow') {
            results.push(...processTableRow(row));
          }
        }
        continue; // Don't recurse further into table children
      }

      // BLOCK PATH: Check paragraphs, headings, etc.
      if (node.type === 'paragraph' || node.type === 'heading' || node.type === 'taskItem') {
        results.push(...processBlock(node));
        continue;
      }

      // RECURSE into other structural nodes (bulletList, taskList, etc.)
      if (node.content) {
        walk(node.content);
      }
    }
  }

  walk(tiptapJson.content);
  return results;
}

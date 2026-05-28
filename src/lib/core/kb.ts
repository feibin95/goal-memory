import type { KBEntry } from '@/types';
import { KBEntryUtils } from './models';
import { saveKbEntry, loadKb } from './store';

export function addEntry(title: string, body: string, tags: string[]): KBEntry {
  return saveKbEntry(KBEntryUtils.create(title, body, tags));
}

export function search(query: string): KBEntry[] {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 0);
  if (terms.length === 0) return [];
  return loadKb().filter((entry) => {
    const text = (entry.title + ' ' + entry.body + ' ' + entry.tags.join(' ')).toLowerCase();
    return terms.every((term) => text.includes(term));
  });
}

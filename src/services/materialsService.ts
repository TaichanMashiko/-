import manifestData from '../data/materialsManifest.json';
import type { DeckInfo, MaterialsManifest, SlideMetadata } from '../types';

const manifest = manifestData as unknown as MaterialsManifest;

export function getAllDecks(): DeckInfo[] {
  return manifest.decks ?? [];
}

export function getMainDecks(): DeckInfo[] {
  return getAllDecks().filter((d) => !d.isShikou);
}

export function getDeckById(deckId: string | undefined | null): DeckInfo | null {
  if (!deckId) return null;
  return getAllDecks().find((d) => d.id === deckId) ?? null;
}

export function getDecksByChapter(): Map<number, DeckInfo[]> {
  const map = new Map<number, DeckInfo[]>();
  for (const deck of getAllDecks()) {
    const list = map.get(deck.chapter) ?? [];
    list.push(deck);
    map.set(deck.chapter, list);
  }
  return map;
}

export function getSlideMeta(
  deck: DeckInfo | null,
  page: number
): SlideMetadata | null {
  if (!deck || !deck.slides || deck.slides.length === 0) return null;
  const clamped = Math.min(Math.max(1, page), deck.slides.length);
  return deck.slides[clamped - 1] ?? null;
}

export function findSlidesByWorksheetPage(
  deck: DeckInfo | null,
  worksheetPage: number
): SlideMetadata[] {
  if (!deck) return [];
  return deck.slides.filter((s) => s.worksheetPage === worksheetPage);
}

export function findSlidesByTextbookPage(
  deck: DeckInfo | null,
  textbookPage: number
): SlideMetadata[] {
  if (!deck) return [];
  return deck.slides.filter((s) => s.textbookPage === textbookPage);
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

import manifestData from '../data/materialsManifest.json';
import testsManifestData from '../data/testsManifest.json';
import type { DeckInfo, MaterialsManifest, SlideMetadata } from '../types';

export interface LinkedTestItem {
  id: string;
  kind: 'test10min' | 'evaltest';
  no: number;
  chapter: number;
  title: string;
  topic: string;
  questionUrl: string;
  answerUrl: string;
}

interface TestsManifest {
  tests10min: LinkedTestItem[];
  evalTests: LinkedTestItem[];
}

const manifest = manifestData as unknown as MaterialsManifest;
const testsManifest = testsManifestData as unknown as TestsManifest;

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

export function getTestsForChapter(chapter: number): {
  tests10min: LinkedTestItem[];
  evalTests: LinkedTestItem[];
} {
  return {
    tests10min: (testsManifest.tests10min ?? []).filter(
      (t) => t.chapter === chapter
    ),
    evalTests: (testsManifest.evalTests ?? []).filter(
      (t) => t.chapter === chapter
    ),
  };
}

export function getRecommendedTestsForTopic(
  chapter: number,
  topicText: string
): LinkedTestItem[] {
  const { tests10min, evalTests } = getTestsForChapter(chapter);
  const all = [...tests10min, ...evalTests];
  const lower = (topicText || '').toLowerCase();

  const scored = all.map((t) => {
    let score = 0;
    const topicLower = t.topic.toLowerCase();
    // Keyword overlap scoring
    const tokens = lower
      .split(/[\s・，、（）()「」]+/)
      .filter((w) => w.length >= 2);
    for (const tok of tokens) {
      if (topicLower.includes(tok)) score += 3;
    }
    if (topicLower.includes('中学校の復習')) score += 1;
    return { item: t, score };
  });

  scored.sort((a, b) => b.score - a.score || a.item.no - b.item.no);
  return scored.slice(0, 6).map((s) => s.item);
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

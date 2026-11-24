const ANIMAL_PERSONAS = [
  '🐧匿名ペンギン',
  '🦊匿名キツネ',
  '🐼匿名パンダ',
  '🐰匿名ウサギ',
  '🦉匿名フクロウ',
  '🐨匿名コアラ',
  '🐸匿名カエル',
  '🐶匿名イヌ',
  '🐱匿名ネコ',
  '🐻匿名クマ',
  '🐯匿名トラ',
  '🦁匿名ライオン',
  '🦄匿名ユニコーン',
  '🐬匿名イルカ',
  '🦔匿名ハリネズミ',
  '🐿️匿名リス',
  '🐤匿名ヒヨコ',
  '🦭匿名アザラシ',
  '🦙匿名アルパカ',
  '🐙匿名タコ',
  '🐳匿名クジラ',
  '🦘匿名カンガルー',
  '🦥匿名ナマケモノ',
  '🦒匿名キリン',
] as const;

const TERMINAL_ID_KEY = 'classpulse_terminal_id_v1';
const ANON_NAME_KEY = 'classpulse_anon_name_v1';
const COOLDOWN_PREFIX = 'classpulse_cooldown_v1_';

export const COOLDOWN_MS = 15_000;
export const CONFUSION_DURATION_MS = 45_000;
export const NEW_MESSAGE_HIGHLIGHT_MS = 30_000;

export const QUICK_PHRASES = [
  'もう少しゆっくり',
  '文字が小さい',
  '前の画面に戻って',
] as const;

export interface TerminalIdentity {
  terminalId: string;
  anonId: string;
}

function generateRandomToken(length = 8): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const array = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array);
    for (let i = 0; i < length; i++) {
      result += chars[array[i] % chars.length];
    }
  } else {
    for (let i = 0; i < length; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
  }
  return result;
}

export function getOrCreateTerminalIdentity(): TerminalIdentity {
  try {
    let terminalId = localStorage.getItem(TERMINAL_ID_KEY);
    let anonId = localStorage.getItem(ANON_NAME_KEY);

    if (!terminalId || !/^[a-zA-Z0-9_-]{4,64}$/.test(terminalId)) {
      terminalId = `term_${generateRandomToken(10)}`;
      localStorage.setItem(TERMINAL_ID_KEY, terminalId);
    }

    if (!anonId || anonId.length < 2 || anonId.length > 48) {
      const idx = Math.floor(Math.random() * ANIMAL_PERSONAS.length);
      anonId = ANIMAL_PERSONAS[idx];
      localStorage.setItem(ANON_NAME_KEY, anonId);
    }

    return { terminalId, anonId };
  } catch {
    return {
      terminalId: `term_${generateRandomToken(10)}`,
      anonId: ANIMAL_PERSONAS[Math.floor(Math.random() * ANIMAL_PERSONAS.length)],
    };
  }
}

export function getStoredLastSentAt(roomId: string): number {
  try {
    const raw = localStorage.getItem(`${COOLDOWN_PREFIX}${roomId}`);
    const parsed = raw ? Number(raw) : 0;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

export function setStoredLastSentAt(roomId: string, timestampMs: number): void {
  try {
    localStorage.setItem(`${COOLDOWN_PREFIX}${roomId}`, String(Math.trunc(timestampMs)));
  } catch {
    // Ignore storage quota errors
  }
}

export function normalizeRoomCode(input: string): string {
  return input.trim().replace(/\s+/g, '-');
}

export function isValidRoomCode(code: string): boolean {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(code);
}

export function generateSampleRoomCode(): string {
  const prefixes = ['CLASS', 'ROOM', 'LECTURE'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const num = Math.floor(100 + Math.random() * 900);
  return `${prefix}-${num}`;
}

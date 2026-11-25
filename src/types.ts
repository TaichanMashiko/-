export type UserRole = 'student' | 'teacher';

export type MascotMood = 'idle' | 'confused' | 'happy' | 'alert' | 'paused';

export interface RoomData {
  roomCode: string;
  teacherUid: string;
  chatPaused: boolean;
  resetEpoch: number;
  createdBy: string;
  createdAtMs: number;
  updatedAtMs: number;
  // Slide & Lecture Sync fields
  activeDeckId?: string;
  activeDeckTitle?: string;
  currentPage?: number;
  totalPages?: number;
  currentTextbookPage?: number;
  currentWorksheetPage?: number;
  activeSessionId?: string;
  lectureActive?: boolean;
  lectureStartedAtMs?: number;
  lastEndedDeckId?: string;
  lastEndedPage?: number;
}

export interface SignalData {
  id: string;
  roomId: string;
  ownerUid: string;
  roomTeacherUid: string;
  terminalId: string;
  anonId: string;
  status: 'confused' | 'understood';
  epoch: number;
  expiresAtMs: number;
  createdAtMs: number;
  updatedAtMs: number;
  // Optional slide context
  deckId?: string;
  slidePage?: number;
  textbookPage?: number;
  worksheetPage?: number;
  sessionId?: string;
  studentEmail?: string;
  studentName?: string;
}

export interface MessageData {
  id: string;
  roomId: string;
  ownerUid: string;
  roomTeacherUid: string;
  terminalId: string;
  anonId: string;
  text: string;
  kind: 'quick' | 'chat';
  epoch: number;
  resolved: boolean;
  createdAtMs: number;
  updatedAtMs: number;
  // Optional slide context
  deckId?: string;
  slidePage?: number;
  textbookPage?: number;
  worksheetPage?: number;
  sessionId?: string;
  studentEmail?: string;
  studentName?: string;
}

export interface MuteData {
  id: string;
  roomId: string;
  teacherUid: string;
  terminalId: string;
  anonId: string;
  createdAtMs: number;
}

// --- Materials & Slide Manifest ---

export interface SlideMetadata {
  page: number;
  sourceSlide?: number;
  stepIndex?: number;
  stepTotal?: number;
  textbookPage: number | null;
  worksheetPage: number;
  topic: string;
  problemTag: string;
  snippet: string;
}

export interface DeckInfo {
  id: string;
  unitKey: string;
  subject: string;
  chapter: number;
  chapterName: string;
  sectionLabel: string;
  title: string;
  isShikou: boolean;
  slidePdfUrl: string;
  pageCount: number;
  textbookPageStart: number;
  textbookPageEnd: number;
  textbookPdfUrl: string;
  detailedAnswerPdfUrl: string;
  worksheetQuestionPdfUrl: string;
  worksheetAnswerPdfUrl: string;
  worksheetPageCount: number;
  slides: SlideMetadata[];
}

export interface MaterialsManifest {
  generatedAt: string;
  subject: string;
  decks: DeckInfo[];
}

// --- Lecture Recording & Notes ---

export interface LectureSegment {
  id: string;
  slidePage: number;
  textbookPage: number | null;
  worksheetPage: number;
  topic: string;
  problemTag: string;
  startedAtMs: number;
  endedAtMs: number;
  transcript: string;
  aiNote: string;
  confusionCount: number;
  questionCount: number;
}

export interface LectureSession {
  id: string;
  roomId: string;
  teacherUid: string;
  deckId: string;
  deckTitle: string;
  unitKey: string;
  chapter: number;
  chapterName: string;
  sectionLabel: string;
  startPage: number;
  endPage: number;
  textbookPageRange: string;
  worksheetPageRange: string;
  startedAtMs: number;
  endedAtMs: number;
  status: 'live' | 'ended';
  summary: string;
  keyPoints: string[];
  segments: LectureSegment[];
  confusedPages: Record<string, number>;
  unresolvedQuestionCount: number;
  updatedAtMs: number;
}

export interface NoteComment {
  id: string;
  roomId: string;
  sessionId: string;
  deckId: string;
  slidePage: number;
  textbookPage: number | null;
  worksheetPage: number;
  authorUid: string;
  authorName: string;
  authorRole: UserRole;
  kind: 'confused' | 'question' | 'reply';
  text: string;
  resolved: boolean;
  aiHint?: string;
  createdAtMs: number;
}

export interface StudentLearningLog {
  id: string;
  roomId: string;
  studentUid: string;
  studentEmail: string;
  studentName: string;
  deckId: string;
  deckTitle: string;
  chapter: number;
  slidePage: number;
  textbookPage: number | null;
  worksheetPage: number;
  topic: string;
  eventType:
    | 'confused'
    | 'understood'
    | 'question'
    | 'practice_correct'
    | 'practice_wrong';
  detail: string;
  createdAtMs: number;
}

export interface AdaptiveProblem {
  id: string;
  chapter: number;
  deckId: string;
  topic: string;
  difficulty: 'basic' | 'standard' | 'challenge';
  textbookPage?: number | null;
  worksheetPage?: number;
  question: string;
  choices?: string[];
  answer: string;
  hints: string[];
  explanation: string;
  source: 'ai' | 'generator';
}

export interface DocumentPictureInPictureOptions {
  width?: number;
  height?: number;
  disallowReturnToOpener?: boolean;
  preferInitialWindowPlacement?: boolean;
}

export interface DocumentPictureInPicture {
  requestWindow(options?: DocumentPictureInPictureOptions): Promise<Window>;
  readonly window: Window | null;
}

declare global {
  interface Window {
    documentPictureInPicture?: DocumentPictureInPicture;
  }
}

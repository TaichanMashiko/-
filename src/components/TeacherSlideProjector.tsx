import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  KeyRound,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Play,
  PlusCircle,
  Sparkles,
  Square,
  Upload,
} from 'lucide-react';
import { useLectureRecorder } from '../hooks/useLectureRecorder';
import {
  generateLectureNotes,
  getStoredGeminiApiKey,
  setStoredGeminiApiKey,
} from '../services/aiTutorService';
import {
  persistLectureSession,
  syncRoomSlideState,
} from '../services/lectureStore';
import {
  formatDuration,
  getAllDecks,
  getDeckById,
  getSlideMeta,
} from '../services/materialsService';
import type {
  DeckInfo,
  LectureSegment,
  LectureSession,
  MessageData,
  RoomData,
  SignalData,
} from '../types';
import { PdfPageViewer } from './PdfPageViewer';
import { TeacherTickerBar } from './TeacherTickerBar';

interface TeacherSlideProjectorProps {
  roomId: string;
  teacherUid: string;
  room: RoomData | null;
  confusedCount: number;
  activeTickerMessages: MessageData[];
  nowMs: number;
  isResetting: boolean;
  onResetAll: () => void;
  onResolveMessage: (messageId: string) => void;
  signals: SignalData[];
  messages: MessageData[];
  sessions: LectureSession[];
  onSessionSaved: (session: LectureSession) => void;
  onJumpToReview: (sessionId?: string) => void;
}

export function TeacherSlideProjector({
  roomId,
  teacherUid,
  room,
  confusedCount,
  activeTickerMessages,
  nowMs,
  isResetting,
  onResetAll,
  onResolveMessage,
  signals,
  messages,
  sessions,
  onSessionSaved,
  onJumpToReview,
}: TeacherSlideProjectorProps) {
  const allDecks = useMemo(() => getAllDecks(), []);
  const [selectedChapter, setSelectedChapter] = useState<number>(1);
  const [selectedDeckId, setSelectedDeckId] = useState<string>(
    () => room?.lastEndedDeckId || room?.activeDeckId || allDecks[0]?.id || ''
  );
  const [currentPage, setCurrentPage] = useState<number>(
    () => room?.currentPage || 1
  );
  const [customPdfUrl, setCustomPdfUrl] = useState<string | null>(null);
  const [customPdfTitle, setCustomPdfTitle] = useState<string | null>(null);
  const [customPageCount, setCustomPageCount] = useState<number>(1);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Lecture recording state
  const [activeSession, setActiveSession] = useState<LectureSession | null>(
    null
  );
  const [segments, setSegments] = useState<LectureSegment[]>([]);
  const [manualMemo, setManualMemo] = useState('');
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [statusToast, setStatusToast] = useState<string | null>(null);

  // API key settings popover
  const [showApiModal, setShowApiModal] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(() => getStoredGeminiApiKey());

  const projectorRef = useRef<HTMLDivElement | null>(null);
  const segmentsRef = useRef<LectureSegment[]>(segments);
  segmentsRef.current = segments;
  const currentPageRef = useRef<number>(currentPage);
  currentPageRef.current = currentPage;

  const activeDeck: DeckInfo | null = useMemo(
    () => getDeckById(selectedDeckId) ?? allDecks[0] ?? null,
    [allDecks, selectedDeckId]
  );

  const totalPages = customPdfUrl
    ? customPageCount
    : activeDeck?.pageCount ?? 1;

  const currentSlideMeta = useMemo(
    () => (customPdfUrl ? null : getSlideMeta(activeDeck, currentPage)),
    [activeDeck, currentPage, customPdfUrl]
  );

  const latestEndedSession = useMemo(
    () => sessions.find((s) => s.status === 'ended') ?? null,
    [sessions]
  );

  const chapterDecks = useMemo(
    () => allDecks.filter((d) => d.chapter === selectedChapter),
    [allDecks, selectedChapter]
  );

  const showToast = useCallback((msg: string) => {
    setStatusToast(msg);
    window.setTimeout(() => {
      setStatusToast((prev) => (prev === msg ? null : prev));
    }, 3500);
  }, []);

  // Append recognized speech or manual memo to current slide segment
  const appendTranscriptToCurrentSlide = useCallback(
    (text: string) => {
      const cleaned = text.trim();
      if (!cleaned) return;
      const page = currentPageRef.current;
      const meta = getSlideMeta(activeDeck, page);
      setSegments((prev) => {
        const now = Date.now();
        if (prev.length > 0 && prev[prev.length - 1].slidePage === page) {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          updated[updated.length - 1] = {
            ...last,
            endedAtMs: now,
            transcript: last.transcript
              ? `${last.transcript}\n${cleaned}`
              : cleaned,
          };
          return updated;
        }
        return [
          ...prev,
          {
            id: `seg_${now}_${page}`,
            slidePage: page,
            textbookPage: meta?.textbookPage ?? null,
            worksheetPage: meta?.worksheetPage ?? 1,
            topic: meta?.topic ?? `スライド p.${page}`,
            problemTag: meta?.problemTag ?? '',
            startedAtMs: now,
            endedAtMs: now,
            transcript: cleaned,
            aiNote: '',
            confusionCount: 0,
            questionCount: 0,
          },
        ];
      });
    },
    [activeDeck]
  );

  const {
    isRecording,
    isSpeechSupported,
    interimText,
    audioUrl,
    micError,
    elapsedSec,
    startRecording,
    stopRecording,
  } = useLectureRecorder({
    onFinalTranscript: appendTranscriptToCurrentSlide,
  });

  // Sync current deck & slide page to Firestore whenever teacher changes page or deck
  useEffect(() => {
    if (!activeDeck) return;
    const meta = getSlideMeta(activeDeck, currentPage);
    void syncRoomSlideState(roomId, {
      activeDeckId: activeDeck.id,
      activeDeckTitle: customPdfTitle ?? activeDeck.title,
      currentPage,
      totalPages,
      currentTextbookPage: meta?.textbookPage ?? 0,
      currentWorksheetPage: meta?.worksheetPage ?? 1,
      activeSessionId: activeSession?.id ?? '',
      lectureActive: Boolean(activeSession),
      lectureStartedAtMs: activeSession?.startedAtMs ?? 0,
    });
  }, [
    activeDeck,
    activeSession,
    currentPage,
    customPdfTitle,
    roomId,
    totalPages,
  ]);

  // Track slide change into lecture segments when lecture is active
  const goToPage = useCallback(
    (nextPage: number) => {
      const clamped = Math.min(Math.max(1, nextPage), totalPages);
      setCurrentPage(clamped);

      if (activeSession && activeDeck) {
        const now = Date.now();
        const meta = getSlideMeta(activeDeck, clamped);
        setSegments((prev) => {
          const updated = prev.map((seg, i) =>
            i === prev.length - 1 ? { ...seg, endedAtMs: now } : seg
          );
          if (
            updated.length > 0 &&
            updated[updated.length - 1].slidePage === clamped
          ) {
            return updated;
          }
          return [
            ...updated,
            {
              id: `seg_${now}_${clamped}`,
              slidePage: clamped,
              textbookPage: meta?.textbookPage ?? null,
              worksheetPage: meta?.worksheetPage ?? 1,
              topic: meta?.topic ?? `スライド p.${clamped}`,
              problemTag: meta?.problemTag ?? '',
              startedAtMs: now,
              endedAtMs: now,
              transcript: '',
              aiNote: '',
              confusionCount: 0,
              questionCount: 0,
            },
          ];
        });
      }
    },
    [activeDeck, activeSession, totalPages]
  );

  // Keyboard navigation in projector mode
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        goToPage(currentPageRef.current + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        goToPage(currentPageRef.current - 1);
      } else if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goToPage, isFullscreen]);

  // Sync confused/question counts on active lecture segments
  const pageConfusionMap = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const s of signals) {
      if (s.status === 'confused' && s.slidePage) {
        counts[s.slidePage] = (counts[s.slidePage] ?? 0) + 1;
      }
    }
    return counts;
  }, [signals]);

  const handleStartLecture = async () => {
    if (!activeDeck) return;
    const now = Date.now();
    const meta = getSlideMeta(activeDeck, currentPage);
    const sessionId = `lec_${now}`;
    const initialSegment: LectureSegment = {
      id: `seg_${now}_${currentPage}`,
      slidePage: currentPage,
      textbookPage: meta?.textbookPage ?? null,
      worksheetPage: meta?.worksheetPage ?? 1,
      topic: meta?.topic ?? `スライド p.${currentPage}`,
      problemTag: meta?.problemTag ?? '',
      startedAtMs: now,
      endedAtMs: now,
      transcript: '',
      aiNote: '',
      confusionCount: 0,
      questionCount: 0,
    };

    const newSession: LectureSession = {
      id: sessionId,
      roomId,
      teacherUid,
      deckId: activeDeck.id,
      deckTitle: customPdfTitle ?? activeDeck.title,
      unitKey: activeDeck.unitKey,
      chapter: activeDeck.chapter,
      chapterName: activeDeck.chapterName,
      sectionLabel: activeDeck.sectionLabel,
      startPage: currentPage,
      endPage: currentPage,
      textbookPageRange: meta?.textbookPage ? `p.${meta.textbookPage}` : '',
      worksheetPageRange: `p.${meta?.worksheetPage ?? 1}`,
      startedAtMs: now,
      endedAtMs: 0,
      status: 'live',
      summary: '授業進行中...',
      keyPoints: [],
      segments: [initialSegment],
      confusedPages: {},
      unresolvedQuestionCount: 0,
      updatedAtMs: now,
    };

    setActiveSession(newSession);
    setSegments([initialSegment]);
    await startRecording();
    await persistLectureSession(roomId, newSession);
    showToast(
      `授業を開始しました（${activeDeck.title} p.${currentPage}〜 · 録音＆文字起こし中）`
    );
  };

  const handleEndLecture = async () => {
    if (!activeSession || !activeDeck || isFinalizing) return;
    setIsFinalizing(true);
    stopRecording();

    const now = Date.now();
    // Enrich segments with confusion & question counts during this session
    const sessionMessages = messages.filter(
      (m) => m.createdAtMs >= activeSession.startedAtMs
    );
    const confusedPages: Record<string, number> = {};
    const enrichedSegments = segmentsRef.current.map((seg, idx) => {
      const segEnd = idx === segmentsRef.current.length - 1 ? now : seg.endedAtMs;
      const qCount = sessionMessages.filter(
        (m) => m.slidePage === seg.slidePage
      ).length;
      const cCount = pageConfusionMap[seg.slidePage] ?? seg.confusionCount;
      if (cCount > 0) {
        confusedPages[String(seg.slidePage)] = cCount;
      }
      return {
        ...seg,
        endedAtMs: segEnd,
        confusionCount: cCount,
        questionCount: qCount,
      };
    });

    const tbPages = enrichedSegments
      .map((s) => s.textbookPage)
      .filter((p): p is number => p != null && p > 0);
    const wsPages = enrichedSegments
      .map((s) => s.worksheetPage)
      .filter((p) => p > 0);

    const textbookPageRange =
      tbPages.length > 0
        ? `p.${Math.min(...tbPages)}〜p.${Math.max(...tbPages)}`
        : '';
    const worksheetPageRange =
      wsPages.length > 0
        ? `p.${Math.min(...wsPages)}〜p.${Math.max(...wsPages)}`
        : 'p.1';

    const generated = await generateLectureNotes(activeDeck, enrichedSegments);

    const finalized: LectureSession = {
      ...activeSession,
      endPage: currentPage,
      endedAtMs: now,
      status: 'ended',
      textbookPageRange,
      worksheetPageRange,
      summary: generated.summary,
      keyPoints: generated.keyPoints,
      segments: generated.segments,
      confusedPages,
      unresolvedQuestionCount: sessionMessages.filter((m) => !m.resolved).length,
      updatedAtMs: now,
    };

    await persistLectureSession(roomId, finalized);
    await syncRoomSlideState(roomId, {
      lectureActive: false,
      activeSessionId: '',
      lastEndedDeckId: activeDeck.id,
      lastEndedPage: currentPage,
    });

    setActiveSession(null);
    setIsFinalizing(false);
    onSessionSaved(finalized);
    showToast('授業を終了し、講義記録を作成・保存しました！');
  };

  const handleResumePrevious = () => {
    if (!latestEndedSession) return;
    const deck = getDeckById(latestEndedSession.deckId);
    if (deck) {
      setCustomPdfUrl(null);
      setCustomPdfTitle(null);
      setSelectedChapter(deck.chapter);
      setSelectedDeckId(deck.id);
      const nextStart = Math.min(
        deck.pageCount,
        latestEndedSession.endPage + 1
      );
      setCurrentPage(nextStart);
      showToast(
        `前回の続き（${deck.title} スライド p.${nextStart}）にセットしました`
      );
    }
  };

  const handleLocalPdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (customPdfUrl) URL.revokeObjectURL(customPdfUrl);
    const url = URL.createObjectURL(file);
    setCustomPdfUrl(url);
    setCustomPdfTitle(file.name);
    setCurrentPage(1);
    showToast(`ローカルPDF「${file.name}」を読み込みました`);
  };

  // Keep isFullscreen synced when user exits fullscreen via browser Esc key
  useEffect(() => {
    const handleFsChange = () => {
      if (!document.fullscreenElement) {
        setIsFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const handleCustomPageCountLoaded = useCallback(
    (n: number) => {
      if (customPdfUrl) setCustomPageCount(n);
    },
    [customPdfUrl]
  );

  const toggleFullscreen = () => {
    if (!isFullscreen) {
      setIsFullscreen(true);
      void projectorRef.current?.requestFullscreen?.().catch(() => {});
    } else {
      setIsFullscreen(false);
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => {});
      }
    }
  };

  const pdfUrlToDisplay = customPdfUrl ?? activeDeck?.slidePdfUrl ?? null;

  return (
    <div className="space-y-4">
      {/* Previous Session Resume Banner */}
      {!activeSession && latestEndedSession && (
        <div className="bg-gradient-to-r from-indigo-50 via-blue-50 to-sky-50 border border-blue-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-900">
              <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>
                前回の終了地点：{latestEndedSession.deckTitle}（スライド p.
                {latestEndedSession.startPage} → p.{latestEndedSession.endPage}
                {latestEndedSession.textbookPageRange
                  ? ` / 教科書 ${latestEndedSession.textbookPageRange}`
                  : ''}
                ）
              </span>
            </div>
            <p className="text-[11px] text-slate-600 truncate">
              {latestEndedSession.summary}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleResumePrevious}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>
                前回の続き (p.{latestEndedSession.endPage + 1}) をセット
              </span>
            </button>
            <button
              type="button"
              onClick={() => onJumpToReview(latestEndedSession.id)}
              className="px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-white hover:bg-indigo-50 border border-indigo-200 rounded-lg transition-colors cursor-pointer"
            >
              前回の振り返りを見る
            </button>
          </div>
        </div>
      )}

      {/* Deck Selection + Start/End Lecture Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Chapter & Deck Selectors */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs">
              {[1, 2, 3, 4, 5].map((ch) => (
                <button
                  key={ch}
                  type="button"
                  disabled={Boolean(activeSession)}
                  onClick={() => {
                    setSelectedChapter(ch);
                    const first = allDecks.find((d) => d.chapter === ch);
                    if (first) {
                      setCustomPdfUrl(null);
                      setCustomPdfTitle(null);
                      setSelectedDeckId(first.id);
                      setCurrentPage(1);
                    }
                  }}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer disabled:opacity-50 ${
                    selectedChapter === ch
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {ch}章
                </button>
              ))}
            </div>

            <select
              value={selectedDeckId}
              disabled={Boolean(activeSession)}
              onChange={(e) => {
                setCustomPdfUrl(null);
                setCustomPdfTitle(null);
                setSelectedDeckId(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-1.5 text-xs font-medium bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
            >
              {chapterDecks.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}（{d.pageCount}枚）
                </option>
              ))}
            </select>

            <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer transition-colors">
              <Upload className="w-3.5 h-3.5" />
              <span>別PDFを開く</span>
              <input
                type="file"
                accept="application/pdf"
                onChange={handleLocalPdfUpload}
                className="hidden"
              />
            </label>
          </div>

          {/* Start / End Lecture + AI Settings */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowApiModal((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                getStoredGeminiApiKey()
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
              title="Gemini APIキー設定（任意）"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>{getStoredGeminiApiKey() ? 'AI連携ON' : 'AI設定'}</span>
            </button>

            {!activeSession ? (
              <button
                type="button"
                onClick={() => void handleStartLecture()}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                <Mic className="w-4 h-4" />
                <span>このページ (p.{currentPage}) から授業を開始</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={isFinalizing}
                onClick={() => void handleEndLecture()}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-60 rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>
                  {isFinalizing
                    ? '講義記録を作成中...'
                    : `授業を終了して記録を作成 (${formatDuration(elapsedSec)})`}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Optional Gemini API Key Drawer */}
        {showApiModal && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="space-y-0.5">
              <p className="font-semibold text-slate-800">
                Gemini API キー（任意・ブラウザ内のみ保存）
              </p>
              <p className="text-[11px] text-slate-500">
                設定すると講義記録のAI要約や生徒ごとの演習問題生成がさらに高度になります（未設定でも標準エンジンで動作します）。
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder="AIza..."
                className="px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md w-56"
              />
              <button
                type="button"
                onClick={() => {
                  setStoredGeminiApiKey(apiKeyInput);
                  setShowApiModal(false);
                  showToast(
                    apiKeyInput.trim()
                      ? 'Gemini APIキーを保存しました'
                      : 'APIキーをクリアしました'
                  );
                }}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md cursor-pointer"
              >
                保存
              </button>
            </div>
          </div>
        )}

        {/* Linked Metadata Bar (Slide <-> Textbook <-> Worksheet) */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-900 text-white font-mono-tabular font-semibold">
              デジタル板書 p.{currentPage} / {totalPages}
            </span>
            {currentSlideMeta?.textbookPage && (
              <a
                href={activeDeck?.textbookPdfUrl || '#'}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-200 font-semibold hover:bg-blue-100 transition-colors"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>教科書 p.{currentSlideMeta.textbookPage}</span>
              </a>
            )}
            {activeDeck?.worksheetQuestionPdfUrl && (
              <a
                href={activeDeck.worksheetQuestionPdfUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold hover:bg-emerald-100 transition-colors"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>
                  ワークシート p.{currentSlideMeta?.worksheetPage ?? 1} /{' '}
                  {activeDeck.worksheetPageCount}
                </span>
              </a>
            )}
            {currentSlideMeta?.topic && (
              <span className="text-slate-600 font-medium">
                {currentSlideMeta.topic}
                {currentSlideMeta.problemTag
                  ? `（${currentSlideMeta.problemTag}）`
                  : ''}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {audioUrl && !isRecording && (
              <a
                href={audioUrl}
                download={`lecture_${roomId}_${new Date().toISOString().slice(0, 10)}.webm`}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium"
              >
                <Download className="w-3.5 h-3.5" />
                <span>録音音声を保存</span>
              </a>
            )}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-slate-900 hover:bg-slate-800 text-white font-semibold cursor-pointer"
            >
              {isFullscreen ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
              <span>{isFullscreen ? '全画面終了' : 'プロジェクター全画面'}</span>
            </button>
          </div>
        </div>

        {/* Live Recording Status & Quick Manual Note */}
        {activeSession && (
          <div className="bg-rose-50/80 border border-rose-200 rounded-lg px-3 py-2.5 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-rose-600 text-white font-bold text-[11px]">
                  <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  REC {formatDuration(elapsedSec)}
                </span>
                <span className="text-rose-900 font-medium">
                  {isSpeechSupported
                    ? '音声をリアルタイム文字起こし中（スライド移動と自動連動）'
                    : '録音中（このブラウザは音声認識非対応のため下のメモ欄が使えます）'}
                </span>
              </div>
              <span className="text-[11px] font-mono-tabular text-rose-700">
                記録区間: {segments.length}ページ分
              </span>
            </div>
            {interimText && (
              <p className="text-xs text-slate-700 bg-white/80 rounded px-2.5 py-1 italic">
                🎙️ {interimText}
              </p>
            )}
            {micError && (
              <p className="text-[11px] text-amber-800 flex items-center gap-1">
                <MicOff className="w-3.5 h-3.5 shrink-0" />
                <span>{micError}</span>
              </p>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!manualMemo.trim()) return;
                appendTranscriptToCurrentSlide(`【教員メモ】${manualMemo.trim()}`);
                setManualMemo('');
                showToast(`スライド p.${currentPage} にメモを記録しました`);
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={manualMemo}
                onChange={(e) => setManualMemo(e.target.value)}
                placeholder={`スライド p.${currentPage} の板書ポイントや補足メモを追加...`}
                className="flex-1 px-3 py-1.5 text-xs bg-white border border-rose-200 rounded-md focus:outline-none focus:ring-2 focus:ring-rose-400"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-md cursor-pointer"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>記録</span>
              </button>
            </form>
          </div>
        )}

        {statusToast && (
          <div className="text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            {statusToast}
          </div>
        )}
      </div>

      {/* Projector Viewport */}
      <div
        ref={projectorRef}
        className={`${
          isFullscreen
            ? 'fixed inset-0 z-50 h-screen w-screen overflow-hidden bg-slate-950 p-2.5 flex flex-col gap-2'
            : 'relative'
        }`}
      >
        {/* Live Student Comments & Confused Bar inside Fullscreen Projector */}
        {isFullscreen && (
          <div className="shrink-0">
            <TeacherTickerBar
              roomId={roomId}
              confusedCount={confusedCount}
              activeMessages={activeTickerMessages}
              chatPaused={Boolean(room?.chatPaused)}
              nowMs={nowMs}
              isResetting={isResetting}
              onResetAll={onResetAll}
              onResolveMessage={onResolveMessage}
            />
          </div>
        )}

        <PdfPageViewer
          url={pdfUrlToDisplay}
          page={currentPage}
          onPageCountLoaded={handleCustomPageCountLoaded}
          fitToContainer={isFullscreen}
          darkBackdrop={isFullscreen}
          maxHeightClass="max-h-[68vh]"
        />

        {/* Slide Navigation Bar */}
        <div
          className={`${isFullscreen ? 'shrink-0' : 'mt-2'} flex flex-wrap items-center justify-between gap-3 px-4 py-2 rounded-xl border ${
            isFullscreen
              ? 'bg-slate-900 border-slate-800 text-slate-100'
              : 'bg-white border-slate-200 text-slate-900'
          }`}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => goToPage(currentPage - 1)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-900 disabled:opacity-40 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>前へ</span>
            </button>

            <div className="flex items-center gap-1.5 text-xs">
              <input
                type="number"
                min={1}
                max={totalPages}
                value={currentPage}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!Number.isNaN(v)) goToPage(v);
                }}
                className="w-16 px-2 py-1 text-center font-mono-tabular font-bold bg-slate-50 border border-slate-300 rounded-md text-slate-900"
              />
              <span className="text-slate-500 font-mono-tabular">
                / {totalPages}
              </span>
            </div>

            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => goToPage(currentPage + 1)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 cursor-pointer"
            >
              <span>次へ</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-semibold ${
                confusedCount > 0
                  ? 'bg-rose-600 text-white'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>現在の「？」: {confusedCount}人</span>
            </span>
            {isFullscreen && (
              <button
                type="button"
                onClick={toggleFullscreen}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-semibold cursor-pointer"
              >
                全画面を閉じる
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

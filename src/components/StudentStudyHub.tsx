import { useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  BookOpen,
  Brain,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  HelpCircle,
  Lightbulb,
  MessageSquarePlus,
  RefreshCw,
  Send,
  Sparkles,
  Trophy,
} from 'lucide-react';
import {
  generateAdaptiveProblems,
  generateCommentHint,
} from '../services/aiTutorService';
import {
  persistNoteComment,
  persistStudentLog,
} from '../services/lectureStore';
import { getDeckById, getMainDecks } from '../services/materialsService';
import type {
  AdaptiveProblem,
  LectureSession,
  NoteComment,
  RoomData,
  StudentLearningLog,
} from '../types';
import { PdfPageViewer } from './PdfPageViewer';

interface StudentStudyHubProps {
  user: User;
  roomId: string;
  anonId: string;
  room: RoomData | null;
  sessions: LectureSession[];
  comments: NoteComment[];
  myLogs: StudentLearningLog[];
  initialTab?: 'worksheet' | 'practice';
}

export function StudentStudyHub({
  user,
  roomId,
  anonId,
  room,
  sessions,
  comments,
  myLogs,
  initialTab = 'worksheet',
}: StudentStudyHubProps) {
  const mainDecks = useMemo(() => getMainDecks(), []);
  const [subTab, setSubTab] = useState<'worksheet' | 'practice'>(initialTab);

  // Worksheet & Linked Notes state
  const [selectedDeckId, setSelectedDeckId] = useState<string>(
    () =>
      room?.activeDeckId ||
      sessions[0]?.deckId ||
      mainDecks[0]?.id ||
      'm1-ch1-s1'
  );
  const [pdfMode, setPdfMode] = useState<'question' | 'answer' | 'detail'>(
    'question'
  );
  const [wsPage, setWsPage] = useState<number>(
    () => room?.currentWorksheetPage || 1
  );
  const [pdfPageCount, setPdfPageCount] = useState<number>(1);
  const [showAllSegments, setShowAllSegments] = useState(false);

  // Comment on lecture note state
  const [commentTargetPage, setCommentTargetPage] = useState<number | null>(
    null
  );
  const [commentText, setCommentText] = useState('');
  const [commentKind, setCommentKind] = useState<'confused' | 'question'>(
    'confused'
  );
  const [submittingComment, setSubmittingComment] = useState(false);

  // Adaptive practice state
  const [difficulty, setDifficulty] = useState<
    'basic' | 'standard' | 'challenge'
  >('basic');
  const [problems, setProblems] = useState<AdaptiveProblem[]>([]);
  const [generatingProblems, setGeneratingProblems] = useState(false);
  const [selectedAnswers, setSelectedAnswers] = useState<
    Record<string, string>
  >({});
  const [revealedHints, setRevealedHints] = useState<Record<string, number>>(
    {}
  );
  const [gradedIds, setGradedIds] = useState<Record<string, boolean>>({});

  const activeDeck = useMemo(
    () => getDeckById(selectedDeckId) ?? mainDecks[0] ?? null,
    [mainDecks, selectedDeckId]
  );

  // Sessions matching this unit/deck
  const unitSessions = useMemo(() => {
    if (!activeDeck) return sessions;
    const matched = sessions.filter(
      (s) => s.deckId === activeDeck.id || s.unitKey === activeDeck.unitKey
    );
    return matched.length > 0 ? matched : sessions;
  }, [activeDeck, sessions]);

  const activeSession = unitSessions[0] ?? null;

  // Segments linked to current worksheet page (or all segments)
  const linkedSegments = useMemo(() => {
    if (!activeSession) return [];
    if (showAllSegments) return activeSession.segments;
    const matched = activeSession.segments.filter(
      (seg) => seg.worksheetPage === wsPage
    );
    return matched.length > 0 ? matched : activeSession.segments;
  }, [activeSession, showAllSegments, wsPage]);

  const currentPdfUrl = useMemo(() => {
    if (!activeDeck) return null;
    if (pdfMode === 'question') return activeDeck.worksheetQuestionPdfUrl || null;
    if (pdfMode === 'answer') return activeDeck.worksheetAnswerPdfUrl || null;
    return activeDeck.detailedAnswerPdfUrl || null;
  }, [activeDeck, pdfMode]);

  // Weak spot analysis from personal logs
  const weakLogs = useMemo(
    () =>
      myLogs.filter(
        (l) =>
          l.eventType === 'confused' ||
          l.eventType === 'question' ||
          l.eventType === 'practice_wrong'
      ),
    [myLogs]
  );

  const practiceStats = useMemo(() => {
    const correct = myLogs.filter(
      (l) => l.eventType === 'practice_correct'
    ).length;
    const wrong = myLogs.filter((l) => l.eventType === 'practice_wrong').length;
    return {
      correct,
      total: correct + wrong,
      rate:
        correct + wrong > 0
          ? Math.round((correct / (correct + wrong)) * 100)
          : 0,
    };
  }, [myLogs]);

  const handlePostNoteComment = async (
    slidePage: number,
    textbookPage: number | null,
    worksheetPage: number,
    topic: string,
    transcript: string
  ) => {
    if (!activeSession || !activeDeck || !commentText.trim() || submittingComment)
      return;
    setSubmittingComment(true);
    try {
      const text = commentText.trim();
      const aiHint = await generateCommentHint({
        deckTitle: activeDeck.title,
        topic,
        textbookPage,
        worksheetPage,
        questionText: text,
        transcript,
      });

      const comment: NoteComment = {
        id: `cmt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        roomId,
        sessionId: activeSession.id,
        deckId: activeDeck.id,
        slidePage,
        textbookPage,
        worksheetPage,
        authorUid: user.uid,
        authorName: anonId,
        authorRole: 'student',
        kind: commentKind,
        text,
        resolved: false,
        aiHint,
        createdAtMs: Date.now(),
      };
      await persistNoteComment(roomId, comment);

      await persistStudentLog(roomId, {
        id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        roomId,
        studentUid: user.uid,
        studentEmail: user.email ?? '',
        studentName: user.displayName ?? anonId,
        deckId: activeDeck.id,
        deckTitle: activeDeck.title,
        chapter: activeDeck.chapter,
        slidePage,
        textbookPage,
        worksheetPage,
        topic,
        eventType: commentKind === 'confused' ? 'confused' : 'question',
        detail: text,
        createdAtMs: Date.now(),
      });

      setCommentText('');
      setCommentTargetPage(null);
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleGenerateProblems = async () => {
    setGeneratingProblems(true);
    try {
      const next = await generateAdaptiveProblems({
        weakLogs,
        fallbackChapter: activeDeck?.chapter ?? 1,
        fallbackDeckId: activeDeck?.id ?? 'm1-ch1-s1',
        difficulty,
      });
      setProblems(next);
      setSelectedAnswers({});
      setRevealedHints({});
      setGradedIds({});
    } finally {
      setGeneratingProblems(false);
    }
  };

  const handleCheckAnswer = async (prob: AdaptiveProblem) => {
    const chosen = selectedAnswers[prob.id];
    if (!chosen) return;
    setGradedIds((prev) => ({ ...prev, [prob.id]: true }));
    const isCorrect = chosen === prob.answer;
    await persistStudentLog(roomId, {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      roomId,
      studentUid: user.uid,
      studentEmail: user.email ?? '',
      studentName: user.displayName ?? anonId,
      deckId: prob.deckId,
      deckTitle: activeDeck?.title ?? `数学Ⅰ 第${prob.chapter}章`,
      chapter: prob.chapter,
      slidePage: 1,
      textbookPage: prob.textbookPage ?? null,
      worksheetPage: prob.worksheetPage ?? 1,
      topic: prob.topic,
      eventType: isCorrect ? 'practice_correct' : 'practice_wrong',
      detail: `${prob.question} -> ${isCorrect ? '正解' : '不正解'}`,
      createdAtMs: Date.now(),
    });
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-4">
      {/* Sub-navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-3">
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg text-xs">
          <button
            type="button"
            onClick={() => setSubTab('worksheet')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-colors cursor-pointer ${
              subTab === 'worksheet'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-emerald-600" />
            <span>ワークシート＆講義記録</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('practice')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-colors cursor-pointer ${
              subTab === 'practice'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Brain className="w-3.5 h-3.5 text-indigo-600" />
            <span>AI個別最適演習</span>
            {weakLogs.length > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-rose-100 text-rose-700 rounded-full">
                苦手 {weakLogs.length}
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <select
            value={selectedDeckId}
            onChange={(e) => {
              setSelectedDeckId(e.target.value);
              setWsPage(1);
            }}
            className="px-3 py-1.5 text-xs font-medium bg-slate-50 border border-slate-300 rounded-lg text-slate-900"
          >
            {mainDecks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {subTab === 'worksheet' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left: Worksheet & Answer PDF Viewer */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setPdfMode('question');
                    setWsPage(1);
                  }}
                  className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                    pdfMode === 'question'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  ワークシート問題
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPdfMode('answer');
                    setWsPage(1);
                  }}
                  className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                    pdfMode === 'answer'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  ワーク解答付PDF
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPdfMode('detail');
                    setWsPage(1);
                  }}
                  className={`px-2.5 py-1 rounded-md font-semibold cursor-pointer ${
                    pdfMode === 'detail'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600'
                  }`}
                >
                  教科書 詳細解答
                </button>
              </div>

              <div className="flex items-center gap-1.5 text-xs">
                <button
                  type="button"
                  disabled={wsPage <= 1}
                  onClick={() => setWsPage((p) => Math.max(1, p - 1))}
                  className="p-1.5 rounded-md bg-slate-100 hover:bg-slate-200 disabled:opacity-40 cursor-pointer"
                  aria-label="前のページ"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-mono-tabular font-bold text-slate-700 px-1">
                  p.{wsPage} / {pdfPageCount}
                </span>
                <button
                  type="button"
                  disabled={wsPage >= pdfPageCount}
                  onClick={() =>
                    setWsPage((p) => Math.min(pdfPageCount, p + 1))
                  }
                  className="p-1.5 rounded-md bg-slate-100 hover:bg-slate-200 disabled:opacity-40 cursor-pointer"
                  aria-label="次のページ"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <PdfPageViewer
              url={currentPdfUrl}
              page={wsPage}
              onPageCountLoaded={setPdfPageCount}
              maxHeightClass="max-h-[70vh]"
            />
          </div>

          {/* Right: Linked Lecture Notes & "ここがわからない" Comments */}
          <div className="lg:col-span-5 space-y-3">
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-indigo-600" />
                  <h2 className="text-sm font-bold text-slate-900">
                    リンクされた講義記録
                  </h2>
                </div>
                {activeSession && (
                  <button
                    type="button"
                    onClick={() => setShowAllSegments((v) => !v)}
                    className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
                  >
                    {showAllSegments
                      ? `ワーク p.${wsPage} のみに絞る`
                      : '授業全体を表示'}
                  </button>
                )}
              </div>

              {!activeSession ? (
                <div className="p-5 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-center space-y-2">
                  <Sparkles className="w-6 h-6 text-slate-400 mx-auto" />
                  <p className="text-xs font-semibold text-slate-700">
                    この単元の講義記録はまだありません
                  </p>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    先生が授業を開始・終了すると、ワークシートのページと連動した講義記録と解説ログがここに表示されます。
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 rounded-lg bg-indigo-50/70 border border-indigo-100 space-y-1 text-xs">
                    <div className="flex items-center justify-between text-[11px] text-indigo-700 font-semibold">
                      <span>{activeSession.deckTitle}</span>
                      <span>
                        板書 p.{activeSession.startPage}〜{activeSession.endPage}
                      </span>
                    </div>
                    <p className="text-slate-700 leading-relaxed">
                      {activeSession.summary}
                    </p>
                  </div>

                  <div className="space-y-2.5 max-h-[54vh] overflow-y-auto pr-1">
                    {linkedSegments.map((seg) => {
                      const segComments = comments.filter(
                        (c) =>
                          c.sessionId === activeSession.id &&
                          c.slidePage === seg.slidePage
                      );
                      const isCommenting = commentTargetPage === seg.slidePage;
                      return (
                        <div
                          key={seg.id}
                          className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px]">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="px-1.5 py-0.5 rounded bg-slate-900 text-white font-mono-tabular font-bold">
                                板書 p.{seg.slidePage}
                              </span>
                              {seg.textbookPage && (
                                <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 font-semibold">
                                  教科書 p.{seg.textbookPage}
                                </span>
                              )}
                              <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">
                                ワーク p.{seg.worksheetPage}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setCommentTargetPage(
                                  isCommenting ? null : seg.slidePage
                                )
                              }
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600 hover:text-rose-700 cursor-pointer"
                            >
                              <MessageSquarePlus className="w-3.5 h-3.5" />
                              <span>ここがわからない</span>
                            </button>
                          </div>

                          <p className="text-xs font-bold text-slate-900">
                            {seg.topic}
                            {seg.problemTag ? `（${seg.problemTag}）` : ''}
                          </p>

                          {seg.aiNote && (
                            <p className="text-xs text-slate-700 leading-relaxed bg-white rounded-lg p-2 border border-slate-200">
                              {seg.aiNote}
                            </p>
                          )}

                          {seg.transcript && (
                            <details className="text-[11px] text-slate-600">
                              <summary className="cursor-pointer font-semibold text-slate-500 hover:text-slate-700">
                                先生の解説ログを読む
                              </summary>
                              <p className="mt-1 p-2 bg-white rounded border border-slate-200 whitespace-pre-wrap leading-relaxed">
                                {seg.transcript}
                              </p>
                            </details>
                          )}

                          {/* Existing comments & AI hints */}
                          {segComments.length > 0 && (
                            <div className="space-y-1.5 pt-1">
                              {segComments.map((c) => (
                                <div
                                  key={c.id}
                                  className={`p-2 rounded-lg text-[11px] space-y-1 border ${
                                    c.authorRole === 'teacher'
                                      ? 'bg-blue-50 border-blue-200'
                                      : 'bg-amber-50 border-amber-200'
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-slate-800">
                                      {c.authorName}
                                    </span>
                                    {c.resolved && (
                                      <span className="text-emerald-700 font-semibold">
                                        解決済
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-slate-800">{c.text}</p>
                                  {c.aiHint && (
                                    <p className="text-indigo-800 bg-white/90 rounded p-1.5 leading-relaxed">
                                      {c.aiHint}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Comment Form */}
                          {isCommenting && (
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                void handlePostNoteComment(
                                  seg.slidePage,
                                  seg.textbookPage,
                                  seg.worksheetPage,
                                  seg.topic,
                                  seg.transcript
                                );
                              }}
                              className="space-y-2 pt-1.5 border-t border-slate-200"
                            >
                              <div className="flex items-center gap-2 text-[11px]">
                                <button
                                  type="button"
                                  onClick={() => setCommentKind('confused')}
                                  className={`px-2 py-0.5 rounded font-semibold cursor-pointer ${
                                    commentKind === 'confused'
                                      ? 'bg-rose-600 text-white'
                                      : 'bg-slate-200 text-slate-700'
                                  }`}
                                >
                                  ここがわからない
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setCommentKind('question')}
                                  className={`px-2 py-0.5 rounded font-semibold cursor-pointer ${
                                    commentKind === 'question'
                                      ? 'bg-blue-600 text-white'
                                      : 'bg-slate-200 text-slate-700'
                                  }`}
                                >
                                  質問する
                                </button>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={commentText}
                                  onChange={(e) =>
                                    setCommentText(e.target.value)
                                  }
                                  placeholder="どこでつまずいたか入力（AIヒントも即表示）..."
                                  className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                                />
                                <button
                                  type="submit"
                                  disabled={submittingComment}
                                  className="p-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50 cursor-pointer"
                                >
                                  <Send className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </form>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Adaptive Personalized Practice View */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left: Personal Weak Spot Analysis & Mastery */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-500" />
                  <h2 className="text-sm font-bold text-slate-900">
                    あなたの学習状況
                  </h2>
                </div>
                <span className="text-xs font-mono-tabular font-bold text-indigo-600">
                  正答率 {practiceStats.rate}%
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-100">
                  <p className="text-[11px] text-rose-700 font-medium">
                    記録された「？」
                  </p>
                  <p className="text-xl font-bold font-mono-tabular text-rose-700">
                    {weakLogs.length}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100">
                  <p className="text-[11px] text-emerald-700 font-medium">
                    演習クリア数
                  </p>
                  <p className="text-xl font-bold font-mono-tabular text-emerald-700">
                    {practiceStats.correct}
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-bold text-slate-800">
                  最近のつまずきポイント
                </p>
                {weakLogs.length === 0 ? (
                  <p className="text-xs text-slate-500 leading-relaxed">
                    授業中に「わからない！」を押すか、講義記録にコメントすると、ここに自動で苦手リストが蓄積されます。選択中の単元で今すぐ演習を始めることもできます！
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {weakLogs.slice(0, 6).map((l) => (
                      <div
                        key={l.id}
                        className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-xs flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 truncate">
                            {l.topic || l.deckTitle}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            板書 p.{l.slidePage} / ワーク p.{l.worksheetPage}
                          </p>
                        </div>
                        <HelpCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="bg-gradient-to-br from-indigo-600 to-blue-700 text-white rounded-xl p-4 space-y-3">
              <div className="space-y-1">
                <h3 className="text-sm font-bold flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>個別最適ドリルを作成</span>
                </h3>
                <p className="text-xs text-blue-100 leading-relaxed">
                  あなたのつまずき履歴（または選択中の単元）に合わせて、確認問題3問と段階的ヒントを生成します。
                </p>
              </div>
              <div className="grid grid-cols-3 gap-1.5 text-xs">
                {(
                  [
                    { k: 'basic', label: '基礎固め' },
                    { k: 'standard', label: '標準演習' },
                    { k: 'challenge', label: '応用挑戦' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.k}
                    type="button"
                    onClick={() => setDifficulty(item.k)}
                    className={`py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                      difficulty === item.k
                        ? 'bg-white text-indigo-700'
                        : 'bg-white/15 hover:bg-white/25 text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                disabled={generatingProblems}
                onClick={() => void handleGenerateProblems()}
                className="w-full py-2.5 px-4 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-60 transition-colors cursor-pointer"
              >
                <RefreshCw
                  className={`w-4 h-4 ${generatingProblems ? 'animate-spin' : ''}`}
                />
                <span>
                  {generatingProblems
                    ? '問題を生成中...'
                    : '自分専用の問題を3問生成する'}
                </span>
              </button>
            </div>
          </div>

          {/* Right: Generated Adaptive Problems */}
          <div className="lg:col-span-8 space-y-4">
            {problems.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
                <Brain className="w-10 h-10 text-indigo-500 mx-auto" />
                <h3 className="text-base font-bold text-slate-900">
                  「自分専用の問題を3問生成する」を押してスタート！
                </h3>
                <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
                  つまずいたページや選択中の単元（{activeDeck?.title}）に合わせて、ヒント付きの確認問題を自動生成します。
                </p>
              </div>
            ) : (
              problems.map((prob, index) => {
                const chosen = selectedAnswers[prob.id];
                const isGraded = Boolean(gradedIds[prob.id]);
                const isCorrect = isGraded && chosen === prob.answer;
                const hintLevel = revealedHints[prob.id] ?? 0;

                return (
                  <div
                    key={prob.id}
                    className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="px-2 py-0.5 rounded-md bg-indigo-600 text-white font-bold">
                          第 {index + 1} 問
                        </span>
                        <span className="font-bold text-slate-800">
                          {prob.topic}
                        </span>
                      </div>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                        {prob.source === 'ai' ? 'AI生成' : '数学Ⅰアダプティブ'}
                      </span>
                    </div>

                    <p className="text-sm font-semibold text-slate-900 leading-relaxed">
                      {prob.question}
                    </p>

                    {prob.choices && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {prob.choices.map((choice) => {
                          const isSelected = chosen === choice;
                          const showCorrect =
                            isGraded && choice === prob.answer;
                          const showWrong =
                            isGraded && isSelected && choice !== prob.answer;
                          return (
                            <button
                              key={choice}
                              type="button"
                              disabled={isGraded}
                              onClick={() =>
                                setSelectedAnswers((prev) => ({
                                  ...prev,
                                  [prob.id]: choice,
                                }))
                              }
                              className={`text-left px-3.5 py-2.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                                showCorrect
                                  ? 'bg-emerald-50 border-emerald-500 text-emerald-900'
                                  : showWrong
                                    ? 'bg-rose-50 border-rose-500 text-rose-900'
                                    : isSelected
                                      ? 'bg-indigo-50 border-indigo-500 text-indigo-900'
                                      : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800'
                              }`}
                            >
                              {choice}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Hints */}
                    {prob.hints.length > 0 && hintLevel > 0 && (
                      <div className="space-y-1.5">
                        {prob.hints.slice(0, hintLevel).map((h, hi) => (
                          <div
                            key={hi}
                            className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2"
                          >
                            <Lightbulb className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                            <span>
                              ヒント{hi + 1}: {h}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      {!isGraded && hintLevel < prob.hints.length ? (
                        <button
                          type="button"
                          onClick={() =>
                            setRevealedHints((prev) => ({
                              ...prev,
                              [prob.id]: hintLevel + 1,
                            }))
                          }
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 hover:text-amber-800 cursor-pointer"
                        >
                          <Lightbulb className="w-3.5 h-3.5" />
                          <span>ヒントを見る ({hintLevel + 1}/{prob.hints.length})</span>
                        </button>
                      ) : (
                        <span />
                      )}

                      {!isGraded ? (
                        <button
                          type="button"
                          disabled={!chosen}
                          onClick={() => void handleCheckAnswer(prob)}
                          className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 rounded-lg transition-colors cursor-pointer"
                        >
                          答え合わせをする
                        </button>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-bold ${
                            isCorrect ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>
                            {isCorrect
                              ? '正解！すばらしい！'
                              : `惜しい！正解は「${prob.answer}」`}
                          </span>
                        </span>
                      )}
                    </div>

                    {isGraded && (
                      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 leading-relaxed">
                        <span className="block font-bold text-slate-900 mb-1">
                          解説
                        </span>
                        {prob.explanation}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

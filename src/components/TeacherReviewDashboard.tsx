import { useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  Clock,
  FileText,
  MessageSquare,
  Send,
  Sparkles,
  Users,
} from 'lucide-react';
import {
  persistNoteComment,
  toggleNoteCommentResolved,
} from '../services/lectureStore';
import { getDeckById } from '../services/materialsService';
import type {
  LectureSession,
  NoteComment,
  StudentLearningLog,
} from '../types';

interface TeacherReviewDashboardProps {
  roomId: string;
  teacherUid: string;
  teacherName: string;
  sessions: LectureSession[];
  comments: NoteComment[];
  studentLogs: StudentLearningLog[];
  initialSessionId?: string;
}

export function TeacherReviewDashboard({
  roomId,
  teacherUid,
  teacherName,
  sessions,
  comments,
  studentLogs,
  initialSessionId,
}: TeacherReviewDashboardProps) {
  const [selectedSessionId, setSelectedSessionId] = useState<string>(
    () => initialSessionId || sessions[0]?.id || ''
  );
  const [replyTargetKey, setReplyTargetKey] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const activeSession = useMemo(
    () =>
      sessions.find((s) => s.id === selectedSessionId) ?? sessions[0] ?? null,
    [selectedSessionId, sessions]
  );

  const deck = useMemo(
    () => getDeckById(activeSession?.deckId),
    [activeSession?.deckId]
  );

  const sessionComments = useMemo(() => {
    if (!activeSession) return [];
    return comments.filter((c) => c.sessionId === activeSession.id);
  }, [activeSession, comments]);

  // Top confused pages across this session
  const confusionRanking = useMemo(() => {
    if (!activeSession) return [];
    return [...activeSession.segments]
      .filter((s) => s.confusionCount > 0 || s.questionCount > 0)
      .sort(
        (a, b) =>
          b.confusionCount +
          b.questionCount -
          (a.confusionCount + a.questionCount)
      )
      .slice(0, 6);
  }, [activeSession]);

  // Group student learning logs by student email/name
  const studentSummary = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        email: string;
        confusedCount: number;
        topics: string[];
        lastAtMs: number;
      }
    >();
    for (const log of studentLogs) {
      if (log.eventType !== 'confused' && log.eventType !== 'question') continue;
      const key = log.studentUid || log.studentEmail || 'unknown';
      const existing = map.get(key) ?? {
        name: log.studentName || log.studentEmail || '生徒',
        email: log.studentEmail || '',
        confusedCount: 0,
        topics: [],
        lastAtMs: log.createdAtMs,
      };
      existing.confusedCount += 1;
      const label = `${log.topic} (p.${log.slidePage})`;
      if (!existing.topics.includes(label) && existing.topics.length < 4) {
        existing.topics.push(label);
      }
      if (log.createdAtMs > existing.lastAtMs) {
        existing.lastAtMs = log.createdAtMs;
      }
      map.set(key, existing);
    }
    return Array.from(map.values()).sort(
      (a, b) => b.confusedCount - a.confusedCount
    );
  }, [studentLogs]);

  const handleSendReply = async (
    slidePage: number,
    textbookPage: number | null,
    worksheetPage: number
  ) => {
    if (!activeSession || !replyText.trim()) return;
    const comment: NoteComment = {
      id: `cmt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      roomId,
      sessionId: activeSession.id,
      deckId: activeSession.deckId,
      slidePage,
      textbookPage,
      worksheetPage,
      authorUid: teacherUid,
      authorName: `${teacherName}（先生）`,
      authorRole: 'teacher',
      kind: 'reply',
      text: replyText.trim(),
      resolved: true,
      createdAtMs: Date.now(),
    };
    await persistNoteComment(roomId, comment);
    setReplyText('');
    setReplyTargetKey(null);
  };

  if (sessions.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
        <Sparkles className="w-8 h-8 text-indigo-500 mx-auto" />
        <h2 className="text-base font-bold text-slate-900">
          まだ保存された講義記録がありません
        </h2>
        <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
          「スライド＆授業進行」タブで単元と開始ページを選び、「授業を開始」→「授業を終了」と操作すると、ここに録音文字起こし・つまずき集計・ワークシート連動の講義記録が自動作成されます。
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Sidebar: Past Sessions List */}
      <aside className="lg:col-span-4 space-y-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">授業履歴一覧</h2>
            <span className="text-xs font-mono-tabular text-slate-500">
              {sessions.length}回
            </span>
          </div>
          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {sessions.map((s) => {
              const isSelected = activeSession?.id === s.id;
              const dateStr = new Date(s.startedAtMs).toLocaleString('ja-JP', {
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });
              const totalConfused = Object.values(s.confusedPages ?? {}).reduce(
                (a, b) => a + b,
                0
              );
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedSessionId(s.id)}
                  className={`w-full text-left p-3 rounded-xl border transition-colors cursor-pointer space-y-1 ${
                    isSelected
                      ? 'bg-indigo-50 border-indigo-300'
                      : 'bg-slate-50 hover:bg-slate-100 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {dateStr}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded font-semibold ${
                        s.status === 'live'
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {s.status === 'live' ? '進行中' : '記録済'}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-slate-900 truncate">
                    {s.deckTitle}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                    <span>
                      スライド p.{s.startPage}→{s.endPage}
                    </span>
                    {s.textbookPageRange && (
                      <span>教科書 {s.textbookPageRange}</span>
                    )}
                    {totalConfused > 0 && (
                      <span className="text-rose-600 font-semibold">
                        ？ {totalConfused}件
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Student Individual Struggles Summary */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900">
              生徒別つまずきフォロー
            </h3>
          </div>
          {studentSummary.length === 0 ? (
            <p className="text-xs text-slate-500">
              生徒が「わからない」や質問を送信すると、Googleアカウント別に集計されます。
            </p>
          ) : (
            <div className="space-y-2.5 max-h-64 overflow-y-auto">
              {studentSummary.map((st) => (
                <div
                  key={st.email || st.name}
                  className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-900 truncate">
                      {st.name}
                    </span>
                    <span className="text-[11px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">
                      つまずき {st.confusedCount}回
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    {st.topics.join(' / ')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Right Main: Selected Session Summary, Heatmap & Segments */}
      <div className="lg:col-span-8 space-y-4">
        {activeSession && (
          <>
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-indigo-600">
                    講義記録サマリー
                  </span>
                  <h2 className="text-lg font-bold text-slate-900">
                    {activeSession.deckTitle}
                  </h2>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                    <span className="px-2 py-0.5 rounded bg-slate-100 font-mono-tabular font-semibold">
                      デジタル板書 p.{activeSession.startPage}〜p.
                      {activeSession.endPage}
                    </span>
                    {activeSession.textbookPageRange && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold">
                        <BookOpen className="w-3.5 h-3.5" />
                        教科書 {activeSession.textbookPageRange}
                      </span>
                    )}
                    {activeSession.worksheetPageRange && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold">
                        <FileText className="w-3.5 h-3.5" />
                        ワークシート {activeSession.worksheetPageRange}
                      </span>
                    )}
                  </div>
                </div>

                {deck?.worksheetAnswerPdfUrl && (
                  <a
                    href={deck.worksheetAnswerPdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg"
                  >
                    対応ワーク解答PDFを開く
                  </a>
                )}
              </div>

              <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 border border-slate-200 rounded-lg p-3.5">
                {activeSession.summary}
              </p>

              {activeSession.keyPoints.length > 0 && (
                <div className="space-y-1.5">
                  <h3 className="text-xs font-bold text-slate-800">
                    重要ポイント
                  </h3>
                  <ul className="space-y-1 text-xs text-slate-700 list-disc pl-5">
                    {activeSession.keyPoints.map((pt, i) => (
                      <li key={i}>{pt}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Confusion Heatmap Bar */}
              {confusionRanking.length > 0 && (
                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-rose-700">
                    <AlertCircle className="w-4 h-4" />
                    <span>つまずき・質問が集中したスライド</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {confusionRanking.map((seg) => (
                      <div
                        key={seg.id}
                        className="p-2.5 rounded-lg bg-rose-50/70 border border-rose-200 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 truncate">
                            p.{seg.slidePage} {seg.topic}
                          </p>
                          <p className="text-[11px] text-slate-600">
                            ワーク p.{seg.worksheetPage}
                            {seg.textbookPage
                              ? ` / 教科書 p.${seg.textbookPage}`
                              : ''}
                          </p>
                        </div>
                        <span className="shrink-0 px-2 py-0.5 rounded-full bg-rose-600 text-white font-bold text-[11px]">
                          ？{seg.confusionCount} / 💬{seg.questionCount}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Per-Slide Segments Timeline + Comments */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-900">
                スライド別 講義記録＆生徒コメント
              </h3>
              {activeSession.segments.map((seg) => {
                const segComments = sessionComments.filter(
                  (c) => c.slidePage === seg.slidePage
                );
                const key = `${activeSession.id}_${seg.slidePage}`;
                return (
                  <div
                    key={seg.id}
                    className="bg-white border border-slate-200 rounded-xl p-4 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="px-2 py-0.5 rounded bg-slate-900 text-white font-mono-tabular font-bold">
                          板書 p.{seg.slidePage}
                        </span>
                        {seg.textbookPage && (
                          <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold">
                            教科書 p.{seg.textbookPage}
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold">
                          ワーク p.{seg.worksheetPage}
                        </span>
                        <span className="font-bold text-slate-900">
                          {seg.topic}
                          {seg.problemTag ? `（${seg.problemTag}）` : ''}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setReplyTargetKey(replyTargetKey === key ? null : key)
                        }
                        className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>先生コメントを追加</span>
                      </button>
                    </div>

                    {seg.aiNote && (
                      <p className="text-xs text-slate-800 bg-indigo-50/70 border border-indigo-100 rounded-lg p-2.5 leading-relaxed">
                        {seg.aiNote}
                      </p>
                    )}

                    {seg.transcript && (
                      <div className="text-xs text-slate-600 bg-slate-50 rounded-lg p-2.5 whitespace-pre-wrap leading-relaxed">
                        <span className="block text-[10px] font-bold text-slate-400 mb-1">
                          音声文字起こし・メモ
                        </span>
                        {seg.transcript}
                      </div>
                    )}

                    {segComments.length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-slate-100">
                        {segComments.map((c) => (
                          <div
                            key={c.id}
                            className={`p-2.5 rounded-lg text-xs border flex items-start justify-between gap-2 ${
                              c.authorRole === 'teacher'
                                ? 'bg-blue-50/70 border-blue-200'
                                : 'bg-amber-50/70 border-amber-200'
                            }`}
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900">
                                  {c.authorName}
                                </span>
                                <span className="text-[10px] text-slate-500">
                                  {c.kind === 'confused'
                                    ? 'ここがわからない'
                                    : c.kind === 'reply'
                                      ? '先生からの回答'
                                      : '質問'}
                                </span>
                              </div>
                              <p className="text-slate-800">{c.text}</p>
                              {c.aiHint && (
                                <p className="text-[11px] text-indigo-800 bg-white/80 rounded p-2">
                                  {c.aiHint}
                                </p>
                              )}
                            </div>
                            {c.authorRole === 'student' && (
                              <button
                                type="button"
                                onClick={() =>
                                  void toggleNoteCommentResolved(
                                    roomId,
                                    c.id,
                                    !c.resolved
                                  )
                                }
                                className={`shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                                  c.resolved
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                                }`}
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>{c.resolved ? '解決済' : '解決にする'}</span>
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {replyTargetKey === key && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          void handleSendReply(
                            seg.slidePage,
                            seg.textbookPage,
                            seg.worksheetPage
                          );
                        }}
                        className="flex items-center gap-2 pt-1"
                      >
                        <input
                          type="text"
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="このスライドへの補足説明・回答を入力..."
                          className="flex-1 px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                          type="submit"
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg cursor-pointer"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>送信</span>
                        </button>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

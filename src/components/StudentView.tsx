import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { User } from 'firebase/auth';
import {
  addDoc,
  collection,
  doc,
  getDocFromServer,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  BookOpen,
  Brain,
  CheckCircle2,
  Clock,
  FileText,
  HelpCircle,
  LogOut,
  PauseCircle,
  PictureInPicture2,
  Radio,
  Send,
  X,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useDocumentPiP } from '../hooks/useDocumentPiP';
import {
  persistStudentLog,
  subscribeLectureSessions,
  subscribeNoteComments,
  subscribeStudentLogs,
} from '../services/lectureStore';
import { getDeckById, getSlideMeta } from '../services/materialsService';
import type {
  LectureSession,
  MascotMood,
  NoteComment,
  RoomData,
  StudentLearningLog,
} from '../types';
import {
  CONFUSION_DURATION_MS,
  COOLDOWN_MS,
  getStoredLastSentAt,
  QUICK_PHRASES,
  setStoredLastSentAt,
} from '../utils/identity';
import { Mascot } from './Mascot';
import { StudentStudyHub } from './StudentStudyHub';

interface StudentViewProps {
  user: User;
  roomId: string;
  terminalId: string;
  anonId: string;
  onLeave: () => void;
}

type StudentTab = 'live' | 'worksheet' | 'practice';

function parseRoomSnapshotData(
  roomId: string,
  data: Record<string, unknown>
): RoomData {
  const createdAtVal = data.createdAt as { toMillis?: () => number } | undefined;
  const updatedAtVal = data.updatedAt as { toMillis?: () => number } | undefined;
  return {
    roomCode: String(data.roomCode ?? roomId),
    teacherUid: String(data.teacherUid ?? ''),
    chatPaused: Boolean(data.chatPaused),
    resetEpoch: Number(data.resetEpoch ?? 0),
    createdBy: String(data.createdBy ?? ''),
    createdAtMs: createdAtVal?.toMillis?.() ?? Date.now(),
    updatedAtMs: updatedAtVal?.toMillis?.() ?? Date.now(),
    activeDeckId: data.activeDeckId ? String(data.activeDeckId) : undefined,
    activeDeckTitle: data.activeDeckTitle
      ? String(data.activeDeckTitle)
      : undefined,
    currentPage:
      data.currentPage != null ? Number(data.currentPage) : undefined,
    totalPages: data.totalPages != null ? Number(data.totalPages) : undefined,
    currentTextbookPage:
      data.currentTextbookPage != null
        ? Number(data.currentTextbookPage)
        : undefined,
    currentWorksheetPage:
      data.currentWorksheetPage != null
        ? Number(data.currentWorksheetPage)
        : undefined,
    activeSessionId: data.activeSessionId
      ? String(data.activeSessionId)
      : undefined,
    lectureActive: Boolean(data.lectureActive),
    lectureStartedAtMs:
      data.lectureStartedAtMs != null
        ? Number(data.lectureStartedAtMs)
        : undefined,
    lastEndedDeckId: data.lastEndedDeckId
      ? String(data.lastEndedDeckId)
      : undefined,
    lastEndedPage:
      data.lastEndedPage != null ? Number(data.lastEndedPage) : undefined,
  };
}

export function StudentView({
  user,
  roomId,
  terminalId,
  anonId,
  onLeave,
}: StudentViewProps) {
  const [activeTab, setActiveTab] = useState<StudentTab>('live');
  const [room, setRoom] = useState<RoomData | null>(null);
  const [roomLoaded, setRoomLoaded] = useState(false);

  const [sessions, setSessions] = useState<LectureSession[]>([]);
  const [comments, setComments] = useState<NoteComment[]>([]);
  const [myLogs, setMyLogs] = useState<StudentLearningLog[]>([]);

  const [signalDocExists, setSignalDocExists] = useState(false);
  const [signalStatus, setSignalStatus] = useState<'confused' | 'understood'>(
    'understood'
  );
  const [signalEpoch, setSignalEpoch] = useState(0);
  const [signalExpiresAtMs, setSignalExpiresAtMs] = useState(0);

  const [nowMs, setNowMs] = useState(() => Date.now());
  const [lastSentAtMs, setLastSentAtMs] = useState(() =>
    getStoredLastSentAt(roomId)
  );
  const [happyUntilMs, setHappyUntilMs] = useState(0);
  const [chatText, setChatText] = useState('');
  const [sending, setSending] = useState(false);
  const [signalUpdating, setSignalUpdating] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{
    text: string;
    isError: boolean;
  } | null>(null);
  const autoExpiredEpochRef = useRef<number>(-1);

  const signalDocId = `${user.uid}_${terminalId}`;

  const [pipSize, setPipSize] = useState<'compact' | 'standard'>('compact');

  const pipDimensions =
    pipSize === 'compact'
      ? { width: 248, height: 276 }
      : { width: 280, height: 300 };

  const {
    pipContainer,
    isPipOpen,
    pipNotice,
    openPip,
    closePip,
    clearNotice,
  } = useDocumentPiP({
    width: pipDimensions.width,
    height: pipDimensions.height,
    title: `ClassPulse 生徒 (${roomId})`,
    bodyClassName: 'bg-white text-slate-900 antialiased',
  });

  const showFeedback = useCallback((text: string, isError = false) => {
    setFeedbackMsg({ text, isError });
    window.setTimeout(() => {
      setFeedbackMsg((prev) => (prev?.text === text ? null : prev));
    }, isError ? 4000 : 2200);
  }, []);

  const refreshRoomFromServer = useCallback(async (): Promise<RoomData | null> => {
    try {
      const snap = await getDocFromServer(doc(db, 'rooms', roomId));
      setRoomLoaded(true);
      if (!snap.exists()) {
        setRoom(null);
        return null;
      }
      const nextRoom = parseRoomSnapshotData(roomId, snap.data());
      setRoom(nextRoom);
      return nextRoom;
    } catch {
      return room;
    }
  }, [room, roomId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 500);
    return () => window.clearInterval(timer);
  }, []);

  // Listen to parent room state (real-time)
  useEffect(() => {
    const roomPath = `rooms/${roomId}`;
    const unsubscribe = onSnapshot(
      doc(db, 'rooms', roomId),
      (snap) => {
        setRoomLoaded(true);
        if (!snap.exists()) {
          setRoom(null);
          return;
        }
        setRoom(parseRoomSnapshotData(roomId, snap.data()));
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.GET, roomPath);
        } catch {
          showFeedback(
            'ルーム状態の同期に失敗しました。再読み込みしてください。',
            true
          );
        }
      }
    );

    return () => unsubscribe();
  }, [roomId, showFeedback]);

  // Subscribe to lecture sessions, note comments & this student's personal logs
  useEffect(() => {
    const unsubSessions = subscribeLectureSessions(roomId, (list) =>
      setSessions(list)
    );
    const unsubComments = subscribeNoteComments(roomId, setComments);
    const unsubLogs = subscribeStudentLogs(roomId, user.uid, setMyLogs);
    return () => {
      unsubSessions();
      unsubComments();
      unsubLogs();
    };
  }, [roomId, user.uid]);

  useEffect(() => {
    const handleSync = () => {
      if (document.visibilityState === 'visible') {
        void refreshRoomFromServer();
      }
    };
    window.addEventListener('focus', handleSync);
    window.addEventListener('pageshow', handleSync);
    document.addEventListener('visibilitychange', handleSync);
    return () => {
      window.removeEventListener('focus', handleSync);
      window.removeEventListener('pageshow', handleSync);
      document.removeEventListener('visibilitychange', handleSync);
    };
  }, [refreshRoomFromServer]);

  // Listen to this terminal's signal document
  useEffect(() => {
    const signalPath = `rooms/${roomId}/signals/${signalDocId}`;
    const unsubscribe = onSnapshot(
      doc(db, 'rooms', roomId, 'signals', signalDocId),
      (snap) => {
        if (!snap.exists()) {
          setSignalDocExists(false);
          setSignalStatus('understood');
          setSignalEpoch(0);
          setSignalExpiresAtMs(0);
          return;
        }
        const data = snap.data();
        setSignalDocExists(true);
        setSignalStatus(data.status === 'confused' ? 'confused' : 'understood');
        setSignalEpoch(Number(data.epoch ?? 0));
        setSignalExpiresAtMs(Number(data.expiresAtMs ?? 0));
      },
      (error) => {
        try {
          handleFirestoreError(error, OperationType.GET, signalPath);
        } catch {
          showFeedback('状態の取得に失敗しました。', true);
        }
      }
    );

    return () => unsubscribe();
  }, [roomId, showFeedback, signalDocId]);

  const isRoomReady = Boolean(room && room.teacherUid);

  const isConfusedActive = useMemo(() => {
    if (!room) return false;
    return (
      signalStatus === 'confused' &&
      signalEpoch === room.resetEpoch &&
      signalExpiresAtMs > nowMs
    );
  }, [nowMs, room, signalEpoch, signalExpiresAtMs, signalStatus]);

  useEffect(() => {
    if (!isConfusedActive) return;
    const syncTimer = window.setInterval(() => {
      void refreshRoomFromServer();
    }, 3000);
    return () => window.clearInterval(syncTimer);
  }, [isConfusedActive, refreshRoomFromServer]);

  const confusionSecondsLeft = isConfusedActive
    ? Math.max(1, Math.ceil((signalExpiresAtMs - nowMs) / 1000))
    : 0;

  const cooldownSecondsLeft = useMemo(() => {
    const remaining = lastSentAtMs + COOLDOWN_MS - nowMs;
    return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
  }, [lastSentAtMs, nowMs]);

  const isCooldownActive = cooldownSecondsLeft > 0;
  const isHappyActive = happyUntilMs > nowMs && !isConfusedActive;

  useEffect(() => {
    if (
      !room ||
      !signalDocExists ||
      signalStatus !== 'confused' ||
      signalEpoch !== room.resetEpoch ||
      signalExpiresAtMs === 0 ||
      nowMs < signalExpiresAtMs
    ) {
      return;
    }

    if (autoExpiredEpochRef.current === signalExpiresAtMs) {
      return;
    }
    autoExpiredEpochRef.current = signalExpiresAtMs;

    const signalPath = `rooms/${roomId}/signals/${signalDocId}`;
    updateDoc(doc(db, 'rooms', roomId, 'signals', signalDocId), {
      anonId,
      status: 'understood',
      epoch: room.resetEpoch,
      expiresAtMs: 0,
      updatedAt: serverTimestamp(),
    }).catch((error) => {
      try {
        handleFirestoreError(error, OperationType.UPDATE, signalPath);
      } catch {
        // Ignore
      }
    });
  }, [
    anonId,
    nowMs,
    room,
    roomId,
    signalDocExists,
    signalDocId,
    signalEpoch,
    signalExpiresAtMs,
    signalStatus,
  ]);

  const recordPersonalLog = useCallback(
    async (
      targetRoom: RoomData,
      eventType: StudentLearningLog['eventType'],
      detail: string
    ) => {
      const deck = getDeckById(targetRoom.activeDeckId);
      const slidePage = targetRoom.currentPage ?? 1;
      const meta = getSlideMeta(deck, slidePage);
      await persistStudentLog(roomId, {
        id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        roomId,
        studentUid: user.uid,
        studentEmail: user.email ?? '',
        studentName: user.displayName ?? anonId,
        deckId: deck?.id ?? targetRoom.activeDeckId ?? 'm1-ch1-s1',
        deckTitle: deck?.title ?? targetRoom.activeDeckTitle ?? '数学Ⅰ',
        chapter: deck?.chapter ?? 1,
        slidePage,
        textbookPage: meta?.textbookPage ?? targetRoom.currentTextbookPage ?? null,
        worksheetPage:
          meta?.worksheetPage ?? targetRoom.currentWorksheetPage ?? 1,
        topic: meta?.topic ?? `スライド p.${slidePage}`,
        eventType,
        detail,
        createdAtMs: Date.now(),
      });
    },
    [anonId, roomId, user.displayName, user.email, user.uid]
  );

  const writeSignalWithEpoch = async (
    targetRoom: RoomData,
    nextStatus: 'confused' | 'understood',
    includeSlideContext = true
  ) => {
    const nextExpiresAtMs =
      nextStatus === 'confused'
        ? Math.trunc(Date.now() + CONFUSION_DURATION_MS)
        : 0;

    const slideExtra =
      includeSlideContext && targetRoom.activeDeckId
        ? {
            deckId: targetRoom.activeDeckId,
            slidePage: targetRoom.currentPage ?? 1,
            textbookPage: targetRoom.currentTextbookPage ?? 0,
            worksheetPage: targetRoom.currentWorksheetPage ?? 1,
            sessionId: targetRoom.activeSessionId ?? '',
          }
        : {};

    if (!signalDocExists) {
      await setDoc(doc(db, 'rooms', roomId, 'signals', signalDocId), {
        roomId,
        ownerUid: user.uid,
        roomTeacherUid: targetRoom.teacherUid,
        terminalId,
        anonId,
        status: nextStatus,
        epoch: targetRoom.resetEpoch,
        expiresAtMs: nextExpiresAtMs,
        ...slideExtra,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(doc(db, 'rooms', roomId, 'signals', signalDocId), {
        anonId,
        status: nextStatus,
        epoch: targetRoom.resetEpoch,
        expiresAtMs: nextExpiresAtMs,
        ...slideExtra,
        updatedAt: serverTimestamp(),
      });
    }
  };

  const updateSignalState = async (nextStatus: 'confused' | 'understood') => {
    if (!room || !room.teacherUid || signalUpdating) return;
    setSignalUpdating(true);
    setFeedbackMsg(null);
    const signalPath = `rooms/${roomId}/signals/${signalDocId}`;

    try {
      const latestRoom = (await refreshRoomFromServer()) ?? room;
      if (!latestRoom.teacherUid) {
        showFeedback('先生のルームが開設されていません。', true);
        return;
      }

      try {
        await writeSignalWithEpoch(latestRoom, nextStatus, true);
      } catch {
        // Fallback without optional slide fields in case old firestore.rules is still deployed
        const retriedRoom = (await refreshRoomFromServer()) ?? latestRoom;
        await writeSignalWithEpoch(retriedRoom, nextStatus, false);
      }

      void recordPersonalLog(
        latestRoom,
        nextStatus,
        nextStatus === 'confused'
          ? '授業中に「わからない！」を送信'
          : '授業中に「わかった！」を送信'
      );

      if (nextStatus === 'understood') {
        setHappyUntilMs(Date.now() + 3000);
      } else {
        setHappyUntilMs(0);
      }
    } catch (error) {
      try {
        handleFirestoreError(
          error,
          signalDocExists ? OperationType.UPDATE : OperationType.CREATE,
          signalPath
        );
      } catch {
        showFeedback('送信に失敗しました。通信環境を確認してください。', true);
      }
    } finally {
      setSignalUpdating(false);
    }
  };

  const writeMessageWithEpoch = async (
    targetRoom: RoomData,
    trimmed: string,
    kind: 'quick' | 'chat',
    includeSlideContext = true
  ) => {
    const slideExtra =
      includeSlideContext && targetRoom.activeDeckId
        ? {
            deckId: targetRoom.activeDeckId,
            slidePage: targetRoom.currentPage ?? 1,
            textbookPage: targetRoom.currentTextbookPage ?? 0,
            worksheetPage: targetRoom.currentWorksheetPage ?? 1,
            sessionId: targetRoom.activeSessionId ?? '',
          }
        : {};

    await addDoc(collection(db, 'rooms', roomId, 'messages'), {
      roomId,
      ownerUid: user.uid,
      roomTeacherUid: targetRoom.teacherUid,
      terminalId,
      anonId,
      text: trimmed.slice(0, 140),
      kind,
      epoch: targetRoom.resetEpoch,
      resolved: false,
      ...slideExtra,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  };

  const sendMessage = async (text: string, kind: 'quick' | 'chat') => {
    const trimmed = text.trim();
    if (!trimmed || !room || !room.teacherUid) return;
    if (room.chatPaused || isCooldownActive || sending) return;

    setSending(true);
    setFeedbackMsg(null);
    const messagesPath = `rooms/${roomId}/messages`;

    try {
      const latestRoom = (await refreshRoomFromServer()) ?? room;
      if (!latestRoom.teacherUid) {
        showFeedback('先生の入室を待機しています。', true);
        return;
      }
      if (latestRoom.chatPaused) {
        showFeedback('先生がチャット送信を一時停止しています。', true);
        return;
      }

      try {
        await writeMessageWithEpoch(latestRoom, trimmed, kind, true);
      } catch {
        const retriedRoom = (await refreshRoomFromServer()) ?? latestRoom;
        if (!retriedRoom.teacherUid || retriedRoom.chatPaused) {
          throw new Error('Room unavailable');
        }
        await writeMessageWithEpoch(retriedRoom, trimmed, kind, false);
      }

      void recordPersonalLog(latestRoom, 'question', trimmed);

      const sentAt = Date.now();
      setLastSentAtMs(sentAt);
      setStoredLastSentAt(roomId, sentAt);
      if (kind === 'chat') {
        setChatText('');
      }
      showFeedback('送信しました！', false);
    } catch (error) {
      try {
        handleFirestoreError(error, OperationType.CREATE, messagesPath);
      } catch {
        showFeedback('コメントの送信に失敗しました。再度お試しください。', true);
      }
    } finally {
      setSending(false);
    }
  };

  const mascotMood: MascotMood = !isRoomReady
    ? 'idle'
    : isConfusedActive
      ? 'confused'
      : isHappyActive
        ? 'happy'
        : room?.chatPaused
          ? 'paused'
          : 'idle';

  const statusLine = !roomLoaded
    ? 'ルームに接続中...'
    : !isRoomReady
      ? '先生の入室を待機中...'
      : isConfusedActive
        ? `「？」送信中 · あと ${confusionSecondsLeft}秒`
        : isHappyActive
          ? 'わかった！ナイスです'
          : room?.chatPaused
            ? '先生がチャットを一時停止中'
            : '授業を聞いています';

  const companionCard = (
    <div
      className={`${
        isPipOpen
          ? 'w-full h-full p-2'
          : 'w-full max-w-[340px] sm:w-[310px] min-h-[300px] p-3.5 border border-slate-200 rounded-2xl shadow-sm'
      } bg-white text-slate-900 flex flex-col justify-between gap-2 overflow-hidden box-border`}
    >
      {/* Top Meta Row */}
      <div className="flex items-center justify-between gap-2 text-[11px] leading-none shrink-0 select-none">
        <span className="font-semibold text-slate-800 truncate">{anonId}</span>
        <span className="font-mono-tabular text-slate-500 shrink-0">
          {roomId}
        </span>
      </div>

      {/* Mascot & Status */}
      <div className="flex items-center gap-2 min-h-0 shrink-0 select-none">
        <Mascot mood={mascotMood} size={isPipOpen ? 'xs' : 'sm'} />
        <div className="min-w-0 flex-1">
          <p
            className={`text-xs font-semibold leading-tight ${
              isConfusedActive
                ? 'text-rose-600'
                : isHappyActive
                  ? 'text-emerald-600'
                  : 'text-slate-700'
            }`}
          >
            {statusLine}
          </p>
          {isConfusedActive && (
            <div className="mt-1 h-1.5 w-full bg-rose-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-rose-500 transition-all duration-300"
                style={{
                  width: `${Math.min(100, (confusionSecondsLeft / 45) * 100)}%`,
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Primary Reaction Buttons */}
      <div className="grid grid-cols-5 gap-1.5 shrink-0 select-none">
        <button
          type="button"
          disabled={!isRoomReady || signalUpdating}
          onClick={() => void updateSignalState('confused')}
          className={`col-span-3 py-2.5 sm:py-2 px-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
            isConfusedActive
              ? 'bg-rose-600 text-white ring-2 ring-rose-300'
              : 'bg-rose-500 hover:bg-rose-600 text-white'
          }`}
        >
          <HelpCircle className="w-3.5 h-3.5 shrink-0" />
          <span className="whitespace-nowrap">わからない！</span>
        </button>

        <button
          type="button"
          disabled={!isRoomReady || signalUpdating}
          onClick={() => void updateSignalState('understood')}
          className="col-span-2 py-2.5 sm:py-2 px-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-1 transition-all cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
        >
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span className="whitespace-nowrap">わかった！</span>
        </button>
      </div>

      {/* Quick Preset Buttons */}
      <div className="grid grid-cols-3 gap-1 shrink-0 select-none">
        {QUICK_PHRASES.map((phrase) => (
          <button
            key={phrase}
            type="button"
            disabled={
              !isRoomReady ||
              Boolean(room?.chatPaused) ||
              isCooldownActive ||
              sending
            }
            onClick={() => void sendMessage(phrase, 'quick')}
            title={phrase}
            className="py-1.5 sm:py-1 px-1 text-[10px] font-medium leading-tight text-slate-700 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 border border-slate-200 rounded-md transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed truncate"
          >
            {phrase}
          </button>
        ))}
      </div>

      {/* Anonymous Chat Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void sendMessage(chatText, 'chat');
        }}
        className="flex items-center gap-1.5 shrink-0"
      >
        <input
          type="text"
          value={chatText}
          onChange={(e) => setChatText(e.target.value)}
          maxLength={140}
          autoComplete="off"
          enterKeyHint="send"
          disabled={
            !isRoomReady || Boolean(room?.chatPaused) || isCooldownActive
          }
          placeholder={
            room?.chatPaused
              ? '送信停止中'
              : isCooldownActive
                ? `あと${cooldownSecondsLeft}秒待機`
                : '質問を入力...'
          }
          className={`flex-1 min-w-0 px-2.5 py-2 sm:py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 select-text ${
            isPipOpen ? 'text-xs' : 'text-base sm:text-xs'
          }`}
        />
        <button
          type="submit"
          disabled={
            !isRoomReady ||
            Boolean(room?.chatPaused) ||
            isCooldownActive ||
            sending ||
            chatText.trim().length === 0
          }
          aria-label="匿名チャットを送信"
          className="p-2.5 sm:p-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer shrink-0 select-none"
        >
          <Send className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
        </button>
      </form>

      {/* Footer Cooldown / Status */}
      <div className="flex items-center justify-between text-[10px] text-slate-500 leading-tight shrink-0 select-none">
        {feedbackMsg ? (
          <span
            className={`font-medium ${
              feedbackMsg.isError ? 'text-rose-600' : 'text-emerald-600'
            }`}
          >
            {feedbackMsg.text}
          </span>
        ) : room?.chatPaused ? (
          <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
            <PauseCircle className="w-3 h-3" />
            チャット一時停止中
          </span>
        ) : isCooldownActive ? (
          <span className="inline-flex items-center gap-1 text-blue-600 font-medium font-mono-tabular">
            <Clock className="w-3 h-3" />
            クールタイム: あと {cooldownSecondsLeft}秒
          </span>
        ) : (
          <span>送信後15秒の連投制限あり</span>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Main Window Top Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-base font-bold text-slate-900 whitespace-nowrap">
              ClassPulse
            </span>
            <span className="text-xs text-slate-400" aria-hidden="true">
              ·
            </span>
            <span className="text-xs font-medium text-slate-600 truncate">
              生徒 ({roomId})
            </span>
          </div>

          {/* Student Navigation Tabs */}
          <nav className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('live')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-colors cursor-pointer ${
                activeTab === 'live'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Radio className="w-3.5 h-3.5 text-rose-500" />
              <span>授業リアクション</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('worksheet')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-colors cursor-pointer ${
                activeTab === 'worksheet'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-emerald-600" />
              <span>ワーク＆講義記録</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('practice')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-colors cursor-pointer ${
                activeTab === 'practice'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Brain className="w-3.5 h-3.5 text-indigo-600" />
              <span>AI個別演習</span>
            </button>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            {!isPipOpen && activeTab === 'live' && (
              <div
                className="hidden md:flex items-center gap-0.5 p-0.5 bg-slate-100 rounded-lg text-[11px]"
                aria-label="小窓サイズ"
              >
                <button
                  type="button"
                  onClick={() => setPipSize('compact')}
                  className={`px-2 py-1 rounded-md font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    pipSize === 'compact'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  極小
                </button>
                <button
                  type="button"
                  onClick={() => setPipSize('standard')}
                  className={`px-2 py-1 rounded-md font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    pipSize === 'standard'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  標準
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={isPipOpen ? closePip : () => void openPip()}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <PictureInPicture2 className="w-4 h-4" />
              <span>{isPipOpen ? '小窓を閉じる' : '小窓モード'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                closePip();
                onLeave();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>退室</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center p-4 sm:p-6 gap-4">
        {pipNotice && (
          <div className="max-w-md w-full bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start justify-between gap-3 text-xs text-amber-900 leading-relaxed">
            <p>{pipNotice}</p>
            <button
              type="button"
              onClick={clearNotice}
              aria-label="通知を閉じる"
              className="text-amber-700 hover:text-amber-900 shrink-0 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Live Slide Sync Strip */}
        {room?.activeDeckTitle && (
          <div className="w-full max-w-6xl bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              {room.lectureActive && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-600 text-white font-bold text-[10px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                  授業中
                </span>
              )}
              <span className="font-bold text-indigo-950">
                {room.activeDeckTitle}
              </span>
              <span className="px-2 py-0.5 rounded bg-white border border-indigo-200 font-mono-tabular font-semibold text-indigo-800">
                板書 p.{room.currentPage ?? 1} / {room.totalPages ?? '-'}
              </span>
              {room.currentTextbookPage ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-semibold">
                  <BookOpen className="w-3 h-3" />
                  教科書 p.{room.currentTextbookPage}
                </span>
              ) : null}
              {room.currentWorksheetPage ? (
                <button
                  type="button"
                  onClick={() => setActiveTab('worksheet')}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold cursor-pointer"
                >
                  <FileText className="w-3 h-3" />
                  ワークシート p.{room.currentWorksheetPage} を開く
                </button>
              ) : null}
            </div>
            <span className="text-[11px] text-indigo-700">
              「わからない！」はこのページに自動紐づけされます
            </span>
          </div>
        )}

        {isPipOpen && pipContainer && createPortal(companionCard, pipContainer)}

        {activeTab === 'live' ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 w-full">
            {!isRoomReady && roomLoaded && (
              <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-600 text-center">
                先生が教員モードでルーム「
                <span className="font-mono-tabular font-semibold text-slate-900">
                  {roomId}
                </span>
                」を開くと、自動的に送信できるようになります。
              </div>
            )}

            {isPipOpen && pipContainer ? (
              <div className="max-w-sm w-full bg-white border border-slate-200 rounded-xl p-6 text-center space-y-3">
                <p className="text-sm font-semibold text-slate-900">
                  最前面の小窓（{pipDimensions.width}×{pipDimensions.height}px）を起動中です
                </p>
                <p className="text-xs text-slate-600 leading-relaxed">
                  別ウィンドウで操作できます。このまま「ワーク＆講義記録」や「AI個別演習」タブも見られます。
                </p>
                <button
                  type="button"
                  onClick={closePip}
                  className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                >
                  通常画面に戻す
                </button>
              </div>
            ) : (
              <div className="w-full flex flex-col items-center gap-3">
                {companionCard}
                <p className="text-xs text-slate-500 text-center">
                  あなたの匿名ID: {anonId}（復習・AI演習はGoogleアカウントに紐づいて保存されます）
                </p>
              </div>
            )}
          </div>
        ) : (
          <StudentStudyHub
            key={activeTab}
            user={user}
            roomId={roomId}
            anonId={anonId}
            room={room}
            sessions={sessions}
            comments={comments}
            myLogs={myLogs}
            initialTab={activeTab === 'practice' ? 'practice' : 'worksheet'}
          />
        )}
      </main>
    </div>
  );
}

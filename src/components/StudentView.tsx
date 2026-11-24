import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { User } from 'firebase/auth';
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  CheckCircle2,
  Clock,
  HelpCircle,
  LogOut,
  PauseCircle,
  PictureInPicture2,
  Send,
  X,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useDocumentPiP } from '../hooks/useDocumentPiP';
import type { MascotMood, RoomData } from '../types';
import {
  CONFUSION_DURATION_MS,
  COOLDOWN_MS,
  getStoredLastSentAt,
  QUICK_PHRASES,
  setStoredLastSentAt,
} from '../utils/identity';
import { Mascot } from './Mascot';

interface StudentViewProps {
  user: User;
  roomId: string;
  terminalId: string;
  anonId: string;
  onLeave: () => void;
}

export function StudentView({
  user,
  roomId,
  terminalId,
  anonId,
  onLeave,
}: StudentViewProps) {
  const [room, setRoom] = useState<RoomData | null>(null);
  const [roomLoaded, setRoomLoaded] = useState(false);

  const [signalDocExists, setSignalDocExists] = useState(false);
  const [signalStatus, setSignalStatus] = useState<'confused' | 'understood'>('understood');
  const [signalEpoch, setSignalEpoch] = useState(0);
  const [signalExpiresAtMs, setSignalExpiresAtMs] = useState(0);

  const [nowMs, setNowMs] = useState(() => Date.now());
  const [lastSentAtMs, setLastSentAtMs] = useState(() => getStoredLastSentAt(roomId));
  const [happyUntilMs, setHappyUntilMs] = useState(0);
  const [chatText, setChatText] = useState('');
  const [sending, setSending] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const autoExpiredEpochRef = useRef<number>(-1);

  const signalDocId = `${user.uid}_${terminalId}`;

  const {
    pipContainer,
    isPipOpen,
    pipNotice,
    openPip,
    closePip,
    clearNotice,
  } = useDocumentPiP({
    width: 280,
    height: 300,
    title: `ClassPulse 生徒 (${roomId})`,
    bodyClassName: 'bg-white text-slate-900 antialiased',
  });

  // 1-second clock for 45s confusion auto-clear and 15s cooldown
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 500);
    return () => window.clearInterval(timer);
  }, []);

  // Listen to parent room state
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
        const data = snap.data();
        setRoom({
          roomCode: String(data.roomCode ?? roomId),
          teacherUid: String(data.teacherUid ?? ''),
          chatPaused: Boolean(data.chatPaused),
          resetEpoch: Number(data.resetEpoch ?? 0),
          createdBy: String(data.createdBy ?? ''),
          createdAtMs: data.createdAt?.toMillis?.() ?? Date.now(),
          updatedAtMs: data.updatedAt?.toMillis?.() ?? Date.now(),
        });
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, roomPath);
      }
    );

    return () => unsubscribe();
  }, [roomId]);

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
        handleFirestoreError(error, OperationType.GET, signalPath);
      }
    );

    return () => unsubscribe();
  }, [roomId, signalDocId]);

  const isRoomReady = Boolean(room && room.teacherUid);

  const isConfusedActive = useMemo(() => {
    if (!room) return false;
    return (
      signalStatus === 'confused' &&
      signalEpoch === room.resetEpoch &&
      signalExpiresAtMs > nowMs
    );
  }, [nowMs, room, signalEpoch, signalExpiresAtMs, signalStatus]);

  const confusionSecondsLeft = isConfusedActive
    ? Math.max(1, Math.ceil((signalExpiresAtMs - nowMs) / 1000))
    : 0;

  const cooldownSecondsLeft = useMemo(() => {
    const remaining = lastSentAtMs + COOLDOWN_MS - nowMs;
    return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
  }, [lastSentAtMs, nowMs]);

  const isCooldownActive = cooldownSecondsLeft > 0;
  const isHappyActive = happyUntilMs > nowMs && !isConfusedActive;

  // Auto-sync Firestore back to understood when 45s passes
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
      handleFirestoreError(error, OperationType.UPDATE, signalPath);
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

  const updateSignalState = async (nextStatus: 'confused' | 'understood') => {
    if (!room || !room.teacherUid) return;
    setFeedbackMsg(null);

    const nextExpiresAtMs =
      nextStatus === 'confused' ? Math.trunc(Date.now() + CONFUSION_DURATION_MS) : 0;
    const signalPath = `rooms/${roomId}/signals/${signalDocId}`;

    try {
      if (!signalDocExists) {
        await setDoc(doc(db, 'rooms', roomId, 'signals', signalDocId), {
          roomId,
          ownerUid: user.uid,
          roomTeacherUid: room.teacherUid,
          terminalId,
          anonId,
          status: nextStatus,
          epoch: room.resetEpoch,
          expiresAtMs: nextExpiresAtMs,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(doc(db, 'rooms', roomId, 'signals', signalDocId), {
          anonId,
          status: nextStatus,
          epoch: room.resetEpoch,
          expiresAtMs: nextExpiresAtMs,
          updatedAt: serverTimestamp(),
        });
      }

      if (nextStatus === 'understood') {
        setHappyUntilMs(Date.now() + 3000);
      } else {
        setHappyUntilMs(0);
      }
    } catch (error) {
      handleFirestoreError(
        error,
        signalDocExists ? OperationType.UPDATE : OperationType.CREATE,
        signalPath
      );
    }
  };

  const sendMessage = async (text: string, kind: 'quick' | 'chat') => {
    const trimmed = text.trim();
    if (!trimmed || !room || !room.teacherUid) return;
    if (room.chatPaused || isCooldownActive || sending) return;

    setSending(true);
    setFeedbackMsg(null);
    const messagesPath = `rooms/${roomId}/messages`;

    try {
      await addDoc(collection(db, 'rooms', roomId, 'messages'), {
        roomId,
        ownerUid: user.uid,
        roomTeacherUid: room.teacherUid,
        terminalId,
        anonId,
        text: trimmed.slice(0, 140),
        kind,
        epoch: room.resetEpoch,
        resolved: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const sentAt = Date.now();
      setLastSentAtMs(sentAt);
      setStoredLastSentAt(roomId, sentAt);
      if (kind === 'chat') {
        setChatText('');
      }
      setFeedbackMsg('送信しました！');
      window.setTimeout(() => {
        setFeedbackMsg((prev) => (prev === '送信しました！' ? null : prev));
      }, 2200);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, messagesPath);
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
        isPipOpen ? 'w-full h-full' : 'w-[280px] h-[300px] border border-slate-200 rounded-2xl shadow-sm'
      } bg-white text-slate-900 flex flex-col justify-between p-3 select-none overflow-hidden box-border`}
    >
      {/* Top Meta Row */}
      <div className="flex items-center justify-between gap-2 text-[11px] leading-none">
        <span className="font-semibold text-slate-800 truncate">{anonId}</span>
        <span className="font-mono-tabular text-slate-500 shrink-0">{roomId}</span>
      </div>

      {/* Mascot & Status */}
      <div className="flex items-center gap-2.5 py-0.5">
        <Mascot mood={mascotMood} size="sm" />
        <div className="min-w-0 flex-1">
          <p
            className={`text-xs font-semibold leading-snug ${
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
      <div className="grid grid-cols-5 gap-1.5">
        <button
          type="button"
          disabled={!isRoomReady}
          onClick={() => void updateSignalState('confused')}
          className={`col-span-3 py-2.5 px-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
            isConfusedActive
              ? 'bg-rose-600 text-white ring-2 ring-rose-300'
              : 'bg-rose-500 hover:bg-rose-600 text-white'
          }`}
        >
          <HelpCircle className="w-4 h-4 shrink-0" />
          <span className="whitespace-nowrap">わからない！</span>
        </button>

        <button
          type="button"
          disabled={!isRoomReady}
          onClick={() => void updateSignalState('understood')}
          className="col-span-2 py-2.5 px-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-1 transition-all cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
        >
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span className="whitespace-nowrap">わかった！</span>
        </button>
      </div>

      {/* Quick Preset Buttons */}
      <div className="grid grid-cols-3 gap-1">
        {QUICK_PHRASES.map((phrase) => (
          <button
            key={phrase}
            type="button"
            disabled={!isRoomReady || Boolean(room?.chatPaused) || isCooldownActive || sending}
            onClick={() => void sendMessage(phrase, 'quick')}
            title={phrase}
            className="py-1.5 px-1 text-[10px] font-medium leading-tight text-slate-700 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 border border-slate-200 rounded-lg transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed truncate"
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
        className="flex items-center gap-1.5"
      >
        <input
          type="text"
          value={chatText}
          onChange={(e) => setChatText(e.target.value)}
          maxLength={140}
          disabled={!isRoomReady || Boolean(room?.chatPaused) || isCooldownActive}
          placeholder={
            room?.chatPaused
              ? '送信停止中'
              : isCooldownActive
                ? `あと${cooldownSecondsLeft}秒待機`
                : '質問を入力...'
          }
          className="flex-1 min-w-0 px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
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
          className="p-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer shrink-0"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>

      {/* Footer Cooldown / Status */}
      <div className="flex items-center justify-between text-[10px] text-slate-500 leading-none">
        {room?.chatPaused ? (
          <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
            <PauseCircle className="w-3 h-3" />
            チャット一時停止中
          </span>
        ) : isCooldownActive ? (
          <span className="inline-flex items-center gap-1 text-blue-600 font-medium font-mono-tabular">
            <Clock className="w-3 h-3" />
            クールタイム: あと {cooldownSecondsLeft}秒
          </span>
        ) : feedbackMsg ? (
          <span className="text-emerald-600 font-medium">{feedbackMsg}</span>
        ) : (
          <span>送信後15秒の連投制限あり</span>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Main Window Top Bar */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-6 py-3.5 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3 whitespace-nowrap shrink-0">
            <span className="text-base font-bold text-slate-900">ClassPulse</span>
            <span className="text-xs text-slate-400" aria-hidden="true">
              ·
            </span>
            <span className="text-xs font-medium text-slate-600">
              生徒モード ({roomId})
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={isPipOpen ? closePip : () => void openPip()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <PictureInPicture2 className="w-4 h-4" />
              <span>{isPipOpen ? '小窓を閉じる' : '小窓モードで起動'}</span>
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
      <main className="flex-1 flex flex-col items-center justify-center p-6 gap-5">
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

        {!isRoomReady && roomLoaded && (
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-600 text-center">
            先生が教員モードでルーム「<span className="font-mono-tabular font-semibold text-slate-900">{roomId}</span>」を開くと、自動的に送信できるようになります。
          </div>
        )}

        {isPipOpen && pipContainer ? (
          <>
            {createPortal(companionCard, pipContainer)}
            <div className="max-w-sm w-full bg-white border border-slate-200 rounded-xl p-6 text-center space-y-3">
              <p className="text-sm font-semibold text-slate-900">
                最前面の小窓（280×300px）を起動中です
              </p>
              <p className="text-xs text-slate-600 leading-relaxed">
                別ウィンドウで操作できます。このタブを閉じると小窓も終了します。
              </p>
              <button
                type="button"
                onClick={closePip}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                通常画面に戻す
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3">
            {companionCard}
            <p className="text-xs text-slate-500">
              あなたの匿名ID: {anonId} · 小窓サイズ目安 280 × 300px
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

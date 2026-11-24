import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  Ban,
  Check,
  CheckCircle2,
  Copy,
  LogOut,
  PauseCircle,
  PictureInPicture2,
  PlayCircle,
  Search,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useDocumentPiP } from '../hooks/useDocumentPiP';
import type { MessageData, MuteData, RoomData, SignalData } from '../types';
import { CONFUSION_DURATION_MS } from '../utils/identity';
import { TeacherTickerBar } from './TeacherTickerBar';

interface TeacherViewProps {
  user: User;
  roomId: string;
  onLeave: () => void;
}

type HistoryFilter = 'all' | 'active' | 'resolved' | 'muted';

export function TeacherView({ user, roomId, onLeave }: TeacherViewProps) {
  const [room, setRoom] = useState<RoomData | null>(null);
  const [roomReady, setRoomReady] = useState(false);
  const [ownershipError, setOwnershipError] = useState<string | null>(null);

  const [signals, setSignals] = useState<SignalData[]>([]);
  const [messages, setMessages] = useState<MessageData[]>([]);
  const [mutes, setMutes] = useState<MuteData[]>([]);

  const [nowMs, setNowMs] = useState(() => Date.now());
  const [isResetting, setIsResetting] = useState(false);
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedRoomId, setCopiedRoomId] = useState(false);

  const {
    pipContainer,
    isPipOpen,
    pipNotice,
    openPip,
    closePip,
    clearNotice,
  } = useDocumentPiP({
    width: 960,
    height: 140,
    title: `ClassPulse 教員テロップ (${roomId})`,
    bodyClassName: 'bg-slate-950 text-slate-100 antialiased',
  });

  // 1s timer to auto-expire 45s confusion counts & update NEW highlight
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  // Initialize or open room owned by this teacher
  useEffect(() => {
    let cancelled = false;
    const roomRef = doc(db, 'rooms', roomId);
    const roomPath = `rooms/${roomId}`;

    async function ensureRoom() {
      try {
        const snap = await getDoc(roomRef);
        if (cancelled) return;

        if (!snap.exists()) {
          await setDoc(roomRef, {
            roomCode: roomId,
            teacherUid: user.uid,
            chatPaused: false,
            resetEpoch: 0,
            createdBy: user.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          const data = snap.data();
          if (data.teacherUid && data.teacherUid !== user.uid) {
            setOwnershipError(
              `ルーム「${roomId}」はすでに別の先生アカウントによって管理されています。別のルームIDを作成してご使用ください。`
            );
            return;
          }
        }
        if (!cancelled) {
          setRoomReady(true);
        }
      } catch (error) {
        if (!cancelled) {
          handleFirestoreError(error, OperationType.WRITE, roomPath);
        }
      }
    }

    void ensureRoom();

    return () => {
      cancelled = true;
    };
  }, [roomId, user.uid]);

  // Listen to room updates
  useEffect(() => {
    if (!roomReady || ownershipError) return;
    const roomPath = `rooms/${roomId}`;

    const unsubscribe = onSnapshot(
      doc(db, 'rooms', roomId),
      (snap) => {
        if (!snap.exists()) return;
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
  }, [ownershipError, roomId, roomReady]);

  // Listen to student signals
  useEffect(() => {
    if (!roomReady || ownershipError) return;
    const signalsPath = `rooms/${roomId}/signals`;
    const q = query(
      collection(db, 'rooms', roomId, 'signals'),
      where('roomTeacherUid', '==', user.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items: SignalData[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            roomId: String(data.roomId ?? roomId),
            ownerUid: String(data.ownerUid ?? ''),
            roomTeacherUid: String(data.roomTeacherUid ?? ''),
            terminalId: String(data.terminalId ?? ''),
            anonId: String(data.anonId ?? '匿名'),
            status: data.status === 'confused' ? 'confused' : 'understood',
            epoch: Number(data.epoch ?? 0),
            expiresAtMs: Number(data.expiresAtMs ?? 0),
            createdAtMs: data.createdAt?.toMillis?.() ?? Date.now(),
            updatedAtMs: data.updatedAt?.toMillis?.() ?? Date.now(),
          };
        });
        setSignals(items);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, signalsPath);
      }
    );

    return () => unsubscribe();
  }, [ownershipError, roomId, roomReady, user.uid]);

  // Listen to student messages
  useEffect(() => {
    if (!roomReady || ownershipError) return;
    const messagesPath = `rooms/${roomId}/messages`;
    const q = query(
      collection(db, 'rooms', roomId, 'messages'),
      where('roomTeacherUid', '==', user.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items: MessageData[] = snapshot.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              roomId: String(data.roomId ?? roomId),
              ownerUid: String(data.ownerUid ?? ''),
              roomTeacherUid: String(data.roomTeacherUid ?? ''),
              terminalId: String(data.terminalId ?? ''),
              anonId: String(data.anonId ?? '匿名'),
              text: String(data.text ?? ''),
              kind: (data.kind === 'quick' ? 'quick' : 'chat') as 'quick' | 'chat',
              epoch: Number(data.epoch ?? 0),
              resolved: Boolean(data.resolved),
              createdAtMs: data.createdAt?.toMillis?.() ?? Date.now(),
              updatedAtMs: data.updatedAt?.toMillis?.() ?? Date.now(),
            };
          })
          .sort((a, b) => b.createdAtMs - a.createdAtMs);
        setMessages(items);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, messagesPath);
      }
    );

    return () => unsubscribe();
  }, [ownershipError, roomId, roomReady, user.uid]);

  // Listen to muted anonymous IDs
  useEffect(() => {
    if (!roomReady || ownershipError) return;
    const mutesPath = `rooms/${roomId}/mutes`;
    const q = query(
      collection(db, 'rooms', roomId, 'mutes'),
      where('teacherUid', '==', user.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items: MuteData[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            roomId: String(data.roomId ?? roomId),
            teacherUid: String(data.teacherUid ?? ''),
            terminalId: String(data.terminalId ?? d.id),
            anonId: String(data.anonId ?? ''),
            createdAtMs: data.createdAt?.toMillis?.() ?? Date.now(),
          };
        });
        setMutes(items);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, mutesPath);
      }
    );

    return () => unsubscribe();
  }, [ownershipError, roomId, roomReady, user.uid]);

  const mutedTerminalIds = useMemo(
    () => new Set(mutes.map((m) => m.terminalId)),
    [mutes]
  );

  // Active confused student count (within 45s, matching current resetEpoch, not muted)
  const confusedCount = useMemo(() => {
    if (!room) return 0;
    return signals.filter(
      (s) =>
        s.status === 'confused' &&
        s.epoch === room.resetEpoch &&
        s.expiresAtMs > nowMs &&
        s.expiresAtMs - nowMs <= CONFUSION_DURATION_MS + 10_000 &&
        !mutedTerminalIds.has(s.terminalId)
    ).length;
  }, [mutedTerminalIds, nowMs, room, signals]);

  // Active ticker messages: current epoch, not resolved, not muted, oldest -> newest for marquee
  const activeTickerMessages = useMemo(() => {
    if (!room) return [];
    return messages
      .filter(
        (m) =>
          m.epoch === room.resetEpoch &&
          !m.resolved &&
          !mutedTerminalIds.has(m.terminalId)
      )
      .slice(0, 25)
      .reverse();
  }, [messages, mutedTerminalIds, room]);

  const handleResetAll = async () => {
    if (!room || isResetting) return;
    setIsResetting(true);
    const roomPath = `rooms/${roomId}`;
    try {
      await updateDoc(doc(db, 'rooms', roomId), {
        resetEpoch: room.resetEpoch + 1,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, roomPath);
    } finally {
      setIsResetting(false);
    }
  };

  const handleToggleChatPaused = async () => {
    if (!room) return;
    const roomPath = `rooms/${roomId}`;
    try {
      await updateDoc(doc(db, 'rooms', roomId), {
        chatPaused: !room.chatPaused,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, roomPath);
    }
  };

  const handleResolveMessage = async (messageId: string, resolvedValue = true) => {
    const msgPath = `rooms/${roomId}/messages/${messageId}`;
    try {
      await updateDoc(doc(db, 'rooms', roomId, 'messages', messageId), {
        resolved: resolvedValue,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, msgPath);
    }
  };

  const handleMuteTerminal = async (terminalId: string, anonId: string) => {
    const mutePath = `rooms/${roomId}/mutes/${terminalId}`;
    try {
      await setDoc(doc(db, 'rooms', roomId, 'mutes', terminalId), {
        roomId,
        teacherUid: user.uid,
        terminalId,
        anonId,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, mutePath);
    }
  };

  const handleUnmuteTerminal = async (terminalId: string) => {
    const mutePath = `rooms/${roomId}/mutes/${terminalId}`;
    try {
      await deleteDoc(doc(db, 'rooms', roomId, 'mutes', terminalId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, mutePath);
    }
  };

  const handleCopyRoomId = () => {
    void navigator.clipboard?.writeText(roomId);
    setCopiedRoomId(true);
    window.setTimeout(() => setCopiedRoomId(false), 1800);
  };

  const filteredHistory = useMemo(() => {
    const qLower = searchQuery.trim().toLowerCase();
    return messages.filter((msg) => {
      const isMuted = mutedTerminalIds.has(msg.terminalId);
      const isClearedByReset = room ? msg.epoch < room.resetEpoch : false;
      const isEffectivelyResolved = msg.resolved || isClearedByReset;

      if (filter === 'active' && (isEffectivelyResolved || isMuted)) return false;
      if (filter === 'resolved' && !isEffectivelyResolved) return false;
      if (filter === 'muted' && !isMuted) return false;

      if (qLower) {
        return (
          msg.text.toLowerCase().includes(qLower) ||
          msg.anonId.toLowerCase().includes(qLower)
        );
      }
      return true;
    });
  }, [filter, messages, mutedTerminalIds, room, searchQuery]);

  if (ownershipError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h2 className="text-base font-bold text-slate-900">
            ルームのアクセス制限
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">{ownershipError}</p>
          <button
            type="button"
            onClick={onLeave}
            className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            ルーム選択に戻る
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Bar */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-3.5 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-base font-bold text-slate-900 whitespace-nowrap">
              ClassPulse
            </span>
            <span className="text-xs text-slate-400" aria-hidden="true">
              ·
            </span>
            <span className="text-xs font-medium text-slate-600 whitespace-nowrap">
              教員モード
            </span>
            <button
              type="button"
              onClick={handleCopyRoomId}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono-tabular font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer whitespace-nowrap"
              title="ルームIDをコピー"
            >
              <span>{roomId}</span>
              {copiedRoomId ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-slate-500" />
              )}
            </button>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={isPipOpen ? closePip : () => void openPip()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <PictureInPicture2 className="w-4 h-4 text-amber-400" />
              <span>
                {isPipOpen ? 'テロップ小窓を閉じる' : '小窓モードで起動 (960×140)'}
              </span>
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

      {/* Main Teacher Console */}
      <main className="max-w-6xl w-full mx-auto px-6 py-6 space-y-6">
        {pipNotice && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start justify-between gap-3 text-xs text-amber-900 leading-relaxed">
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

        {/* Portal to Document PiP window when open, else show inline bar */}
        {isPipOpen && pipContainer ? (
          <>
            {createPortal(
              <TeacherTickerBar
                roomId={roomId}
                confusedCount={confusedCount}
                activeMessages={activeTickerMessages}
                chatPaused={Boolean(room?.chatPaused)}
                nowMs={nowMs}
                isResetting={isResetting}
                onResetAll={() => void handleResetAll()}
                onResolveMessage={(id) => void handleResolveMessage(id, true)}
                inPipWindow
              />,
              pipContainer
            )}
            <div className="bg-slate-900 text-slate-100 rounded-xl px-5 py-4 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-0.5">
                <p className="text-sm font-semibold">
                  最前面の横長テロップ小窓（960×140px）を表示中
                </p>
                <p className="text-xs text-slate-400">
                  小窓にはテロップと「わからない」人数のみを表示し、この画面でチャット履歴やミュート・送信停止を管理できます。
                </p>
              </div>
              <button
                type="button"
                onClick={closePip}
                className="px-3.5 py-2 text-xs font-medium text-slate-900 bg-white hover:bg-slate-100 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                通常画面にテロップを戻す
              </button>
            </div>
          </>
        ) : (
          <section aria-label="ライブテロップバー">
            <TeacherTickerBar
              roomId={roomId}
              confusedCount={confusedCount}
              activeMessages={activeTickerMessages}
              chatPaused={Boolean(room?.chatPaused)}
              nowMs={nowMs}
              isResetting={isResetting}
              onResetAll={() => void handleResetAll()}
              onResolveMessage={(id) => void handleResolveMessage(id, true)}
            />
          </section>
        )}

        {/* Controls Grid: Chat Pause Switch & Mute Manager */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chat Pause Switch */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {room?.chatPaused ? (
                  <PauseCircle className="w-4 h-4 text-amber-600" />
                ) : (
                  <PlayCircle className="w-4 h-4 text-emerald-600" />
                )}
                <h2 className="text-sm font-bold text-slate-900">
                  チャット送信の一時停止スイッチ
                </h2>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                {room?.chatPaused
                  ? '現在、生徒からの匿名チャット・定型文送信を一時停止しています（「わからない！」ボタンは利用可能です）。'
                  : '現在、すべての生徒が匿名チャット・定型文を送信できます。'}
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={Boolean(room?.chatPaused)}
              onClick={() => void handleToggleChatPaused()}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                room?.chatPaused
                  ? 'bg-amber-600 hover:bg-amber-700 text-white'
                  : 'bg-slate-900 hover:bg-slate-800 text-white'
              }`}
            >
              {room?.chatPaused ? '送信を再開する' : '送信を一時停止'}
            </button>
          </div>

          {/* Muted IDs List */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <VolumeX className="w-4 h-4 text-slate-700" />
                <h2 className="text-sm font-bold text-slate-900">
                  ミュート中の匿名ID
                </h2>
              </div>
              <span className="text-xs font-mono-tabular text-slate-500">
                {mutes.length}件
              </span>
            </div>

            {mutes.length === 0 ? (
              <p className="text-xs text-slate-500">
                ミュート中の端末はありません。荒らし投稿などがある場合は下の履歴一覧からミュートできます。
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {mutes.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => void handleUnmuteTerminal(m.terminalId)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                    title="クリックしてミュート解除"
                  >
                    <span>{m.anonId}</span>
                    <Volume2 className="w-3.5 h-3.5 text-slate-500" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Full Chat History Section */}
        <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-bold text-slate-900">全チャット履歴一覧</h2>
              <span className="text-xs font-mono-tabular text-slate-500">
                全 {messages.length}件
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Filter Segmented Control */}
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                {(
                  [
                    { key: 'all', label: 'すべて' },
                    { key: 'active', label: '未対応' },
                    { key: 'resolved', label: '対応済み' },
                    { key: 'muted', label: 'ミュート' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setFilter(item.key)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      filter === item.key
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {/* Search Input */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="本文・匿名IDを検索..."
                  className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
                />
              </div>
            </div>
          </div>

          {filteredHistory.length === 0 ? (
            <div className="px-6 py-12 text-center text-xs text-slate-500">
              表示できるメッセージ履歴がありません。
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                    <th className="py-2.5 px-4 whitespace-nowrap">時刻</th>
                    <th className="py-2.5 px-4 whitespace-nowrap">匿名ID</th>
                    <th className="py-2.5 px-4 whitespace-nowrap">種別</th>
                    <th className="py-2.5 px-4">メッセージ</th>
                    <th className="py-2.5 px-4 whitespace-nowrap">状態</th>
                    <th className="py-2.5 px-4 text-right whitespace-nowrap">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredHistory.map((msg) => {
                    const isMuted = mutedTerminalIds.has(msg.terminalId);
                    const isClearedByReset = room ? msg.epoch < room.resetEpoch : false;
                    const isEffectivelyResolved = msg.resolved || isClearedByReset;
                    const timeStr = new Date(msg.createdAtMs).toLocaleTimeString('ja-JP', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    });

                    return (
                      <tr
                        key={msg.id}
                        className={`hover:bg-slate-50 transition-colors ${
                          isMuted ? 'opacity-55' : ''
                        }`}
                      >
                        <td className="py-2.5 px-4 font-mono-tabular text-slate-500 whitespace-nowrap">
                          {timeStr}
                        </td>
                        <td className="py-2.5 px-4 font-medium text-slate-800 whitespace-nowrap">
                          {msg.anonId}
                        </td>
                        <td className="py-2.5 px-4 text-slate-500 whitespace-nowrap">
                          {msg.kind === 'quick' ? '定型文' : 'チャット'}
                        </td>
                        <td className="py-2.5 px-4 text-slate-900 font-medium min-w-[200px]">
                          {msg.text}
                        </td>
                        <td className="py-2.5 px-4 whitespace-nowrap">
                          {isMuted ? (
                            <span className="text-slate-500 font-medium">ミュート中</span>
                          ) : isEffectivelyResolved ? (
                            <span className="text-emerald-600 font-medium">対応済み</span>
                          ) : (
                            <span className="text-amber-600 font-semibold">テロップ表示中</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            {!isClearedByReset && (
                              <button
                                type="button"
                                onClick={() =>
                                  void handleResolveMessage(msg.id, !msg.resolved)
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                <span>{msg.resolved ? '未対応に戻す' : '対応済み'}</span>
                              </button>
                            )}

                            {isMuted ? (
                              <button
                                type="button"
                                onClick={() => void handleUnmuteTerminal(msg.terminalId)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors cursor-pointer"
                              >
                                <Volume2 className="w-3.5 h-3.5" />
                                <span>解除</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  void handleMuteTerminal(msg.terminalId, msg.anonId)
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-md transition-colors cursor-pointer"
                              >
                                <Ban className="w-3.5 h-3.5" />
                                <span>ミュート</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

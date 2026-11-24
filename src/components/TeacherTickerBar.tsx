import { CheckCircle2, PauseCircle, RotateCcw } from 'lucide-react';
import type { MascotMood, MessageData } from '../types';
import { NEW_MESSAGE_HIGHLIGHT_MS } from '../utils/identity';
import { Mascot } from './Mascot';

interface TeacherTickerBarProps {
  roomId: string;
  confusedCount: number;
  activeMessages: MessageData[];
  chatPaused: boolean;
  nowMs: number;
  isResetting: boolean;
  onResetAll: () => void;
  onResolveMessage: (messageId: string) => void;
  inPipWindow?: boolean;
}

export function TeacherTickerBar({
  roomId,
  confusedCount,
  activeMessages,
  chatPaused,
  nowMs,
  isResetting,
  onResetAll,
  onResolveMessage,
  inPipWindow = false,
}: TeacherTickerBarProps) {
  // Green -> Amber -> Red level based on confusion count
  const level =
    confusedCount >= 5 ? 'high' : confusedCount >= 2 ? 'medium' : 'low';

  const levelLabel =
    level === 'high' ? '要フォロー' : level === 'medium' ? '注意' : '順調';

  const levelColorText =
    level === 'high'
      ? 'text-rose-400'
      : level === 'medium'
        ? 'text-amber-300'
        : 'text-emerald-400';

  const levelGaugeBar =
    level === 'high'
      ? 'bg-rose-500'
      : level === 'medium'
        ? 'bg-amber-400'
        : 'bg-emerald-500';

  const gaugePercent = Math.min(100, Math.max(8, confusedCount * 15));

  const mascotMood: MascotMood =
    level === 'high' ? 'alert' : level === 'medium' ? 'confused' : 'idle';

  const durationSeconds = Math.max(10, activeMessages.length * 5 + 6);

  return (
    <div
      className={`w-full bg-slate-950 text-slate-100 flex items-stretch overflow-hidden select-none ${
        inPipWindow
          ? 'h-full'
          : 'h-[96px] rounded-xl border border-slate-800 shadow-sm'
      }`}
    >
      {/* Left Fixed Area: Mascot + Confusion Gauge + Reset Button */}
      <div
        className={`shrink-0 border-r border-slate-800 flex items-center justify-between gap-2 bg-slate-950 ${
          inPipWindow ? 'w-[266px] px-2.5 py-1' : 'w-[300px] sm:w-[320px] px-3.5 py-2'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Mascot mood={mascotMood} size="xs" darkSurface />
          <div className="min-w-0 space-y-1">
            <div className="flex items-baseline gap-1 leading-none whitespace-nowrap">
              <span className="text-[10px] text-slate-400">
                わからない
              </span>
              <span
                className={`text-lg font-bold font-mono-tabular leading-none ${levelColorText}`}
              >
                {confusedCount}
              </span>
              <span className="text-[11px] text-slate-400">人</span>
              <span className={`text-[10px] font-semibold ml-0.5 whitespace-nowrap ${levelColorText}`}>
                {levelLabel}
              </span>
            </div>

            {/* Color-changing gauge bar */}
            <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${levelGaugeBar}`}
                style={{ width: `${gaugePercent}%` }}
              />
            </div>

            {!inPipWindow && (
              <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono-tabular leading-none">
                <span>{roomId}</span>
                {chatPaused && (
                  <span className="inline-flex items-center gap-1 text-amber-300">
                    <PauseCircle className="w-3 h-3" />
                    送信停止中
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          disabled={isResetting}
          onClick={onResetAll}
          title="全員の「わからない」とテロップをリセット"
          className={`font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg transition-colors cursor-pointer shrink-0 inline-flex items-center justify-center gap-1 whitespace-nowrap ${
            inPipWindow ? 'px-2 py-1.5 text-[11px]' : 'px-2.5 py-2 text-xs'
          }`}
        >
          <RotateCcw className="w-3.5 h-3.5 shrink-0" />
          <span>説明完了</span>
        </button>
      </div>

      {/* Right Scrolling Marquee Ticker */}
      <div className="flex-1 min-w-0 flex flex-col bg-slate-900/80 overflow-hidden">
        {!inPipWindow && (
          <div className="px-3.5 py-1 border-b border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
            <span className="truncate">
              リアルタイム質問テロップ · マウスを乗せると一時停止 · クリックで対応済み
            </span>
            <span className="font-mono-tabular shrink-0 ml-3 text-slate-300">
              未対応 {activeMessages.length}件
            </span>
          </div>
        )}

        <div className="flex-1 min-h-0 flex items-center overflow-hidden ticker-container relative">
          {inPipWindow && (
            <div className="shrink-0 px-2.5 h-full flex items-center border-r border-slate-800/80 bg-slate-950/60 text-[10px] font-mono-tabular text-slate-400 whitespace-nowrap">
              {chatPaused ? (
                <span className="inline-flex items-center gap-1 text-amber-300">
                  <PauseCircle className="w-3 h-3" />
                  停止中
                </span>
              ) : (
                <span>未対応 {activeMessages.length}</span>
              )}
            </div>
          )}

          {activeMessages.length === 0 ? (
            <div className="w-full px-3 text-[11px] text-slate-400 tracking-wide truncate">
              {inPipWindow
                ? '生徒からの質問がここに流れます（ホバーで停止・クリックで対応済み）'
                : '生徒からの匿名チャットや定型文が届くと、ここにニュース速報のように流れます。'}
            </div>
          ) : (
            <div className="flex-1 min-w-0 overflow-hidden h-full flex items-center">
              <div className="w-full overflow-hidden">
                <div
                  className="ticker-track items-center gap-4"
                  style={
                    {
                      '--ticker-duration': `${durationSeconds}s`,
                    } as React.CSSProperties
                  }
                >
                  {activeMessages.map((msg) => {
                    const isNew = nowMs - msg.createdAtMs < NEW_MESSAGE_HIGHLIGHT_MS;
                    return (
                      <button
                        key={msg.id}
                        type="button"
                        onClick={() => onResolveMessage(msg.id)}
                        title="クリックして対応済みにする"
                        className={`group inline-flex items-center gap-2 px-2.5 py-1 rounded-md border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                          isNew
                            ? 'bg-amber-500/20 border-amber-400/70 text-amber-100 hover:bg-amber-500/30'
                            : 'bg-slate-800/90 border-slate-700 text-slate-100 hover:bg-slate-700'
                        }`}
                      >
                        {isNew && (
                          <span className="text-[10px] font-bold tracking-wider text-amber-300">
                            NEW
                          </span>
                        )}
                        <span className="text-slate-300 text-[11px]">{msg.anonId}:</span>
                        <span className="font-semibold">{msg.text}</span>
                        <CheckCircle2 className="w-3 h-3 text-slate-400 group-hover:text-emerald-400 transition-colors shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

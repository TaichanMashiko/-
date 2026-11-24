import { useState } from 'react';
import type { User } from 'firebase/auth';
import { signInWithPopup, signOut } from 'firebase/auth';
import {
  ArrowRight,
  GraduationCap,
  LogIn,
  LogOut,
  MonitorPlay,
  RefreshCw,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { auth, googleProvider } from '../firebase';
import type { UserRole } from '../types';
import {
  generateSampleRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
} from '../utils/identity';
import { Mascot } from './Mascot';

interface EntryScreenProps {
  user: User | null;
  authLoading: boolean;
  anonId: string;
  initialRoomId: string;
  onEnterRoom: (roomId: string, role: UserRole) => void;
}

export function EntryScreen({
  user,
  authLoading,
  anonId,
  initialRoomId,
  onEnterRoom,
}: EntryScreenProps) {
  const [roomInput, setRoomInput] = useState(initialRoomId);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    setSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'ログインに失敗しました。';
      setAuthError(
        msg.includes('popup-closed-by-user')
          ? 'ログインウィンドウが閉じられました。もう一度お試しください。'
          : 'Googleログインに失敗しました。ポップアップがブロックされていないか確認してください。'
      );
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  const handleJoin = (role: UserRole) => {
    setErrorMsg(null);
    const normalized = normalizeRoomCode(roomInput);
    if (!normalized) {
      setErrorMsg('授業ルームIDを入力してください（例: CS-101）。');
      return;
    }
    if (!isValidRoomCode(normalized)) {
      setErrorMsg(
        '授業ルームIDは半角英数字・ハイフン（-）・アンダースコア（_）のみ使用できます。'
      );
      return;
    }
    if (!user) {
      setErrorMsg('ルームへ参加するには先にGoogleアカウントでログインしてください。');
      return;
    }
    onEnterRoom(normalized, role);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Bar */}
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
          <div className="flex items-center gap-3 whitespace-nowrap shrink-0">
            <span className="text-lg font-bold tracking-tight text-slate-900">
              ClassPulse
            </span>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            {authLoading ? (
              <span className="text-xs text-slate-500">認証状態を確認中...</span>
            ) : user ? (
              <div className="flex items-center gap-4">
                <span className="text-xs text-slate-600 hidden sm:inline">
                  {user.email}
                </span>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>ログアウト</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={signingIn}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>{signingIn ? 'ログイン中...' : 'Googleでログイン'}</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="max-w-3xl w-full space-y-8">
          {/* Hero Intro */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <p className="text-xs font-medium text-blue-600 tracking-wide">
                リアルタイム授業コンパニオン · デジタル板書 ＆ AI講義記録・個別演習
              </p>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 text-balance">
                授業中の「わからない」を、復習と個別最適演習までつなげる。
              </h1>
              <p className="text-sm text-slate-600 leading-relaxed">
                デジタル板書・教科書・ワークシートのページを自動連動。授業録音から講義記録を生成し、生徒ごとのつまずきに合わせた演習問題までワンストップで支援します。
              </p>
            </div>
            <div className="shrink-0 self-start sm:self-center">
              <Mascot mood="idle" size="lg" />
            </div>
          </div>

          {/* Auth Notice if not logged in */}
          {!authLoading && !user && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    はじめにGoogleアカウントで認証してください
                  </h2>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    授業ルームを安全に同期するために認証が必要です。生徒モードで送信する際は自動生成された匿名動物ID（{anonId}）のみが表示され、氏名やメールアドレスは教室内に公開されません。
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={signingIn}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <LogIn className="w-4 h-4" />
                <span>{signingIn ? 'ログイン中...' : 'Googleでログイン'}</span>
              </button>
            </div>
          )}

          {authError && (
            <p className="text-xs font-medium text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-4 py-2.5">
              {authError}
            </p>
          )}

          {/* Room Setup Card */}
          <section className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-4">
                <label
                  htmlFor="room-id-input"
                  className="block text-sm font-semibold text-slate-900"
                >
                  授業ルームID
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setRoomInput(generateSampleRoomCode());
                    setErrorMsg(null);
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>新しいIDを生成</span>
                </button>
              </div>
              <input
                id="room-id-input"
                type="text"
                value={roomInput}
                onChange={(e) => {
                  setRoomInput(e.target.value);
                  setErrorMsg(null);
                }}
                placeholder="例: CS-101 または MATH-2B"
                maxLength={64}
                className="w-full px-4 py-3 text-base font-mono-tabular bg-slate-50 border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <span>半角英数字・ハイフン・アンダースコアが使えます</span>
                <span>あなたの匿名ID: {anonId}</span>
              </div>
              {errorMsg && (
                <p className="text-xs font-medium text-rose-600 pt-1">{errorMsg}</p>
              )}
            </div>

            <div className="border-t border-slate-100 pt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Student Mode Card */}
              <button
                type="button"
                onClick={() => handleJoin('student')}
                className="group text-left p-5 bg-slate-50 hover:bg-blue-50/60 border border-slate-200 hover:border-blue-300 rounded-xl transition-colors flex flex-col justify-between gap-4 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-2 text-base font-bold text-slate-900">
                      <Users className="w-5 h-5 text-blue-600" />
                      生徒モードで参加
                    </span>
                    <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all" />
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    「わからない！」「わかった！」や定型文、匿名チャットを送信できます。280×300px のかわいい小窓モードに対応。
                  </p>
                </div>
                <div className="text-xs font-medium text-slate-500 flex items-center gap-2">
                  <span>小窓目安: 280 × 300px</span>
                  <span aria-hidden="true">·</span>
                  <span>15秒連投制限</span>
                </div>
              </button>

              {/* Teacher Mode Card */}
              <button
                type="button"
                onClick={() => handleJoin('teacher')}
                className="group text-left p-5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl transition-colors flex flex-col justify-between gap-4 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-2 text-base font-bold text-white">
                      <GraduationCap className="w-5 h-5 text-amber-400" />
                      教員モードで開始
                    </span>
                    <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    「わからない」人数ゲージと横スクロールテロップを表示し、質問の対応済み管理やミュート・送信停止を操作できます。
                  </p>
                </div>
                <div className="text-xs font-medium text-slate-400 flex items-center gap-2">
                  <MonitorPlay className="w-3.5 h-3.5 text-amber-400" />
                  <span>小窓目安: 960 × 140px</span>
                  <span aria-hidden="true">·</span>
                  <span>ダークテロップ</span>
                </div>
              </button>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

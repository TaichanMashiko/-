import { useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Compass,
  HelpCircle,
  XCircle,
} from 'lucide-react';
import {
  findPrerequisitesForTopic,
  type PrerequisiteNode,
} from '../data/mathPrerequisites';

interface PrerequisiteFollowUpCardProps {
  chapter: number;
  topicText: string;
  onClose?: () => void;
}

export function PrerequisiteFollowUpCard({
  chapter,
  topicText,
  onClose,
}: PrerequisiteFollowUpCardProps) {
  const chain = findPrerequisitesForTopic(chapter, topicText);
  const [selectedMap, setSelectedMap] = useState<Record<string, string>>({});
  const [checkedMap, setCheckedMap] = useState<Record<string, boolean>>({});
  const [expandedId, setExpandedId] = useState<string>(
    chain.prerequisites[0]?.id ?? ''
  );

  const handleSelect = (node: PrerequisiteNode, choice: string) => {
    setSelectedMap((prev) => ({ ...prev, [node.id]: choice }));
    setCheckedMap((prev) => ({ ...prev, [node.id]: true }));
  };

  return (
    <div className="bg-gradient-to-br from-amber-50 via-orange-50/60 to-white border border-amber-200 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
            <Compass className="w-4 h-4 text-amber-600 shrink-0" />
            <span>つまずき前提フォロー（さかのぼり確認）</span>
          </div>
          <p className="text-[11px] text-amber-800 leading-relaxed">
            「{chain.topicLabel}」が難しいときは、土台になる中学・基礎単元から1分だけ確認しましょう！
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-[11px] font-semibold text-amber-700 hover:text-amber-900 cursor-pointer shrink-0"
          >
            閉じる
          </button>
        )}
      </div>

      {/* Prerequisite Chain Stepper */}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="px-2 py-0.5 rounded-full bg-slate-900 text-white font-semibold">
          今: {chain.topicLabel}
        </span>
        {chain.prerequisites.map((node, i) => {
          const isCleared =
            checkedMap[node.id] &&
            selectedMap[node.id] === node.miniCheck.answer;
          return (
            <span key={node.id} className="inline-flex items-center gap-1">
              <ArrowLeft className="w-3 h-3 text-amber-500" />
              <button
                type="button"
                onClick={() => setExpandedId(node.id)}
                className={`px-2 py-0.5 rounded-full font-semibold border transition-colors cursor-pointer ${
                  isCleared
                    ? 'bg-emerald-100 border-emerald-300 text-emerald-800'
                    : expandedId === node.id
                      ? 'bg-amber-500 border-amber-600 text-white'
                      : 'bg-white border-amber-300 text-amber-900 hover:bg-amber-100'
                }`}
              >
                前提{i + 1}: {node.grade}
              </button>
            </span>
          );
        })}
      </div>

      {/* Active Prerequisite Card */}
      <div className="space-y-2.5">
        {chain.prerequisites
          .filter((n) => !expandedId || n.id === expandedId)
          .map((node) => {
            const chosen = selectedMap[node.id];
            const isChecked = Boolean(checkedMap[node.id]);
            const isCorrect = isChecked && chosen === node.miniCheck.answer;

            return (
              <div
                key={node.id}
                className="bg-white border border-amber-200 rounded-xl p-3.5 space-y-2.5 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="font-bold text-slate-900">{node.title}</h4>
                  <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-semibold text-[10px]">
                    {node.grade}
                  </span>
                </div>

                <p className="text-slate-700 leading-relaxed">{node.summary}</p>

                <div className="px-3 py-2 rounded-lg bg-slate-900 text-amber-200 font-mono text-[11px] font-semibold">
                  {node.formula}
                </div>

                {/* Mini Check */}
                <div className="pt-2 border-t border-slate-100 space-y-2">
                  <p className="font-bold text-slate-800 flex items-center gap-1">
                    <HelpCircle className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span>1問ミニ確認: {node.miniCheck.question}</span>
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {node.miniCheck.choices.map((c) => {
                      const isSel = chosen === c;
                      const showOk = isChecked && c === node.miniCheck.answer;
                      const showNg =
                        isChecked && isSel && c !== node.miniCheck.answer;
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => handleSelect(node, c)}
                          className={`px-2.5 py-1.5 rounded-lg border text-left text-[11px] font-semibold transition-colors cursor-pointer ${
                            showOk
                              ? 'bg-emerald-50 border-emerald-500 text-emerald-900'
                              : showNg
                                ? 'bg-rose-50 border-rose-500 text-rose-900'
                                : 'bg-slate-50 hover:bg-indigo-50 border-slate-200 text-slate-800'
                          }`}
                        >
                          {c}
                        </button>
                      );
                    })}
                  </div>

                  {isChecked && (
                    <div
                      className={`p-2.5 rounded-lg text-[11px] leading-relaxed flex items-start gap-2 ${
                        isCorrect
                          ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
                          : 'bg-rose-50 text-rose-900 border border-rose-200'
                      }`}
                    >
                      {isCorrect ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <p className="font-bold">
                          {isCorrect
                            ? 'OK！この前提知識はバッチリです！'
                            : `正解は「${node.miniCheck.answer}」です`}
                        </p>
                        <p className="mt-0.5">{node.miniCheck.explanation}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}

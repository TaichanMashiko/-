import { GoogleGenAI } from '@google/genai';
import { findPrerequisitesForTopic } from '../data/mathPrerequisites';
import type {
  AdaptiveProblem,
  DeckInfo,
  LectureSegment,
  StudentLearningLog,
} from '../types';
import { getRecommendedTestsForTopic } from './materialsService';

const GEMINI_KEY_LS = 'classpulse_gemini_api_key';

export function getStoredGeminiApiKey(): string {
  const envKey =
    (import.meta.env?.VITE_GEMINI_API_KEY as string | undefined) ?? '';
  if (envKey.trim()) return envKey.trim();
  try {
    return (localStorage.getItem(GEMINI_KEY_LS) ?? '').trim();
  } catch {
    return '';
  }
}

export function setStoredGeminiApiKey(key: string): void {
  try {
    if (key.trim()) {
      localStorage.setItem(GEMINI_KEY_LS, key.trim());
    } else {
      localStorage.removeItem(GEMINI_KEY_LS);
    }
  } catch {
    // ignore
  }
}

function getGenAIClient(): GoogleGenAI | null {
  const key = getStoredGeminiApiKey();
  if (!key) return null;
  try {
    return new GoogleGenAI({ apiKey: key });
  } catch {
    return null;
  }
}

/**
 * Generate structured Japanese lecture notes (summary, keyPoints, per-segment aiNote)
 * from recorded lecture segments. Uses Gemini when API key is configured, otherwise
 * produces a rich structured summary from slide metadata + transcripts.
 */
export async function generateLectureNotes(
  deck: DeckInfo,
  segments: LectureSegment[]
): Promise<{
  summary: string;
  keyPoints: string[];
  segments: LectureSegment[];
}> {
  if (segments.length === 0) {
    return {
      summary: `${deck.title} の授業記録です。`,
      keyPoints: ['記録されたスライド区間がありません。'],
      segments,
    };
  }

  const ai = getGenAIClient();
  const recTests = getRecommendedTestsForTopic(
    deck.chapter,
    segments.map((s) => s.topic).join(' ')
  );
  const prereqChain = findPrerequisitesForTopic(
    deck.chapter,
    segments.map((s) => s.topic).join(' ')
  );

  if (ai) {
    try {
      const compactSegments = segments.map((seg) => ({
        slidePage: seg.slidePage,
        textbookPage: seg.textbookPage,
        worksheetPage: seg.worksheetPage,
        topic: seg.topic,
        problemTag: seg.problemTag,
        confusionCount: seg.confusionCount,
        transcript: seg.transcript.slice(0, 600),
      }));

      const prompt = `あなたは高校数学Ⅰのベテラン教員兼書記アシスタントです。
以下の授業録音文字起こし・スライド進行・つまずきデータから、生徒がワークシートや10分間テストを見ながら復習しやすい、構造化された日本語の「講義記録」をJSON形式で作成してください。

単元: ${deck.title}
関連する前提知識: ${prereqChain.prerequisites.map((p) => `${p.title}（${p.grade}）`).join(' / ')}
関連する確認テスト: ${recTests.slice(0, 3).map((t) => t.title).join(' / ')}
区間データ:
${JSON.stringify(compactSegments, null, 2)}

以下のJSON形式のみで返答してください（マークダウン記法は不要）:
{
  "summary": "【今回のねらい】と【授業全体の流れ・重要ポイント】を生徒向けにわかりやすく3〜4文でまとめた要約",
  "keyPoints": [
    "【重要公式・用語】...",
    "【解法のコツ】...",
    "【つまずき注意＆前提知識】...",
    "【おすすめ復習】対応ワークシート・10分間テストの活用法"
  ],
  "segmentNotes": [
    { "slidePage": 数値, "aiNote": "このスライドでの解説要点・式変形のポイント・つまずきやすい箇所のフォロー（2文程度）" }
  ]
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      const raw = (response.text ?? '').trim();
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as {
          summary?: string;
          keyPoints?: string[];
          segmentNotes?: { slidePage: number; aiNote: string }[];
        };
        const noteByPage = new Map<number, string>();
        for (const item of parsed.segmentNotes ?? []) {
          noteByPage.set(item.slidePage, item.aiNote);
        }
        return {
          summary:
            parsed.summary ||
            `${deck.title}（スライド ${segments[0].slidePage}〜${segments[segments.length - 1].slidePage}）の講義記録です。`,
          keyPoints:
            parsed.keyPoints && parsed.keyPoints.length > 0
              ? parsed.keyPoints
              : buildFallbackKeyPoints(deck, segments),
          segments: segments.map((seg) => ({
            ...seg,
            aiNote:
              noteByPage.get(seg.slidePage) || buildFallbackSegmentNote(seg),
          })),
        };
      }
    } catch {
      // Fall through to deterministic summary
    }
  }

  // Deterministic high-quality structured fallback
  const startSlide = segments[0].slidePage;
  const endSlide = segments[segments.length - 1].slidePage;
  const tbPages = segments
    .map((s) => s.textbookPage)
    .filter((p): p is number => p != null && p > 0);
  const tbText =
    tbPages.length > 0
      ? `（教科書 p.${Math.min(...tbPages)}〜p.${Math.max(...tbPages)}）`
      : '';
  const totalConfused = segments.reduce((acc, s) => acc + s.confusionCount, 0);
  const hardest = [...segments].sort(
    (a, b) => b.confusionCount - a.confusionCount
  )[0];
  const mainPrereq = prereqChain.prerequisites[0];

  const summary =
    `【今回の学習範囲】${deck.title} のスライド p.${startSlide}〜p.${endSlide}${tbText}を学習しました。` +
    (totalConfused > 0 && hardest
      ? ` 特にスライド p.${hardest.slidePage}「${hardest.topic}」でつまずきが多かったため、ワークシート p.${hardest.worksheetPage} と前提知識「${mainPrereq?.title ?? '基本公式'}」を確認して復習しましょう。`
      : ` ワークシート・解答PDFや対応する「${recTests[0]?.title ?? '10分間テスト'}」を使って定着させましょう。`);

  return {
    summary,
    keyPoints: buildFallbackKeyPoints(deck, segments),
    segments: segments.map((seg) => ({
      ...seg,
      aiNote: seg.aiNote || buildFallbackSegmentNote(seg),
    })),
  };
}

function buildFallbackKeyPoints(
  deck: DeckInfo,
  segments: LectureSegment[]
): string[] {
  const topics = Array.from(
    new Set(
      segments
        .map((s) =>
          s.problemTag ? `${s.topic}（${s.problemTag}）` : s.topic
        )
        .filter(Boolean)
    )
  ).slice(0, 4);

  const pts = topics.map((t) => `${t} の考え方と解き方を確認する`);
  if (pts.length === 0) {
    pts.push(`${deck.title} の基本事項と例題を確認する`);
  }
  const confusedSegs = segments.filter((s) => s.confusionCount > 0);
  if (confusedSegs.length > 0) {
    pts.push(
      `つまずきが多かったスライド: ${confusedSegs
        .slice(0, 3)
        .map((s) => `p.${s.slidePage}（ワーク p.${s.worksheetPage}）`)
        .join('・')}`
    );
  }
  return pts;
}

function buildFallbackSegmentNote(seg: LectureSegment): string {
  const ref = [
    seg.textbookPage ? `教科書 p.${seg.textbookPage}` : null,
    `ワークシート p.${seg.worksheetPage}`,
  ]
    .filter(Boolean)
    .join(' / ');
  if (seg.transcript.trim().length > 15) {
    const excerpt = seg.transcript.trim().slice(0, 90);
    return `【解説メモ】${excerpt}${seg.transcript.length > 90 ? '…' : ''}（${ref}）`;
  }
  return `【${seg.topic}${seg.problemTag ? `・${seg.problemTag}` : ''}】${ref} と見比べながら公式・途中式を確認しましょう。`;
}

/**
 * Generate an instant AI explanation/hint when a student posts "ここがわからない" on a note.
 */
export async function generateCommentHint(params: {
  deckTitle: string;
  chapter?: number;
  topic: string;
  textbookPage: number | null;
  worksheetPage: number;
  questionText: string;
  transcript: string;
}): Promise<string> {
  const prereq = findPrerequisitesForTopic(params.chapter ?? 1, params.topic);
  const prereqSummary = prereq.prerequisites
    .slice(0, 2)
    .map((p) => `「${p.title}（${p.grade}）」(${p.formula})`)
    .join('、');

  const ai = getGenAIClient();
  if (ai) {
    try {
      const prompt = `高校数学Ⅰの優しい先生として、生徒の疑問に4行以内でわかりやすくヒントを出してください。
必ず「つまずきの原因になりやすい前提知識（中学数学や前の単元）」にも1文で触れてフォローしてください。
単元: ${params.deckTitle} / テーマ: ${params.topic}
関連する前提知識: ${prereqSummary}
教科書: ${params.textbookPage ? `p.${params.textbookPage}` : '該当ページ'} / ワークシート: p.${params.worksheetPage}
先生の解説ログ: ${params.transcript.slice(0, 300) || 'なし'}
生徒の質問: ${params.questionText}`;
      const res = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      const text = (res.text ?? '').trim();
      if (text) return text;
    } catch {
      // fallback below
    }
  }
  return `💡 ヒント（${params.topic}）: まずは土台となる前提知識 ${prereqSummary} を確認してから、ワークシート p.${params.worksheetPage} の解答PDFで「最初の1行目の式変形」を見比べてみましょう！`;
}

/**
 * Generate 3 similar practice problems specifically for a selected page/topic ("このページの類題を解く").
 */
export async function generateSimilarProblemsForPage(params: {
  chapter: number;
  deckId: string;
  deckTitle: string;
  topic: string;
  textbookPage: number | null;
  worksheetPage: number;
  difficulty: 'basic' | 'standard' | 'challenge';
}): Promise<AdaptiveProblem[]> {
  const ai = getGenAIClient();
  if (ai) {
    try {
      const prompt = `あなたは高校数学Ⅰの先生です。生徒が「このページの類題を解きたい！」と言っています。
以下のページ内容にぴったり合った4択の類題を3問作成してください。
単元: ${params.deckTitle}
テーマ: ${params.topic}
教科書: ${params.textbookPage ? `p.${params.textbookPage}` : '該当箇所'} / ワークシート: p.${params.worksheetPage}
難易度: ${params.difficulty}

以下のJSON配列のみで返答してください:
[
  {
    "topic": "テーマ名",
    "question": "問題文",
    "choices": ["選択肢1", "選択肢2", "選択肢3", "選択肢4"],
    "answer": "正解の選択肢（choicesのいずれかと完全一致）",
    "hints": ["前提知識を思い出すヒント1", "解き方のヒント2"],
    "explanation": "わかりやすい途中式と解説"
  }
]`;
      const res = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      const raw = (res.text ?? '').trim();
      const arrMatch = raw.match(/\[[\s\S]*\]/);
      if (arrMatch) {
        const parsed = JSON.parse(arrMatch[0]) as Array<{
          topic: string;
          question: string;
          choices: string[];
          answer: string;
          hints: string[];
          explanation: string;
        }>;
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.slice(0, 3).map((p, i) => ({
            id: `sim_prob_${Date.now()}_${i}`,
            chapter: params.chapter,
            deckId: params.deckId,
            topic: p.topic || params.topic,
            difficulty: params.difficulty,
            textbookPage: params.textbookPage,
            worksheetPage: params.worksheetPage,
            question: p.question,
            choices: p.choices,
            answer: p.answer,
            hints: p.hints ?? [],
            explanation: p.explanation ?? '',
            source: 'ai' as const,
          }));
        }
      }
    } catch {
      // fallback below
    }
  }
  return [0, 1, 2].map((i) => ({
    ...generateProceduralProblem(
      params.chapter,
      params.deckId,
      params.difficulty,
      params.topic,
      i
    ),
    textbookPage: params.textbookPage,
    worksheetPage: params.worksheetPage,
  }));
}

// --- Procedural Adaptive Math I Problem Generator (always works offline + AI upgrade) ---

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randNonZero(min: number, max: number): number {
  let v = 0;
  while (v === 0) v = randInt(min, max);
  return v;
}

function fmtSigned(n: number, suffix = ''): string {
  if (n === 0) return '';
  return n > 0 ? `+ ${n}${suffix}` : `- ${Math.abs(n)}${suffix}`;
}

function generateProceduralProblem(
  chapter: number,
  deckId: string,
  difficulty: 'basic' | 'standard' | 'challenge',
  topicHint: string,
  idx: number
): AdaptiveProblem {
  const id = `prob_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`;

  if (chapter === 1) {
    // 1章 数と式
    if (difficulty === 'basic') {
      const a = randInt(2, 6);
      const b = randInt(1, 7);
      const c = randNonZero(-5, 5);
      const bSum = b + c;
      const prod = b * c;
      const ans = `x^2 ${fmtSigned(bSum, 'x')} ${fmtSigned(prod)}`.replace(/\s+/g, ' ').trim();
      return {
        id,
        chapter,
        deckId,
        topic: topicHint || '多項式の展開',
        difficulty,
        question: `次の式を展開せよ： (x + ${b})(x ${c > 0 ? `+ ${c}` : `- ${Math.abs(c)}`})`,
        choices: [
          ans,
          `x^2 ${fmtSigned(bSum + 1, 'x')} ${fmtSigned(prod)}`.trim(),
          `x^2 ${fmtSigned(bSum, 'x')} ${fmtSigned(-prod)}`.trim(),
          `x^2 ${fmtSigned(b - c, 'x')} ${fmtSigned(prod)}`.trim(),
        ].sort(() => Math.random() - 0.5),
        answer: ans,
        hints: [
          '公式 (x + a)(x + b) = x² + (a + b)x + ab を使います。',
          `今回は a = ${b}, b = ${c} なので、和は ${bSum}、積は ${prod} です。`,
        ],
        explanation: `(x + ${b})(x ${c > 0 ? `+ ${c}` : `- ${Math.abs(c)}`}) = x² + (${b} ${c > 0 ? `+ ${c}` : `- ${Math.abs(c)}`})x + (${b})×(${c}) = ${ans} です。（参考: ${a}などの係数が付く場合も同様に分配法則を使います）`,
        source: 'generator',
      };
    }
    if (difficulty === 'standard') {
      const p = randInt(2, 5);
      const q = randInt(1, 6);
      const ans = `(x + ${p})(x + ${q})`;
      return {
        id,
        chapter,
        deckId,
        topic: topicHint || '因数分解',
        difficulty,
        question: `次の式を因数分解せよ： x^2 + ${p + q}x + ${p * q}`,
        choices: [
          ans,
          `(x + ${p + 1})(x + ${q})`,
          `(x - ${p})(x - ${q})`,
          `(x + ${p * q})(x + 1)`,
        ].sort(() => Math.random() - 0.5),
        answer: ans,
        hints: [
          `足して ${p + q}、掛けて ${p * q} になる2つの整数を探しましょう。`,
          `${p} と ${q} の和と積を確かめてみましょう。`,
        ],
        explanation: `${p} + ${q} = ${p + q}、${p} × ${q} = ${p * q} より、x² + ${p + q}x + ${p * q} = ${ans} となります。`,
        source: 'generator',
      };
    }
    // challenge: absolute value inequality
    const k = randInt(2, 5);
    const m = randInt(1, 4);
    const left = m - k;
    const right = m + k;
    const ans = `${left} < x < ${right}`;
    return {
      id,
      chapter,
      deckId,
      topic: topicHint || '絶対値を含む1次不等式',
      difficulty,
      question: `次の1次不等式を解け： |x - ${m}| < ${k}`,
      choices: [
        ans,
        `x < ${left}, ${right} < x`,
        `${-k} < x < ${k}`,
        `${left - 1} < x < ${right + 1}`,
      ].sort(() => Math.random() - 0.5),
      answer: ans,
      hints: [
        '|A| < c (c > 0) は -c < A < c と同値です。',
        `-${k} < x - ${m} < ${k} の各辺に ${m} を足しましょう。`,
      ],
      explanation: `|x - ${m}| < ${k} より -${k} < x - ${m} < ${k}。各辺に ${m} を加えて ${ans} です。`,
      source: 'generator',
    };
  }

  if (chapter === 2) {
    // 2章 集合と論証
    const items = [
      {
        q: '実数 x について、「x = 3」は「x² = 9」であるための何条件か？',
        ans: '十分条件であるが必要条件ではない',
        choices: [
          '十分条件であるが必要条件ではない',
          '必要条件であるが十分条件ではない',
          '必要十分条件である',
          '必要条件でも十分条件でもない',
        ],
        hints: [
          '「x = 3 ⇒ x² = 9」の真偽と、逆「x² = 9 ⇒ x = 3」の真偽を調べましょう。',
          '逆には x = -3 という反例があります。',
        ],
        exp: 'x = 3 ⇒ x² = 9 は真、x² = 9 ⇒ x = 3 は偽（反例 x = -3）。よって十分条件であるが必要条件ではありません。',
      },
      {
        q: '全体集合 U = {1,2,3,4,5,6}、A = {1,2,4}、B = {2,3,4,6} のとき、A ∩ B はどれか？',
        ans: '{2, 4}',
        choices: ['{2, 4}', '{1, 2, 3, 4, 6}', '{1, 3, 6}', '{5}'],
        hints: ['∩（共通部分）は、A と B の両方に含まれる要素の集まりです。'],
        exp: 'A と B に共通して含まれる要素は 2 と 4 なので、A ∩ B = {2, 4} です。',
      },
      {
        q: '命題「n が 4 の倍数ならば、n は 2 の倍数である」の対偶はどれか？',
        ans: 'n が 2 の倍数でないならば、n は 4 の倍数でない',
        choices: [
          'n が 2 の倍数でないならば、n は 4 の倍数でない',
          'n が 2 の倍数ならば、n は 4 の倍数である',
          'n が 4 の倍数でないならば、n は 2 の倍数でない',
          'n が 2 の倍数ならば、n は 4 の倍数でない',
        ],
        hints: ['「p ⇒ q」の対偶は「(qでない) ⇒ (pでない)」です。'],
        exp: '仮定と結論を入れ替えてそれぞれ否定すると「n が 2 の倍数でないならば、n は 4 の倍数でない」になります。',
      },
    ];
    const picked = items[idx % items.length];
    return {
      id,
      chapter,
      deckId,
      topic: topicHint || '集合と命題・必要十分条件',
      difficulty,
      question: picked.q,
      choices: [...picked.choices].sort(() => Math.random() - 0.5),
      answer: picked.ans,
      hints: picked.hints,
      explanation: picked.exp,
      source: 'generator',
    };
  }

  if (chapter === 3) {
    // 3章 2次関数
    const p = randNonZero(-4, 4);
    const q = randNonZero(-5, 5);
    const b = -2 * p;
    const c = p * p + q;
    const ans = `(${p}, ${q})`;
    return {
      id,
      chapter,
      deckId,
      topic: topicHint || '2次関数の平方完成と頂点',
      difficulty,
      question: `2次関数 y = x^2 ${fmtSigned(b, 'x')} ${fmtSigned(c)} の頂点の座標を求めよ。`,
      choices: [
        ans,
        `(${-p}, ${q})`,
        `(${p}, ${-q})`,
        `(${b}, ${c})`,
      ].sort(() => Math.random() - 0.5),
      answer: ans,
      hints: [
        'y = (x - p)² + q の形に平方完成しましょう。',
        `x の係数 ${b} の半分は ${b / 2} です。`,
      ],
      explanation: `y = (x ${p > 0 ? `- ${p}` : `+ ${Math.abs(p)}`})² - ${p * p} ${fmtSigned(c)} = (x ${p > 0 ? `- ${p}` : `+ ${Math.abs(p)}`})² ${fmtSigned(q)} より、頂点は ${ans} です。`,
      source: 'generator',
    };
  }

  if (chapter === 4) {
    // 4章 図形と計量
    const items = [
      {
        q: 'sin 30° + cos 60° の値を求めよ。',
        ans: '1',
        choices: ['1', '√3', '1/2', '√2'],
        hints: ['sin 30° = 1/2、cos 60° = 1/2 です。'],
        exp: 'sin 30° = 1/2、cos 60° = 1/2 なので、1/2 + 1/2 = 1 です。',
      },
      {
        q: '△ABC において b = 4, c = 6, A = 30° のとき、△ABC の面積 S を求めよ。',
        ans: '6',
        choices: ['6', '12', '6√3', '12√3'],
        hints: ['面積公式 S = (1/2)bc sin A を使います。', 'sin 30° = 1/2 です。'],
        exp: 'S = (1/2) × 4 × 6 × sin 30° = 12 × (1/2) = 6 です。',
      },
      {
        q: '0° ≦ θ ≦ 180° で cos θ = -1/2 のとき、θ の値は？',
        ans: '120°',
        choices: ['120°', '60°', '150°', '135°'],
        hints: ['cos θ が負なので鈍角（90° < θ ≦ 180°）です。', 'cos 60° = 1/2 なので 180° - 60° を考えます。'],
        exp: 'cos(180° - 60°) = -cos 60° = -1/2 より、θ = 120° です。',
      },
    ];
    const picked = items[idx % items.length];
    return {
      id,
      chapter,
      deckId,
      topic: topicHint || '三角比と図形の計量',
      difficulty,
      question: picked.q,
      choices: [...picked.choices].sort(() => Math.random() - 0.5),
      answer: picked.ans,
      hints: picked.hints,
      explanation: picked.exp,
      source: 'generator',
    };
  }

  // 5章 データの分析
  const base = randInt(4, 9);
  const data = [base - 2, base, base, base + 2, base + 5];
  const mean = (data.reduce((a, b) => a + b, 0) / data.length).toFixed(1);
  const ans = `${mean}`;
  return {
    id,
    chapter: 5,
    deckId,
    topic: topicHint || '代表値（平均値・中央値）',
    difficulty,
    question: `次の5個のデータ [${data.join(', ')}] の平均値を求めよ。`,
    choices: [
      ans,
      `${(Number(mean) + 1).toFixed(1)}`,
      `${(Number(mean) - 0.5).toFixed(1)}`,
      `${base}.0`,
    ].sort(() => Math.random() - 0.5),
    answer: ans,
    hints: ['データの合計を個数（5）で割ります。'],
    explanation: `合計は ${data.reduce((a, b) => a + b, 0)}、データの個数は 5 なので、平均値は ${mean} です。`,
    source: 'generator',
  };
}

/**
 * Generate a personalized set of 3 adaptive problems based on the student's weak spots.
 */
export async function generateAdaptiveProblems(params: {
  weakLogs: StudentLearningLog[];
  fallbackChapter: number;
  fallbackDeckId: string;
  difficulty: 'basic' | 'standard' | 'challenge';
}): Promise<AdaptiveProblem[]> {
  const targetLog = params.weakLogs[0];
  const chapter = targetLog?.chapter || params.fallbackChapter || 1;
  const deckId = targetLog?.deckId || params.fallbackDeckId || 'm1-ch1-s1';
  const topicHint = targetLog?.topic || '';

  const ai = getGenAIClient();
  if (ai) {
    try {
      const weakSummary = params.weakLogs
        .slice(0, 5)
        .map(
          (l) =>
            `${l.deckTitle} p.${l.slidePage}（${l.topic}）: ${l.detail || l.eventType}`
        )
        .join('\n');

      const prompt = `あなたは高校数学Ⅰの個別指導AIです。生徒の「わからない」履歴に合わせて、4択の確認演習問題を3問作成してください。
難易度: ${params.difficulty}
対象の章: 第${chapter}章
生徒のつまずき履歴:
${weakSummary || `第${chapter}章の基本復習`}

以下のJSON配列のみで返答してください:
[
  {
    "topic": "テーマ名",
    "question": "問題文",
    "choices": ["選択肢1", "選択肢2", "選択肢3", "選択肢4"],
    "answer": "正解の選択肢（choicesのいずれかと完全一致）",
    "hints": ["ヒント1", "ヒント2"],
    "explanation": "わかりやすい解説"
  }
]`;
      const res = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });
      const raw = (res.text ?? '').trim();
      const arrMatch = raw.match(/\[[\s\S]*\]/);
      if (arrMatch) {
        const parsed = JSON.parse(arrMatch[0]) as Array<{
          topic: string;
          question: string;
          choices: string[];
          answer: string;
          hints: string[];
          explanation: string;
        }>;
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.slice(0, 3).map((p, i) => ({
            id: `ai_prob_${Date.now()}_${i}`,
            chapter,
            deckId,
            topic: p.topic || topicHint || `第${chapter}章`,
            difficulty: params.difficulty,
            textbookPage: targetLog?.textbookPage ?? null,
            worksheetPage: targetLog?.worksheetPage ?? 1,
            question: p.question,
            choices: p.choices,
            answer: p.answer,
            hints: p.hints ?? [],
            explanation: p.explanation ?? '',
            source: 'ai' as const,
          }));
        }
      }
    } catch {
      // Fall back to procedural generator
    }
  }

  return [0, 1, 2].map((i) =>
    generateProceduralProblem(
      chapter,
      deckId,
      params.difficulty,
      topicHint,
      i
    )
  );
}

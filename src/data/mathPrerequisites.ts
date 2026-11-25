export interface PrerequisiteNode {
  id: string;
  title: string;
  grade: string; // e.g. '中学3年', '中学2年', '中学1年', '数学Ⅰ 基礎'
  summary: string;
  formula: string;
  miniCheck: {
    question: string;
    choices: string[];
    answer: string;
    explanation: string;
  };
}

export interface TopicPrerequisiteChain {
  chapter: number;
  keywords: string[];
  topicLabel: string;
  prerequisites: PrerequisiteNode[];
}

export const MATH1_PREREQUISITE_CHAINS: TopicPrerequisiteChain[] = [
  // 第1章 数と式
  {
    chapter: 1,
    keywords: ['多項式', '単項式', '展開', '乗法', '因数分解', 'たすき掛け'],
    topicLabel: '多項式の展開・因数分解',
    prerequisites: [
      {
        id: 'pre-ch1-dist',
        title: '分配法則と同類項の整理',
        grade: '中学1〜2年',
        summary:
          'カッコの外の数を中のすべての項に掛けて展開し、文字の部分が同じ「同類項」どうしをまとめます。',
        formula: 'a(b + c) = ab + ac,  (a + b)(c + d) = ac + ad + bc + bd',
        miniCheck: {
          question: '3x(2x - 5) を展開したものはどれ？',
          choices: ['6x² - 15x', '6x² - 5', '5x² - 15x', '6x - 15'],
          answer: '6x² - 15x',
          explanation: '3x × 2x = 6x²、3x × (-5) = -15x より 6x² - 15x です。',
        },
      },
      {
        id: 'pre-ch1-mul',
        title: '中学の乗法公式（和と差・2乗の展開）',
        grade: '中学3年',
        summary:
          '高校の3乗の公式やたすき掛け因数分解は、まず中3の4つの基本公式が反射的に使えることが土台になります。',
        formula: '(x + a)(x + b) = x² + (a+b)x + ab,  (a + b)(a - b) = a² - b²',
        miniCheck: {
          question: '(x - 4)² を展開したものはどれ？',
          choices: ['x² - 8x + 16', 'x² - 16', 'x² - 4x + 16', 'x² + 8x - 16'],
          answer: 'x² - 8x + 16',
          explanation:
            '(x - a)² = x² - 2ax + a² なので、x² - 2×4×x + 4² = x² - 8x + 16 です。',
        },
      },
    ],
  },
  {
    chapter: 1,
    keywords: ['実数', '平方根', '根号', '有理化', '絶対値'],
    topicLabel: '実数・平方根・絶対値',
    prerequisites: [
      {
        id: 'pre-ch1-sqrt',
        title: '平方根の基本と a√b の変形',
        grade: '中学3年',
        summary:
          'ルートの中を素因数分解し、2乗になった数をルートの外に出します。足し算・引き算は√の中が同じときだけまとめられます。',
        formula: '√(a²b) = a√b (a > 0),  √a × √b = √(ab)',
        miniCheck: {
          question: '√18 + √8 を簡単にしたものはどれ？',
          choices: ['5√2', '√26', '6√2', '4√2'],
          answer: '5√2',
          explanation: '√18 = 3√2、√8 = 2√2 なので、3√2 + 2√2 = 5√2 です。',
        },
      },
      {
        id: 'pre-ch1-abs',
        title: '数直線上の距離としての絶対値',
        grade: '中学1年',
        summary:
          '絶対値 |a| は「数直線上で原点0からの距離」です。中身がマイナスなら符号を反転してプラスにします。',
        formula: 'a ≧ 0 のとき |a| = a、 a < 0 のとき |a| = -a',
        miniCheck: {
          question: '|-7| + |3 - 5| の値はどれ？',
          choices: ['9', '5', '-9', '11'],
          answer: '9',
          explanation: '|-7| = 7、|3 - 5| = |-2| = 2 なので 7 + 2 = 9 です。',
        },
      },
    ],
  },
  {
    chapter: 1,
    keywords: ['不等式', '1次不等式', '連立不等式'],
    topicLabel: '1次不等式',
    prerequisites: [
      {
        id: 'pre-ch1-ineq',
        title: '1次方程式の移項と、負の数を掛けるときのルール',
        grade: '中学1年',
        summary:
          '不等式の解き方は1次方程式と同じですが、「両辺に負の数を掛ける・割るときだけ不等号の向きが逆転する」のが最大のポイントです。',
        formula: '-ax > b (a > 0)  ⇒  x < -b/a （向きが逆転！）',
        miniCheck: {
          question: '不等式 -2x > 6 の解はどれ？',
          choices: ['x < -3', 'x > -3', 'x < 3', 'x > 3'],
          answer: 'x < -3',
          explanation:
            '両辺を負の数 -2 で割るので、不等号の向きが > から < に反転して x < -3 です。',
        },
      },
    ],
  },

  // 第2章 集合と論証
  {
    chapter: 2,
    keywords: ['集合', '命題', '条件', '必要', '十分', '対偶', '背理法', '論証'],
    topicLabel: '集合と命題・必要十分条件',
    prerequisites: [
      {
        id: 'pre-ch2-set',
        title: '倍数・約数と数直線での範囲表現',
        grade: '中学1年',
        summary:
          '集合の包含関係（A ⊂ B）や共通部分（∩）・和集合（∪）は、具体的な要素を書き出すか数直線に図示すると一目で分かります。',
        formula: '「かつ(∩)」= 重なる部分、「または(∪)」= 合わせた全体',
        miniCheck: {
          question: '1から10までの自然数のうち「偶数 かつ 3の倍数」はどれ？',
          choices: ['{6}', '{2, 3, 4, 6, 8, 9, 10}', '{3, 6, 9}', '{2, 4, 6, 8, 10}'],
          answer: '{6}',
          explanation: '偶数{2,4,6,8,10}と3の倍数{3,6,9}の両方に入るのは 6 のみです。',
        },
      },
      {
        id: 'pre-ch2-proof',
        title: '「仮定 ⇒ 結論」と反例の見つけ方',
        grade: '中学2年',
        summary:
          '「p ならば q」が偽であることを示すには、p を満たすのに q を満たさない具体例（反例）を1つ見つければOKです。',
        formula: 'p ⇒ q が真 ⇔ P ⊂ Q （小さい集合 ⇒ 大きい集合）',
        miniCheck: {
          question: '命題「x² = 4 ならば x = 2 である」の反例はどれ？',
          choices: ['x = -2', 'x = 2', 'x = 4', 'x = 0'],
          answer: 'x = -2',
          explanation:
            'x = -2 は仮定 x² = 4 を満たしますが、結論 x = 2 を満たさないため反例になります。',
        },
      },
    ],
  },

  // 第3章 2次関数
  {
    chapter: 3,
    keywords: ['2次関数', '関数', 'グラフ', '頂点', '平方完成', '最大', '最小', '2次方程式', '判別式', '2次不等式'],
    topicLabel: '2次関数・平方完成・2次不等式',
    prerequisites: [
      {
        id: 'pre-ch3-quad-mid',
        title: '中学の y = ax² のグラフと変域',
        grade: '中学3年',
        summary:
          'a > 0 なら下に凸（谷型）、a < 0 なら上に凸（山型）。変域に x = 0（頂点）を含むときは最大値または最小値が頂点になります。',
        formula: 'y = ax² のグラフを x軸方向に p、y軸方向に q 平行移動 ⇒ y = a(x - p)² + q',
        miniCheck: {
          question: 'y = x² で -2 ≦ x ≦ 3 のとき、y の最小値はどれ？',
          choices: ['0', '4', '9', '-2'],
          answer: '0',
          explanation:
            '変域に x = 0 が含まれるため、最小値は x = 0 のとき y = 0 になります（x = -2 の 4 ではありません）。',
        },
      },
      {
        id: 'pre-ch3-complete',
        title: '平方完成のもとになる「(x + a)² の展開の逆」',
        grade: '中学3年',
        summary:
          '平方完成は x の係数の「半分」を使って (x + 半分)² を作り、余分に出た (半分)² を引き算して調整します。',
        formula: 'x² + 2ax = (x + a)² - a²',
        miniCheck: {
          question: 'x² + 6x を平方完成したものはどれ？',
          choices: ['(x + 3)² - 9', '(x + 3)² + 9', '(x + 6)² - 36', '(x + 3)² - 3'],
          answer: '(x + 3)² - 9',
          explanation:
            '6 の半分は 3 なので (x + 3)² を作り、余分な 3² = 9 を引いて (x + 3)² - 9 です。',
        },
      },
      {
        id: 'pre-ch3-eq',
        title: '2次方程式の因数分解と解の公式',
        grade: '中学3年',
        summary:
          '2次不等式やグラフと x 軸の交点では、まず ax² + bx + c = 0 の解を求める力がそのまま必要になります。',
        formula: 'x = (-b ± √(b² - 4ac)) / 2a',
        miniCheck: {
          question: '2次方程式 x² - 5x + 6 = 0 の解はどれ？',
          choices: ['x = 2, 3', 'x = -2, -3', 'x = 1, 6', 'x = -1, 6'],
          answer: 'x = 2, 3',
          explanation: '(x - 2)(x - 3) = 0 と因数分解できるので x = 2, 3 です。',
        },
      },
    ],
  },

  // 第4章 図形と計量（三角比）
  {
    chapter: 4,
    keywords: ['三角比', 'sin', 'cos', 'tan', '正弦', '余弦', '図形', '計量', '面積'],
    topicLabel: '三角比・正弦定理・余弦定理',
    prerequisites: [
      {
        id: 'pre-ch4-special-tri',
        title: '特別な直角三角形の辺の比（30°・60°・90° / 45°・45°・90°）',
        grade: '中学3年（三平方の定理）',
        summary:
          '三角比（sin, cos, tan）がわからないときの一番の原因はここ！中学で習った2種類の三角定規の辺の比を頭の中で描ければ、30°・45°・60°の三角比は暗記不要で一瞬で出せます。',
        formula: '30°, 60°, 90° ⇒ 1 : 2 : √3（斜辺が2） / 45°, 45°, 90° ⇒ 1 : 1 : √2（斜辺が√2）',
        miniCheck: {
          question: '30°・60°・90° の直角三角形で、斜辺の長さが 6 のとき、30°の向かいの辺の長さは？',
          choices: ['3', '3√3', '3√2', '6√3'],
          answer: '3',
          explanation:
            '辺の比は 1 : 2 : √3 で斜辺が「2」、30°の向かいが「1」なので、6 ÷ 2 = 3 です。',
        },
      },
      {
        id: 'pre-ch4-pythagoras',
        title: '三平方の定理（直角三角形の3辺の関係）',
        grade: '中学3年',
        summary:
          '直角をはさむ2辺の2乗の和は斜辺の2乗に等しい。sin²θ + cos²θ = 1 や余弦定理の土台となる最重要定理です。',
        formula: 'a² + b² = c² （c が斜辺）',
        miniCheck: {
          question: '直角をはさむ2辺が 3 と 4 の直角三角形の斜辺の長さは？',
          choices: ['5', '7', '√7', '6'],
          answer: '5',
          explanation: '3² + 4² = 9 + 16 = 25 = 5² より斜辺は 5 です。',
        },
      },
      {
        id: 'pre-ch4-trig-def',
        title: '直角三角形における sin・cos・tan の定義（筆記体の覚え方）',
        grade: '数学Ⅰ 基礎',
        summary:
          '角θを左下、直角を右下に置いたとき、sin = 高さ/斜辺、cos = 底辺/斜辺、tan = 高さ/底辺 です。',
        formula: 'sinθ = 高さ/斜辺,  cosθ = 底辺/斜辺,  tanθ = 高さ/底辺',
        miniCheck: {
          question: '斜辺 5、底辺 4、高さ 3 の直角三角形で sinθ の値はどれ？',
          choices: ['3/5', '4/5', '3/4', '4/3'],
          answer: '3/5',
          explanation: 'sinθ = 高さ / 斜辺 = 3 / 5 です。',
        },
      },
    ],
  },

  // 第5章 データの分析
  {
    chapter: 5,
    keywords: ['データ', '代表値', '平均', '中央値', '四分位', '箱ひげ', '分散', '標準偏差', '相関'],
    topicLabel: 'データの分析（四分位数・分散・相関）',
    prerequisites: [
      {
        id: 'pre-ch5-median',
        title: '平均値・中央値（メジアン）・最頻値',
        grade: '中学1年',
        summary:
          '中央値や四分位数を求めるときは、必ず最初に「データを小さい順に並べ替える」のが鉄則です。',
        formula: '平均値 = 合計 ÷ 個数 / 中央値 = 小さい順に並べた真ん中の値',
        miniCheck: {
          question: 'データ [7, 2, 9, 4, 5] の中央値はどれ？',
          choices: ['5', '9', '5.4', '4'],
          answer: '5',
          explanation:
            '小さい順に並べると [2, 4, 5, 7, 9] なので、真ん中の 5 が中央値です。',
        },
      },
      {
        id: 'pre-ch5-deviation',
        title: '偏差（平均との差）と2乗の平均',
        grade: '数学Ⅰ 基礎',
        summary:
          '分散は「平均からどれくらい散らばっているか」を表す指標で、（各値 − 平均値）を2乗してから平均をとります。',
        formula: '分散 s² = (偏差の2乗の和) ÷ 個数、 標準偏差 s = √(分散)',
        miniCheck: {
          question: '分散が 9 のとき、標準偏差はいくら？',
          choices: ['3', '81', '4.5', '9'],
          answer: '3',
          explanation: '標準偏差は分散の正の平方根なので √9 = 3 です。',
        },
      },
    ],
  },
];

/**
 * Find the most relevant prerequisite chain for a given chapter and topic string.
 */
export function findPrerequisitesForTopic(
  chapter: number,
  topicText: string
): TopicPrerequisiteChain {
  const lower = (topicText || '').toLowerCase();
  // First try exact chapter + keyword match
  const sameChapter = MATH1_PREREQUISITE_CHAINS.filter(
    (c) => c.chapter === chapter
  );
  for (const chain of sameChapter) {
    if (chain.keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
      return chain;
    }
  }
  // Try cross-chapter keyword match (e.g. student types "三角比" while in another tab)
  for (const chain of MATH1_PREREQUISITE_CHAINS) {
    if (chain.keywords.some((kw) => lower.includes(kw.toLowerCase()))) {
      return chain;
    }
  }
  return sameChapter[0] ?? MATH1_PREREQUISITE_CHAINS[0];
}

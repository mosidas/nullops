/**
 * 6 パネル同時稼働時のフレーム間隔を数値で見るための計測器。
 *
 * requestAnimationFrame のループを 1 本へ共有するかを実測で決めるために置く。
 * 目視に頼らず数値で判定するための唯一の手段であり、判定の基準は
 * 「いずれかのパネルの p95 が 20 ms を継続して超えるか」である。
 *
 * 仕様の所在（docs/specs/001-dashboard-mvp 配下）:
 * - 計測器そのものと判定基準: 004-metrics-panels/spec.md §5.9・§9
 * - 実行時の有効化と window.nullops の口: 005-framestats-runtime/spec.md §5・§7
 * 以下のコメントで節番号だけを書く箇所は、断りが無ければ 004 の spec.md を指す。
 */

/** 報告を出す周期（ミリ秒）。 */
const frameReportInterval = 5000;

/**
 * パネルごとに貯めるフレーム間隔の個数の上限。
 *
 * 60 Hz で 10 秒ぶん。頭打ちにするのは、計測器自身が長時間の稼働で
 * メモリを食い潰さないため（spec.md §5.9）。
 */
const frameSampleCap = 600;

/** p95 を取る位置。60 Hz で 1 枚落ちが常態化していないかを見る（spec.md §9.3）。 */
const P95 = 0.95;

/** パネル 1 つぶんの計測状態。 */
type PanelStats = {
  /** 直前に recordFrame が呼ばれた時刻。まだ 1 度も呼ばれていなければ 0。 */
  last: number;
  /** フレーム間隔（ミリ秒）。新しい側から frameSampleCap 個まで保つ。 */
  samples: number[];
};

/**
 * 計測が有効かどうか。既定は無効（005-framestats-runtime spec.md 受け入れ基準 1.1〜1.3）。
 *
 * ビルド種別（process.env.NODE_ENV）で分岐しない。判定したいのは配布ビルドの
 * フレーム間隔であり、開発ビルドは React Strict Mode の二重描画と最小化なしの
 * JS のぶんだけ悪い値が出て判断材料にならないため、配布ビルドでも有効に
 * できる必要がある。分岐を残さないのは、開発ビルドで確かめた手順が
 * そのまま配布ビルドで通るようにするため。
 */
let enabled = false;

/**
 * パネル名ごとの計測状態。
 *
 * モジュールの寿命で持つのは、計測対象が 6 つのパネルに跨がり、
 * どのコンポーネントにも属さないため。
 */
const stats = new Map<string, PanelStats>();

/** 最後に報告を出した時刻。0 は「まだ 1 度も出していない」。 */
let lastReportAt = 0;

/**
 * フレームを 1 枚記録する。各パネルの requestAnimationFrame のコールバック先頭で呼ぶ。
 *
 * いつ・何回呼んでもよい（事前条件を持たない）。例外を投げない。
 */
export function recordFrame(panel: string, now: number): void {
  if (!enabled || !Number.isFinite(now)) {
    return;
  }

  let entry = stats.get(panel);
  if (entry === undefined) {
    entry = { last: 0, samples: [] };
    stats.set(panel, entry);
  }

  if (entry.last !== 0) {
    const delta = now - entry.last;
    // 負や 0 の差分は捨てる。時刻が巻き戻る環境で平均を壊さないため。
    if (delta > 0) {
      entry.samples.push(delta);
      if (entry.samples.length > frameSampleCap) {
        // 古い側から捨てる。直近の frameSampleCap 個だけを見るため。
        entry.samples.shift();
      }
    }
  }
  entry.last = now;

  if (lastReportAt === 0) {
    lastReportAt = now;
    return;
  }
  if (now - lastReportAt >= frameReportInterval) {
    lastReportAt = now;
    // 判定は人間がコンソールで読む（spec.md §9.2）。擬似ダッシュボードの
    // 画面には出さない。
    console.info(frameReport());
  }
}

/**
 * パネルごとの計測フレーム数・平均・p95・最大（いずれもミリ秒）を 1 行にまとめる。
 *
 * 005-framestats-runtime spec.md §5.1 が公開 API として宣言する 3 関数の 1 つ。
 * DevTools のコンソールから 5 秒の周期を待たずに読む経路は、この export ではなく
 * 末尾で window.nullops へ載せる同名のプロパティが担う（バンドル後のモジュール
 * スコープはコンソールから触れないため）。
 */
export function frameReport(): string {
  if (!enabled) {
    return '[framestats] disabled';
  }
  if (stats.size === 0) {
    return '[framestats] no samples';
  }

  const parts: string[] = [];
  // パネル名で並べるのは、報告の行ごとに列の順序が入れ替わると
  // 人間が 6 行を見比べられないため。
  for (const panel of [...stats.keys()].sort()) {
    const samples = stats.get(panel)?.samples ?? [];
    if (samples.length === 0) {
      parts.push(`${panel} n=0`);
      continue;
    }
    // p95 と max のために並べ替える。元の配列を壊さないよう複製する。
    const sorted = [...samples].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, v) => acc + v, 0);
    const mean = sum / sorted.length;
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * P95))];
    const max = sorted[sorted.length - 1];
    parts.push(`${panel} n=${sorted.length} mean=${mean.toFixed(1)} p95=${p95.toFixed(1)} max=${max.toFixed(1)}`);
  }
  return `[framestats] ${parts.join(' | ')}`;
}

/**
 * 計測の有効・無効を切り替える（005-framestats-runtime spec.md §5.1）。
 *
 * 無効にするときに標本と報告の時刻を捨てるのは、無効だった区間を跨いだ
 * 間隔が次の測定に混じると mean と max が壊れるため。有効化のたびに
 * 測り直すほうが p95 > 20 ms という判定の意味がはっきりする。
 */
export function setFrameStatsEnabled(next: boolean): void {
  if (next === enabled) {
    return;
  }
  enabled = next;
  stats.clear();
  lastReportAt = 0;
}

/**
 * DevTools のコンソールから計測を操作するための口（005-framestats-runtime spec.md §5.2）。
 *
 * 配布ビルドのウィンドウにはアドレスバーが無く URL のクエリを打てない。
 * localStorage のフラグはリロードを要するうえ次回の起動にも残り、
 * 「何もしなければ計測は動かない」を破る。報告の読み先がそもそも
 * コンソールなので、有効化も同じ場所で完結させる。
 */
type NullopsConsoleApi = {
  enableFrameStats(): void;
  disableFrameStats(): void;
  frameReport(): string;
};

declare global {
  interface Window {
    nullops?: Partial<NullopsConsoleApi>;
  }
}

/** 有効化したことを人間がコンソールで確かめられるよう、戻り値ではなく 1 行を出す。 */
function enableFrameStatsFromConsole(): void {
  setFrameStatsEnabled(true);
  console.info('[framestats] enabled');
}

function disableFrameStatsFromConsole(): void {
  setFrameStatsEnabled(false);
  console.info('[framestats] disabled');
}

// サーバ側の描画では window が無い。既存の window.nullops を丸ごと置き換えず
// プロパティだけを足すのは、同じ名前空間に先客がいた場合にそれを壊さないため。
if (typeof window !== 'undefined') {
  const api: Partial<NullopsConsoleApi> = window.nullops ?? {};
  api.enableFrameStats = enableFrameStatsFromConsole;
  api.disableFrameStats = disableFrameStatsFromConsole;
  api.frameReport = frameReport;
  window.nullops = api;
}

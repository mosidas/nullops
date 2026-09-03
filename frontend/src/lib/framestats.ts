/**
 * 6 パネル同時稼働時のフレーム間隔を数値で見るための計測器（spec.md §5.9・§9）。
 *
 * requestAnimationFrame のループを 1 本へ共有するかを実測で決めるために置く。
 * 目視に頼らず数値で判定するための唯一の手段であり、判定の基準は
 * 「いずれかのパネルの p95 が 20 ms を継続して超えるか」である（spec.md §9.3）。
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
 * 計測が有効かどうか。
 *
 * 配布ビルドへ計測の負荷を持ち込まないため、production では無効にする
 * （受け入れ基準 12.5）。モジュールの読み込み時に 1 度だけ判定するのは、
 * 毎フレーム process.env を読まないため。
 */
const enabled = process.env.NODE_ENV !== 'production';

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
 * export するのは、5 秒の周期を待たずに DevTools のコンソールから
 * 任意の時点で読めるようにするため（spec.md §5.9）。
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

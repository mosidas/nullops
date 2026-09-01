import { Snapshot } from '../../wailsjs/go/main/App';
import type { main } from '../../wailsjs/go/models';
import { EventsOn } from '../../wailsjs/runtime/runtime';

/** ログフィードのイベント名。Go 側の `logEventName` と対になる。 */
const LOG_EVENT = 'nullops:log';

/**
 * ログ行の差分イベントを購読する。戻り値を呼ぶとこの購読だけが解除される。
 *
 * 解除に「イベント名に紐づく全リスナーを外す」側の API を使わないのは、
 * 同じイベントを購読する他のパネルの購読まで切れるため（spec.md §5.5）。
 */
export function subscribeLog(onBatch: (lines: main.LogLine[]) => void): () => void {
  // EventsOn のコールバックは可変長で届く。Go 側は EventsEmit へ payload を
  // 1 個だけ渡すため、受け取るのは data[0] の []LogLine である。
  return EventsOn(LOG_EVENT, (...data: unknown[]) => {
    const lines = data[0];
    if (!Array.isArray(lines)) {
      // 擬似ダッシュボードに本物のエラーを出さない（spec.md §8）。異常はコンソールに留める。
      console.error(`${LOG_EVENT} のペイロードが配列ではない:`, lines);
      return;
    }
    onBatch(lines as main.LogLine[]);
  });
}

/** 点群フィードのイベント名。Go 側の `scatterEventName` と対になる。 */
const SCATTER_EVENT = 'nullops:scatter';

/** payload が点群の形をしているかを絞り込む。`any` を使わず `unknown` から検査する。 */
function isScatterCloud(value: unknown): value is main.ScatterCloud {
  return typeof value === 'object' && value !== null && Array.isArray((value as { points?: unknown }).points);
}

/**
 * 点群の更新イベントを購読する。戻り値を呼ぶとこの購読だけが解除される。
 *
 * subscribeLog と同じく、イベント名に紐づく全リスナーを外す側の API を使わない
 * （spec.md §5.4）。
 */
export function subscribeScatter(onCloud: (cloud: main.ScatterCloud) => void): () => void {
  // Go 側は EventsEmit へ payload を 1 個だけ渡すため、受け取るのは data[0] の ScatterCloud。
  return EventsOn(SCATTER_EVENT, (...data: unknown[]) => {
    const cloud = data[0];
    if (!isScatterCloud(cloud)) {
      // 擬似ダッシュボードに本物のエラーを出さない（spec.md §5.4）。異常はコンソールに留める。
      console.error(`${SCATTER_EVENT} のペイロードが点群の形ではない:`, cloud);
      return;
    }
    onCloud(cloud);
  });
}

/**
 * 起動直後の初期表示を 1 回で取得する。副作用は無く、いつ・何回呼んでもよい。
 *
 * WebView の初期化直後は reject しうる。呼び出し側が握って 0 行で開始する
 * （spec.md §5.6）。
 */
export function loadSnapshot(): Promise<main.DashboardSnapshot> {
  return Snapshot();
}

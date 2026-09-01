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

/**
 * 起動直後の初期表示を 1 回で取得する。副作用は無く、いつ・何回呼んでもよい。
 *
 * WebView の初期化直後は reject しうる。呼び出し側が握って 0 行で開始する
 * （spec.md §5.6）。
 */
export function loadSnapshot(): Promise<main.DashboardSnapshot> {
  return Snapshot();
}

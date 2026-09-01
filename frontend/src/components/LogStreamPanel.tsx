'use client';

import { useEffect, useState } from 'react';
import type { main } from '../../wailsjs/go/models';
import { loadSnapshot, subscribeLog } from '../lib/feed';

// 表示行数の上限。古い行から捨てる（spec.md §7 Requirement 2.6）。
const MAX_LINES = 300;

/**
 * Seq の昇順で併合し、同一 Seq を 1 行だけ残す。
 *
 * 購読とスナップショットは時間の窓が重なるため（購読を先に始めてから
 * スナップショットを取る）、同じ行が両方に現れうる。Seq は Go 側が
 * 1 から 1 ずつ採番する一意な番号なので、これを鍵に重複を落とす。
 * 併合の結果は新しい順ではなく古い順のまま MAX_LINES 行へ切り詰める。
 */
function mergeBySeq(base: readonly main.LogLine[], incoming: readonly main.LogLine[]): main.LogLine[] {
  const bySeq = new Map<number, main.LogLine>();
  for (const line of base) {
    bySeq.set(line.seq, line);
  }
  for (const line of incoming) {
    bySeq.set(line.seq, line);
  }
  const merged = Array.from(bySeq.values()).sort(compareSeq);
  // 先頭（古い側）を落とす。表示は末尾へ追加され続けるため、上限を超えた分は
  // 画面の外にある古い行である。
  return merged.length > MAX_LINES ? merged.slice(merged.length - MAX_LINES) : merged;
}

// 再描画のたびに比較関数を作り直さないため、モジュールの定数として持つ。
function compareSeq(a: main.LogLine, b: main.LogLine): number {
  return a.seq - b.seq;
}

// map へ毎回新しい関数を渡さないため、モジュールの定数として持つ
// （CLAUDE.md TypeScript 規約。行の追加は 1 秒に数回起きる）。
function renderLine(line: main.LogLine): React.JSX.Element {
  return (
    <li key={line.seq}>
      {line.tool} {line.text}
    </li>
  );
}

/** 擬似ログの流れを表示する。マウント中だけ購読する。 */
export function LogStreamPanel(): React.JSX.Element {
  const [lines, setLines] = useState<main.LogLine[]>([]);

  useEffect(() => {
    // スナップショットより先に購読を始めるのは、取得中に届いた行を落とさないため。
    // 先に取得すると、取得の完了と購読の開始のあいだに送られた行が失われる。
    const unsubscribe = subscribeLog((batch) => {
      setLines((prev) => mergeBySeq(prev, batch));
    });

    loadSnapshot().then((snapshot) => {
      setLines((prev) => mergeBySeq(snapshot.log, prev));
    });

    return unsubscribe;
  }, []);

  return <ol>{lines.map(renderLine)}</ol>;
}

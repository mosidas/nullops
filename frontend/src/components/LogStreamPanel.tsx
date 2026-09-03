'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { main } from '../../wailsjs/go/models';
import { loadSnapshot, subscribeLog } from '../lib/feed';

// このパネルだけ framestats の recordFrame を呼ばない。描画が DOM と React の
// 再描画で進み requestAnimationFrame のループを持たないため、記録できるのは
// フレーム間隔ではなくログイベントの到着間隔（数百ミリ秒）になる。それを
// 同じ報告へ混ぜると p95 20 ms の判定基準（spec.md §9.3）が常に不合格を指し、
// 判断の材料を壊す。このパネルが主スレッドを占める影響は、同じスレッドで回る
// 他 5 パネルのフレーム間隔の悪化として現れるので取りこぼさない。

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

// 下端から何ピクセル以内なら「追従中」と見なすか（spec.md §7 Requirement 2.7）。
// 0 にしないのは、行の高さの端数やズーム倍率で scrollTop が下端ちょうどに
// ならないことがあり、追従が外れて止まって見えるため。
const FOLLOW_THRESHOLD_PX = 16;

// 重大度ごとの文字色。トークンの正本は globals.css の @theme で、ここには色の直値を書かない
// （spec.md §6.6）。クラス名を文字列連結で組み立てないのは、Tailwind が原文から
// クラス名を拾うため、動的に作った名前が出力に含まれないため。
const LEVEL_CLASS: Record<string, string> = {
  info: 'text-level-info',
  warn: 'text-level-warn',
  error: 'text-level-error',
  debug: 'text-level-debug',
};

// 未知の重大度は本文と同じ色にする。画面にエラーを出さない（spec.md §8）。
const LEVEL_CLASS_FALLBACK = 'text-text-dim';

// 時刻の表記。行ごとに Intl のインスタンスを作らないため、モジュールの定数として持つ。
const TIME_FORMAT = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

// map へ毎回新しい関数を渡さないため、モジュールの定数として持つ
// （CLAUDE.md TypeScript 規約。行の追加は 1 秒に数回起きる）。
function renderLine(line: main.LogLine): React.JSX.Element {
  return (
    // 各列を固定幅にするのは、列の左端を行によらず揃えるため（spec.md §3 前提 4）。
    // tabular-nums は等幅数字を選び、時刻の桁が動くのを防ぐ。
    // 本文を折り返すのは、1 行が長いときに枠へ横スクロールを出さないため。
    <li key={line.seq} className="flex gap-2 font-mono text-xs leading-5">
      <span className="w-20 shrink-0 tabular-nums text-text-dim">{TIME_FORMAT.format(line.atMs)}</span>
      <span className="w-16 shrink-0 truncate text-text-dim">{line.tool}</span>
      <span className={`w-12 shrink-0 ${LEVEL_CLASS[line.level] ?? LEVEL_CLASS_FALLBACK}`}>{line.level}</span>
      <span className="min-w-0 whitespace-pre-wrap break-all text-text">{line.text}</span>
    </li>
  );
}

/** 擬似ログの流れを表示する。マウント中だけ購読する。 */
export function LogStreamPanel(): React.JSX.Element {
  const [lines, setLines] = useState<main.LogLine[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  // 追従するかどうかは描画に影響しないため state にしない。state にすると
  // スクロールのたびに再描画が起き、行の追加より高い頻度で走る。
  const followingRef = useRef(true);

  useEffect(() => {
    // スナップショットより先に購読を始めるのは、取得中に届いた行を落とさないため。
    // 先に取得すると、取得の完了と購読の開始のあいだに送られた行が失われる。
    const unsubscribe = subscribeLog((batch) => {
      setLines((prev) => mergeBySeq(prev, batch));
    });

    loadSnapshot()
      .then((snapshot) => {
        setLines((prev) => mergeBySeq(snapshot.log, prev));
      })
      .catch((reason: unknown) => {
        // 画面にエラーを出さず 0 行で開始する。以後の差分イベントで表示は埋まる
        // （spec.md §5.6）。擬似ダッシュボードに本物のエラー表示を出すと、
        // 実在の障害と見分けがつかなくなるため。
        console.error('初期スナップショットの取得に失敗した。0 行で開始する:', reason);
      });

    return unsubscribe;
  }, []);

  // 依存に lines.length ではなく末尾の Seq を使うのは、表示が上限の 300 行に達すると
  // 行が増えても length が変わらなくなり、そこから追従が止まるため。
  const lastSeq = lines.length === 0 ? 0 : lines[lines.length - 1].seq;

  // 行が増えた後の描画で位置を合わせる。useEffect ではなく useLayoutEffect を使うのは、
  // 描画後・ブラウザの描画前に scrollTop を書き、追従が 1 フレーム遅れて見えるのを避けるため。
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el === null || lastSeq === 0 || !followingRef.current) {
      return;
    }
    el.scrollTop = el.scrollHeight;
  }, [lastSeq]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (el === null) {
      return;
    }
    // 追従の再開も同じ判定で行う。下端付近まで戻せば自動で追従へ戻る。
    followingRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= FOLLOW_THRESHOLD_PX;
  }, []);

  return (
    // 枠の内側だけを縦にスクロールさせる。高さを枠いっぱいに固定するため、
    // Panel 側のスクロール領域は溢れず、ページ全体にはスクロールバーが出ない。
    <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-y-auto">
      <ol>{lines.map(renderLine)}</ol>
    </div>
  );
}

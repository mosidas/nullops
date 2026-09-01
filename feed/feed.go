// Package feed は擬似データ生成器を各自の間隔で回し、フロントエンドへ送る駆動機構を提供する。
//
// Wails に依存しない。GUI を起動せずにテストできるよう、フロントエンドへの送信は
// Emitter インターフェース越しに行い、実装は呼び出し側から受け取る。
package feed

import "time"

// Source は擬似データ生成器の拡張点。
//
// 実装は Next の呼び出しで panic しない。擬似データの生成は外部入力を読まないため、
// 失敗しうる経路を持たず error を返さない。
type Source interface {
	// EventName はフロントエンドへ送るイベント名を返す。プロセスの生存期間中つねに同じ値を返す。
	EventName() string
	// Interval は次の生成までの待ち時間を返す。1 ミリ秒以上を返す。
	Interval() time.Duration
	// Next は 1 フレーム分の値を返す。nil を返さず、encoding/json でシリアライズできる。
	Next() any
}

// Emitter は 1 フレームをフロントエンドへ送る手段。
//
// feed パッケージを Wails から切り離す境界であり、利用側であるこのパッケージで定義する
// (CLAUDE.md「インターフェースは実装側ではなく利用側のパッケージで定義する」)。
type Emitter interface {
	// Emit は payload を eventName のイベントとして送る。
	//
	// eventName は空文字でなく、payload は nil でない。送信は非同期でよく、
	// 購読者が居なければ捨てられるため到達保証は無い。エラーを返さない。
	Emit(eventName string, payload any)
}

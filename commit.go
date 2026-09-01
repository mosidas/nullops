package main

import (
	"errors"
	"strings"
)

// commitMaxLanes はコミットグラフのレーン(描画の列)の数。
//
// レーン 0 が主線で、分岐は 1 以上のレーンへ載る。枠 1 つの幅で列が読み取れる
// 上限として置く。生成器は空きレーンが無いとき分岐しないため、この値が
// Lane の上界になる(spec.md §6.2)。
const commitMaxLanes = 4

// commitIDLength は擬似ハッシュの桁数。実物の短縮ハッシュに倣う。
const commitIDLength = 7

// Commit は擬似コミット履歴の 1 件。Lane は描画の列で、0 が主線。
//
// 公開フィールドは Wails のバインディングで JSON 化するために必要だが、
// 値の生成は newCommit に限る。
type Commit struct {
	Seq  uint64 `json:"seq"`
	ID   string `json:"id"`   // 7 桁の小文字 16 進(擬似ハッシュ)
	Lane int    `json:"lane"` // 描画の列。0 が主線
	// Parents は親コミットの Seq。nil にならない(JSON 化して null にしないため)。
	// 長さ 0 は根(Seq が 1)のときに限り、2 はマージを表す。
	Parents []uint64 `json:"parents"`
	Branch  string   `json:"branch"`
	Summary string   `json:"summary"` // 画面へ出す英語の 1 行要約
}

// 不変条件の違反。
//
// 単一の error に束ねないのは、呼び出し側とテストが errors.Is で
// どの不変条件を破ったかを特定できるようにするため。
var (
	errCommitSeqZero     = errors.New("Commit の Seq は 1 以上でなければならない")
	errCommitIDFormat    = errors.New("Commit の ID は 7 桁の小文字 16 進でなければならない")
	errCommitLaneRange   = errors.New("Commit の Lane は 0 以上 commitMaxLanes 未満でなければならない")
	errCommitParents     = errors.New("Commit の Parents は 0〜2 個で、各要素が自身より小さい 1 以上の Seq を重複なく指し、長さ 0 は根に限る")
	errCommitTextEmpty   = errors.New("Commit の Branch と Summary は 1 文字以上でなければならない")
	errCommitTextNewline = errors.New("Commit の Branch と Summary は改行文字 (U+000A・U+000D) を含んではならない")
)

// newCommit は不変条件を満たす Commit だけを作る。
//
// レーンの割り当てと親の選択は commitSource の責務であり、ここでは検査だけを行う
// (spec.md §6.1)。割り当てをここへ寄せると、生成器の分岐・マージの不具合が
// 黙って握り潰される。
//
// parents は複製して取り込む。呼び出し側が生成後にスライスを書き換えても
// Commit の不変条件が崩れないようにするため(spec.md §7 受け入れ基準 2.6)。
func newCommit(seq uint64, id string, lane int, parents []uint64, branch, summary string) (Commit, error) {
	if seq == 0 {
		return Commit{}, errCommitSeqZero
	}
	if !validCommitID(id) {
		return Commit{}, errCommitIDFormat
	}
	if lane < 0 || lane >= commitMaxLanes {
		return Commit{}, errCommitLaneRange
	}
	if err := validateParents(seq, parents); err != nil {
		return Commit{}, err
	}
	if branch == "" || summary == "" {
		return Commit{}, errCommitTextEmpty
	}
	if strings.ContainsAny(branch, "\n\r") || strings.ContainsAny(summary, "\n\r") {
		return Commit{}, errCommitTextNewline
	}

	// 長さ 0 でも nil にしない。JSON 化して null になると、フロントエンドが
	// 根のコミットだけ配列以外を受け取ることになる。
	owned := make([]uint64, len(parents))
	copy(owned, parents)

	return Commit{
		Seq:     seq,
		ID:      id,
		Lane:    lane,
		Parents: owned,
		Branch:  branch,
		Summary: summary,
	}, nil
}

// validCommitID は ID がちょうど commitIDLength 桁の小文字 16 進かを返す。
//
// 正規表現を使わないのは、生成のたびに評価される検査であり、
// 桁数と文字種の 2 条件を直に見るほうが読みやすいため。
func validCommitID(id string) bool {
	if len(id) != commitIDLength {
		return false
	}
	for _, r := range id {
		if (r < '0' || r > '9') && (r < 'a' || r > 'f') {
			return false
		}
	}
	return true
}

// validateParents は親の並びが不変条件を満たすかを検査する。
//
// 「自身より小さい Seq を指す」を要求するのは、履歴が未来を指す辺を持たない
// (閉路を作らない)ようにするため。
func validateParents(seq uint64, parents []uint64) error {
	if len(parents) > 2 {
		return errCommitParents
	}
	if len(parents) == 0 && seq != 1 {
		// 根以外に孤立したコミットを作らない(spec.md §7 受け入れ基準 3.5)。
		return errCommitParents
	}
	for i, p := range parents {
		if p == 0 || p >= seq {
			return errCommitParents
		}
		// 2 要素までのため、線形の重複検査で足りる。
		for _, q := range parents[:i] {
			if p == q {
				return errCommitParents
			}
		}
	}
	return nil
}

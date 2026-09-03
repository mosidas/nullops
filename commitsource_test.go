package main

import (
	"math/rand"
	"sync"
	"testing"
	"time"
)

// newTestCommitSource は種を固定した生成器を作る。テストを再現可能にするため。
func newTestCommitSource(t *testing.T, capacity int) *commitSource {
	t.Helper()
	return newCommitSource(capacity, rand.New(rand.NewSource(1)))
}

// nextCommit は Next の戻り値を []Commit として取り出す。
//
// feed.Source が any を返す契約のため、テスト側で毎回書く型断言をここへ寄せる。
func nextCommit(t *testing.T, s *commitSource) Commit {
	t.Helper()
	batch, ok := s.Next().([]Commit)
	if !ok {
		t.Fatalf("Next の戻り値が []Commit でない")
	}
	// 受け入れ基準 1.3: 長さはつねに 1。
	if len(batch) != 1 {
		t.Fatalf("Next の戻り値の長さが 1 でない: %d", len(batch))
	}
	return batch[0]
}

// 受け入れ基準 1.1: EventName はつねに "nullops:commit"。
func TestCommitSourceEventName(t *testing.T) {
	s := newTestCommitSource(t, 8)
	for range 3 {
		if got := s.EventName(); got != "nullops:commit" {
			t.Fatalf("EventName が期待と異なる: %q", got)
		}
		s.Next()
	}
}

// 受け入れ基準 1.2・12.2: Interval はつねに 1500 ミリ秒(毎秒 1 回以下)。
func TestCommitSourceInterval(t *testing.T) {
	s := newTestCommitSource(t, 8)
	for range 3 {
		got := s.Interval()
		if got != 1500*time.Millisecond {
			t.Fatalf("Interval が期待と異なる: %v", got)
		}
		if got < time.Second {
			t.Fatalf("送出間隔が毎秒 1 回を超えている: %v", got)
		}
		s.Next()
	}
}

// 受け入れ基準 1.3・1.4: 長さ 1 の []Commit を返し、Seq が 1 ずつ増える。
func TestCommitSourceNextSeq(t *testing.T) {
	s := newTestCommitSource(t, 32)
	for i := uint64(1); i <= 10; i++ {
		if got := nextCommit(t, s).Seq; got != i {
			t.Fatalf("%d 回目の Seq が期待と異なる: %d", i, got)
		}
	}
}

// 受け入れ基準 1.5: 事前条件を破った newCommitSource は panic する。
func TestNewCommitSourcePanics(t *testing.T) {
	tests := map[string]struct {
		capacity int
		rnd      *rand.Rand
	}{
		"capacity が 0": {capacity: 0, rnd: rand.New(rand.NewSource(1))},
		"capacity が負":  {capacity: -1, rnd: rand.New(rand.NewSource(1))},
		"rnd が nil":    {capacity: 8, rnd: nil},
	}
	for name, tt := range tests {
		t.Run(name, func(t *testing.T) {
			defer func() {
				if recover() == nil {
					t.Fatalf("panic しなかった")
				}
			}()
			newCommitSource(tt.capacity, tt.rnd)
		})
	}
}

// 受け入れ基準 1.6: Next と Snapshot の並行呼び出しでデータ競合を起こさない。
//
// go test -race で走らせたときに意味を持つ。
func TestCommitSourceConcurrentAccess(t *testing.T) {
	s := newTestCommitSource(t, 16)

	var wg sync.WaitGroup
	for range 4 {
		wg.Add(2)
		go func() {
			defer wg.Done()
			for range 50 {
				s.Next()
			}
		}()
		go func() {
			defer wg.Done()
			for range 50 {
				s.Snapshot()
			}
		}()
	}
	wg.Wait()
}

// 受け入れ基準 1.7: 保持件数は capacity を超えない。
func TestCommitSourceCapacity(t *testing.T) {
	const capacity = 5
	s := newTestCommitSource(t, capacity)
	for range capacity * 4 {
		s.Next()
	}
	if got := len(s.Snapshot()); got != capacity {
		t.Fatalf("保持件数が capacity と異なる: %d", got)
	}
}

// 受け入れ基準 1.8: Snapshot は Seq の昇順で、内部と別の配列を返す。
func TestCommitSourceSnapshotOrderAndIsolation(t *testing.T) {
	s := newTestCommitSource(t, 32)
	for range 10 {
		s.Next()
	}

	got := s.Snapshot()
	for i := 1; i < len(got); i++ {
		if got[i-1].Seq >= got[i].Seq {
			t.Fatalf("Seq の昇順になっていない: %d の次が %d", got[i-1].Seq, got[i].Seq)
		}
	}

	// 返した配列を書き換えても次の Snapshot へ波及しない。
	got[0].Summary = "書き換え"
	again := s.Snapshot()
	if again[0].Summary == "書き換え" {
		t.Fatalf("Snapshot が内部の配列を共有している")
	}
}

// 受け入れ基準 1.7・1.8: 上限を超えた後は最古が捨てられ、新しい側が残る。
func TestCommitSourceDropsOldest(t *testing.T) {
	const capacity = 4
	s := newTestCommitSource(t, capacity)
	for range 12 {
		s.Next()
	}
	got := s.Snapshot()
	if got[0].Seq != 9 || got[len(got)-1].Seq != 12 {
		t.Fatalf("保持している範囲が期待と異なる: %d〜%d", got[0].Seq, got[len(got)-1].Seq)
	}
}

// 受け入れ基準 2.4・2.5・3.1〜3.5: 1000 回連続で生成しても
// レーン・親・分岐・マージの不変条件を保つ。
//
// 分岐とマージは確率で起きるため、1 本の連続生成でまとめて観測する。
func TestCommitSourceInvariantsOverManyFrames(t *testing.T) {
	const frames = 1000
	s := newTestCommitSource(t, frames)

	seen := make(map[uint64]Commit, frames)
	branched := false
	merged := false

	for i := range frames {
		c := nextCommit(t, s)

		// 2.4: Lane はつねに 0 以上 commitMaxLanes 未満。
		if c.Lane < 0 || c.Lane >= commitMaxLanes {
			t.Fatalf("Lane が範囲外: %d", c.Lane)
		}
		// 2.5: 親は既出かつ自身より小さい Seq を指す。
		for _, p := range c.Parents {
			if p >= c.Seq {
				t.Fatalf("Seq %d の親 %d が自身以上を指している", c.Seq, p)
			}
			if _, ok := seen[p]; !ok {
				t.Fatalf("Seq %d の親 %d が既出でない", c.Seq, p)
			}
		}

		switch {
		case i == 0:
			// 3.4: 根は親を持たずレーン 0。
			if len(c.Parents) != 0 || c.Lane != 0 {
				t.Fatalf("根が期待と異なる: Lane=%d Parents=%v", c.Lane, c.Parents)
			}
		default:
			// 3.5: 根以外は必ず親を持つ。
			if len(c.Parents) == 0 {
				t.Fatalf("Seq %d が親を持たない", c.Seq)
			}
		}

		if c.Lane > 0 {
			branched = true
		}
		if len(c.Parents) == 2 {
			merged = true
			// 3.3: マージは主線へ置く。
			if c.Lane != 0 {
				t.Fatalf("マージコミットのレーンが 0 でない: %d", c.Lane)
			}
		}

		seen[c.Seq] = c
	}

	// 3.1・3.2: 1000 回のあいだに分岐とマージがそれぞれ 1 回以上起きる。
	if !branched {
		t.Fatalf("%d 回のあいだに分岐が 1 度も起きなかった", frames)
	}
	if !merged {
		t.Fatalf("%d 回のあいだにマージが 1 度も起きなかった", frames)
	}
}

// 受け入れ基準 2.4・3.1〜3.5: 種を変えても不変条件が保たれる。
//
// 上のテストは種 1 の 1 本の履歴しか見ない。分岐とマージの規則が特定の
// 乱数列にだけ依存していないことを、複数の種で確かめる。
func TestCommitSourceInvariantsAcrossSeeds(t *testing.T) {
	for seed := int64(1); seed <= 20; seed++ {
		s := newCommitSource(400, rand.New(rand.NewSource(seed)))
		branched := false
		merged := false
		for range 400 {
			c := nextCommit(t, s)
			if c.Lane < 0 || c.Lane >= commitMaxLanes {
				t.Fatalf("seed %d: Lane が範囲外: %d", seed, c.Lane)
			}
			if c.Lane > 0 {
				branched = true
			}
			if len(c.Parents) == 2 {
				merged = true
			}
		}
		if !branched || !merged {
			t.Fatalf("seed %d: 分岐=%v マージ=%v(いずれも起きること)", seed, branched, merged)
		}
	}
}

// 受け入れ基準 2.1: 生成される ID はちょうど 7 桁の小文字 16 進。
//
// newCommit の検査を通っているが、生成器が実際にその書式で作っていることを
// 別に押さえる(検査を通す値だけを作れているか)。
func TestCommitSourceIDFormat(t *testing.T) {
	s := newTestCommitSource(t, 64)
	for range 64 {
		id := nextCommit(t, s).ID
		if !validCommitID(id) {
			t.Fatalf("ID の書式が期待と異なる: %q", id)
		}
	}
}

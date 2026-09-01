package main

import (
	"errors"
	"testing"
)

// validCommitArgs は不変条件を満たす newCommit の引数一式。
// 各テストは 1 項目だけを崩して、その項目の検査を確かめる。
func validCommitArgs() (uint64, string, int, []uint64, string, string) {
	return 12, "a1b2c3d", 1, []uint64{11}, "feat/ingest-retry", "add exponential backoff to the ingest worker"
}

func TestNewCommitKeepsArguments(t *testing.T) {
	seq, id, lane, parents, branch, summary := validCommitArgs()

	c, err := newCommit(seq, id, lane, parents, branch, summary)
	if err != nil {
		t.Fatalf("newCommit が error を返した: %v", err)
	}
	if c.Seq != seq || c.ID != id || c.Lane != lane || c.Branch != branch || c.Summary != summary {
		t.Errorf("引数が反映されていない: %+v", c)
	}
	if len(c.Parents) != 1 || c.Parents[0] != 11 {
		t.Errorf("Parents が反映されていない: %v", c.Parents)
	}
}

// 受け入れ基準 2.1: ID はちょうど 7 文字の小文字 16 進。
func TestNewCommitIDFormat(t *testing.T) {
	tests := map[string]struct {
		id      string
		wantErr bool
	}{
		"7 桁の小文字 16 進":  {id: "0f9e8d7", wantErr: false},
		"数字のみ":          {id: "0123456", wantErr: false},
		"6 桁":           {id: "0f9e8d", wantErr: true},
		"8 桁":           {id: "0f9e8d7c", wantErr: true},
		"空文字":           {id: "", wantErr: true},
		"大文字を含む":       {id: "0F9E8D7", wantErr: true},
		"16 進でない文字を含む": {id: "0f9e8dz", wantErr: true},
	}

	for name, tc := range tests {
		t.Run(name, func(t *testing.T) {
			seq, _, lane, parents, branch, summary := validCommitArgs()
			_, err := newCommit(seq, tc.id, lane, parents, branch, summary)
			if tc.wantErr {
				if !errors.Is(err, errCommitIDFormat) {
					t.Errorf("errCommitIDFormat を期待したが %v", err)
				}
				return
			}
			if err != nil {
				t.Errorf("error を期待していないが %v", err)
			}
		})
	}
}

// 受け入れ基準 2.2: Seq の 0・Lane の範囲外・Branch / Summary の空文字と改行。
func TestNewCommitInvariantViolation(t *testing.T) {
	tests := map[string]struct {
		mutate  func(*uint64, *int, *string, *string)
		wantErr error
	}{
		"Seq が 0": {
			mutate:  func(seq *uint64, _ *int, _ *string, _ *string) { *seq = 0 },
			wantErr: errCommitSeqZero,
		},
		"Lane が負": {
			mutate:  func(_ *uint64, lane *int, _ *string, _ *string) { *lane = -1 },
			wantErr: errCommitLaneRange,
		},
		"Lane が上限ちょうど": {
			mutate:  func(_ *uint64, lane *int, _ *string, _ *string) { *lane = commitMaxLanes },
			wantErr: errCommitLaneRange,
		},
		"Branch が空文字": {
			mutate:  func(_ *uint64, _ *int, branch *string, _ *string) { *branch = "" },
			wantErr: errCommitTextEmpty,
		},
		"Summary が空文字": {
			mutate:  func(_ *uint64, _ *int, _ *string, summary *string) { *summary = "" },
			wantErr: errCommitTextEmpty,
		},
		"Branch が改行を含む": {
			mutate:  func(_ *uint64, _ *int, branch *string, _ *string) { *branch = "feat/a\nb" },
			wantErr: errCommitTextNewline,
		},
		"Summary が復帰を含む": {
			mutate:  func(_ *uint64, _ *int, _ *string, summary *string) { *summary = "fix\rthing" },
			wantErr: errCommitTextNewline,
		},
	}

	for name, tc := range tests {
		t.Run(name, func(t *testing.T) {
			seq, id, lane, parents, branch, summary := validCommitArgs()
			tc.mutate(&seq, &lane, &branch, &summary)

			_, err := newCommit(seq, id, lane, parents, branch, summary)
			if !errors.Is(err, tc.wantErr) {
				t.Errorf("%v を期待したが %v", tc.wantErr, err)
			}
		})
	}
}

// 受け入れ基準 2.3: Parents の異常。
func TestNewCommitParentsInvariant(t *testing.T) {
	tests := map[string]struct {
		seq     uint64
		parents []uint64
		wantErr bool
	}{
		"根は親なし":         {seq: 1, parents: nil, wantErr: false},
		"親 1 つ":         {seq: 5, parents: []uint64{4}, wantErr: false},
		"親 2 つ(マージ)":    {seq: 5, parents: []uint64{4, 2}, wantErr: false},
		"親 3 つ":         {seq: 5, parents: []uint64{4, 3, 2}, wantErr: true},
		"親に 0 を含む":      {seq: 5, parents: []uint64{0}, wantErr: true},
		"親が自身と同じ":       {seq: 5, parents: []uint64{5}, wantErr: true},
		"親が自身より大きい":     {seq: 5, parents: []uint64{6}, wantErr: true},
		"親が重複":          {seq: 5, parents: []uint64{4, 4}, wantErr: true},
		"根でないのに親が 0 個": {seq: 2, parents: []uint64{}, wantErr: true},
	}

	for name, tc := range tests {
		t.Run(name, func(t *testing.T) {
			_, err := newCommit(tc.seq, "a1b2c3d", 0, tc.parents, "main", "chore: bump lockfile")
			if tc.wantErr {
				if !errors.Is(err, errCommitParents) {
					t.Errorf("errCommitParents を期待したが %v", err)
				}
				return
			}
			if err != nil {
				t.Errorf("error を期待していないが %v", err)
			}
		})
	}
}

// 受け入れ基準 2.6: 渡した Parents スライスの生成後の書き換えが波及しない。
func TestNewCommitCopiesParents(t *testing.T) {
	parents := []uint64{11}

	c, err := newCommit(12, "a1b2c3d", 0, parents, "main", "chore: bump lockfile")
	if err != nil {
		t.Fatalf("newCommit が error を返した: %v", err)
	}

	parents[0] = 999
	if c.Parents[0] != 11 {
		t.Errorf("呼び出し側の書き換えが Commit へ波及した: %v", c.Parents)
	}
}

// 根の Parents も nil にしない。JSON 化して null になると、フロントエンドが
// 根のコミットだけ配列以外を受け取ることになる。
func TestNewCommitRootParentsIsEmptyNotNil(t *testing.T) {
	c, err := newCommit(1, "a1b2c3d", 0, nil, "main", "chore: initial commit")
	if err != nil {
		t.Fatalf("newCommit が error を返した: %v", err)
	}
	if c.Parents == nil {
		t.Error("Parents が nil である")
	}
	if len(c.Parents) != 0 {
		t.Errorf("Parents の長さが 0 でない: %v", c.Parents)
	}
}

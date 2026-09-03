package main

import (
	"math/rand"
	"sync"
	"time"
)

// commitEventName はコミットフィードのイベント名。
const commitEventName = "nullops:commit"

// commitInterval はコミットの送出間隔。
//
// ログ(80〜400 ms)より遅くするのは、擬似的な作業でもコミットは
// ビルドやテストより低い頻度で起きるためである。毎秒 1 回以下に
// 収めるという制約も満たす(spec.md §7 受け入れ基準 12.2)。
const commitInterval = 1500 * time.Millisecond

// 分岐とマージの起こりやすさ。
//
// 分岐をマージより低く置くのは、レーンが埋まって分岐できない状態が
// 続かないようにするためである。マージには最低寿命の条件も掛かるため、
// 実効の発生率はこの値より低くなる。
const (
	commitBranchChance = 0.16
	commitMergeChance  = 0.24
)

// commitMinLaneLife はマージの対象にできるまでにレーンが経るコミット数。
//
// 分岐した直後にマージすると、画面上で分岐とマージが 1 行の隙間もなく
// 並び、枝として読み取れないため。
const commitMinLaneLife = 3

// commitBranchNames は分岐で使うブランチ名の候補。
//
// 画面へ出すラベルは英語にする(CLAUDE.md 言語規約)。
var commitBranchNames = []string{
	"feat/ingest-retry",
	"feat/edge-cache",
	"fix/oauth-refresh",
	"fix/queue-deadlock",
	"perf/parquet-writer",
	"refactor/store-layer",
	"chore/bump-toolchain",
	"docs/runbook-rollout",
}

// commitSummaries は要約の候補。実物のコミットに倣い英語・命令形で書く。
var commitSummaries = []string{
	"add exponential backoff to the ingest worker",
	"drop the redundant index on events(created_at)",
	"cache negative lookups for 30s",
	"guard against a nil transport in the retry path",
	"split the writer into flush and encode stages",
	"stop leaking the scanner goroutine on cancel",
	"tighten the readiness probe timeout to 2s",
	"reuse the buffer pool across batches",
	"return 409 instead of 500 on a duplicate upload",
	"pin the toolchain to 1.25.3",
	"document the staged rollout procedure",
	"remove the unused feature flag plumbing",
}

// commitMergeSummaries はマージコミットの要約の候補。
var commitMergeSummaries = []string{
	"merge branch into main",
	"merge: resolve conflicts in the store layer",
	"merge: land the reviewed changes",
}

// appCommitCapacity は画面へ供給するコミットの保持件数。
//
// 枠に収まる行数(数十行)より多く持ち、ウィンドウを広げても履歴が
// 足りなくならない値にする。過不足は unit #4 の同時稼働の調整で見直す
// (spec.md §8)。
const appCommitCapacity = 120

// commitLane は 1 レーンの状態。
type commitLane struct {
	active   bool
	branch   string
	tipSeq   uint64 // このレーンで最後に積んだコミットの Seq
	startSeq uint64 // このレーンが分岐で開かれたときの Seq
}

// commitSource は分岐とマージを含む擬似コミット履歴を 1 件ずつ生成する
// feed.Source の実装。
//
// feed パッケージを import しないのは、feed から見て利用側である main が
// インターフェースを満たすだけでよく、import すると依存が逆向きになるため
// (logSource・scatterSource と同じ扱い)。
type commitSource struct {
	mu  sync.Mutex
	seq uint64

	lanes [commitMaxLanes]commitLane

	// 保持するコミットのリングバッファ。長さ capacity の固定長で確保し、
	// 上限に達した後は最古の位置を上書きする(logSource と同じ形)。
	buf   []Commit
	start int
	count int

	capacity int
	rnd      *rand.Rand
}

// newCommitSource はコミットフィードの生成器を作る。
//
// 事前条件は capacity が 1 以上、rnd が nil でないこと。
// 違反は呼び出し側の誤りであり、戻り値に error 経路を持たないため panic する。
// rnd は commitSource 専用のインスタンスを渡す。*rand.Rand は並行安全でなく、
// 他の生成器と共有すると互いの mutex では保護されない。
func newCommitSource(capacity int, rnd *rand.Rand) *commitSource {
	if capacity < 1 {
		panic("newCommitSource の capacity は 1 以上でなければならない")
	}
	if rnd == nil {
		panic("newCommitSource の rnd は nil であってはならない")
	}

	s := &commitSource{
		buf:      make([]Commit, capacity),
		capacity: capacity,
		rnd:      rnd,
	}
	// レーン 0 は主線。分岐で開かれるのではなく最初から存在する。
	s.lanes[0] = commitLane{active: true, branch: "main"}
	return s
}

// EventName はフロントエンドへ送るイベント名を返す。プロセスの生存期間中つねに同じ値。
func (s *commitSource) EventName() string { return commitEventName }

// Interval は次の送出までの待ち時間を返す。つねに commitInterval。
func (s *commitSource) Interval() time.Duration { return commitInterval }

// Next は長さ 1 の []Commit を返す。
//
// レーンと親の選択はこの関数の責務であり、newCommit へ渡す時点で不変条件は
// 満たされている。それでも error を握りつぶさず panic するのは、分岐や
// マージの規則を変えて不変条件が破れたときに気付けるようにするため
// (feed.Source は error 経路を持たない。logSource.Next と同じ規律)。
func (s *commitSource) Next() any {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.seq++
	lane, parents, branch, summary := s.plan()

	c, err := newCommit(s.seq, s.newID(), lane, parents, branch, summary)
	if err != nil {
		panic("commitSource が Commit の不変条件を破っている: " + err.Error())
	}

	s.lanes[lane].tipSeq = c.Seq
	s.push(c)
	return []Commit{c}
}

// plan は次の 1 件のレーン・親・ブランチ名・要約を決める。呼び出し側で mu を保持すること。
//
// s.seq は加算済みで渡ってくる。親はつねに s.seq 未満の既出のコミットを指す。
func (s *commitSource) plan() (lane int, parents []uint64, branch, summary string) {
	if s.seq == 1 {
		// 根。親を持たない唯一のコミット(spec.md §7 受け入れ基準 3.4)。
		return 0, nil, s.lanes[0].branch, "chore: initialise the pipeline skeleton"
	}

	if l, ok := s.pickMergeable(); ok && s.rnd.Float64() < commitMergeChance {
		// マージは主線へ置き、主線と枝の 2 つの先端を親に取る(受け入れ基準 3.3)。
		parents = []uint64{s.lanes[0].tipSeq, s.lanes[l].tipSeq}
		s.lanes[l] = commitLane{} // 枝を畳んでレーンを空ける
		return 0, parents, s.lanes[0].branch, pick(s.rnd, commitMergeSummaries)
	}

	if l, ok := s.pickFreeLane(); ok && s.rnd.Float64() < commitBranchChance {
		s.lanes[l] = commitLane{
			active:   true,
			branch:   pick(s.rnd, commitBranchNames),
			tipSeq:   s.lanes[0].tipSeq,
			startSeq: s.seq,
		}
		// 分岐の親は主線の先端 1 つ。
		return l, []uint64{s.lanes[0].tipSeq}, s.lanes[l].branch, pick(s.rnd, commitSummaries)
	}

	l := s.pickActiveLane()
	return l, []uint64{s.lanes[l].tipSeq}, s.lanes[l].branch, pick(s.rnd, commitSummaries)
}

// pickFreeLane は空きレーンを 1 つ返す。空きが無ければ ok が false。
//
// 空きが無いとき分岐しないことで、Lane が commitMaxLanes 未満に保たれる
// (spec.md §7 受け入れ基準 2.4)。
func (s *commitSource) pickFreeLane() (int, bool) {
	for i := 1; i < commitMaxLanes; i++ {
		if !s.lanes[i].active {
			return i, true
		}
	}
	return 0, false
}

// pickMergeable はマージの対象にできる非主線のレーンを 1 つ返す。
//
// commitMinLaneLife 件を経ていないレーンを除くのは、分岐の直後にマージして
// 枝として読み取れない図になるのを避けるため。
func (s *commitSource) pickMergeable() (int, bool) {
	for i := 1; i < commitMaxLanes; i++ {
		l := s.lanes[i]
		if l.active && s.seq-l.startSeq >= commitMinLaneLife {
			return i, true
		}
	}
	return 0, false
}

// pickActiveLane は active なレーンから 1 つ選ぶ。
//
// レーン 0 はつねに active であるため、少なくとも 1 つは見つかる。
func (s *commitSource) pickActiveLane() int {
	active := make([]int, 0, commitMaxLanes)
	for i := range s.lanes {
		if s.lanes[i].active {
			active = append(active, i)
		}
	}
	return active[s.rnd.Intn(len(active))]
}

// newID は擬似的な短縮ハッシュを作る。呼び出し側で mu を保持すること。
//
// 実在のハッシュではなく画面の見た目のための擬似値であり、衝突しても害はない
// (CLAUDE.md 注意事項: 画面に出る値はすべてこのアプリが生成した擬似データ)。
func (s *commitSource) newID() string {
	const hexDigits = "0123456789abcdef"
	id := make([]byte, commitIDLength)
	for i := range id {
		id[i] = hexDigits[s.rnd.Intn(len(hexDigits))]
	}
	return string(id)
}

// push は 1 件をリングバッファへ積む。上限に達していれば最古の 1 件を捨てる。
// 呼び出し側で mu を保持すること。
func (s *commitSource) push(c Commit) {
	if s.count == s.capacity {
		s.buf[s.start] = c
		s.start = (s.start + 1) % s.capacity
		return
	}
	s.buf[(s.start+s.count)%s.capacity] = c
	s.count++
}

// Snapshot は保持している全コミットを古い順に返す。
//
// 返すスライスは内部と別の配列であり、呼び出し側の変更は内部へ波及しない。
// 0 件でも nil でなく長さ 0 のスライスを返す(バインディング経由で JSON 化した
// ときに null にしないため)。内部状態は変化させない(spec.md §5.1)。
func (s *commitSource) Snapshot() []Commit {
	s.mu.Lock()
	defer s.mu.Unlock()

	out := make([]Commit, s.count)
	for i := range s.count {
		out[i] = s.buf[(s.start+i)%s.capacity]
	}
	return out
}

// pick は候補集合から 1 つ選ぶ。候補は空でないこと。
func pick(rnd *rand.Rand, candidates []string) string {
	return candidates[rnd.Intn(len(candidates))]
}

package main

import (
	"math/rand/v2"
	"sync"
	"time"
)

// logEventName はログフィードのイベント名。
const logEventName = "nullops:log"

// 送出間隔の範囲。
const (
	logMinInterval = 80 * time.Millisecond
	logMaxInterval = 400 * time.Millisecond
)

// logCandidate は 1 行分の素材。
//
// Tool と Text を対にして持つのは、工具名と語彙の組み合わせが
// 噛み合わない行（例: linter が "linking" と言う）を作れなくするため。
type logCandidate struct {
	tool  string
	level Level
	text  string
}

// logCandidates はフェーズごとの候補集合。
//
// 画面へ出す擬似ログは英語にする（CLAUDE.md 言語規約）。
// 語彙はフェーズごとに重ならないものを選び、フェーズの切り替わりが
// 画面から読み取れるようにしている。
var logCandidates = map[Phase][]logCandidate{
	PhaseBuild: {
		{tool: "cargo", level: LevelInfo, text: "Compiling serde_json v1.0.140"},
		{tool: "cargo", level: LevelInfo, text: "Compiling tokio v1.45.1"},
		{tool: "go", level: LevelInfo, text: "build github.com/nullops/pipeline/internal/store"},
		{tool: "tsc", level: LevelInfo, text: "emitting dist/index.d.ts"},
		{tool: "webpack", level: LevelInfo, text: "asset main.js 412 KiB [emitted] (name: main)"},
		{tool: "cc", level: LevelDebug, text: "-O2 -fPIC -Wall -c src/codec/frame.c"},
		{tool: "ld", level: LevelDebug, text: "resolving 1284 relocations in libcodec.a"},
		{tool: "cargo", level: LevelWarn, text: "unused variable: `retries` at src/worker.rs:212"},
		{tool: "tsc", level: LevelWarn, text: "'AudioBuffer' is declared but its value is never read"},
		{tool: "make", level: LevelError, text: "recipe for target 'bindings' failed, retrying (1/3)"},
	},
	PhaseTest: {
		{tool: "pytest", level: LevelInfo, text: "tests/test_router.py ........... [ 62%]"},
		{tool: "go test", level: LevelInfo, text: "ok  github.com/nullops/pipeline/queue  0.412s"},
		{tool: "vitest", level: LevelInfo, text: "src/hooks/useFeed.test.ts (14 tests) 233ms"},
		{tool: "jest", level: LevelInfo, text: "PASS packages/core/src/reducer.spec.ts"},
		{tool: "coverage", level: LevelDebug, text: "statements 91.4% branches 84.2% lines 90.8%"},
		{tool: "go test", level: LevelDebug, text: "fuzz: elapsed 12s, execs 84210 (7017/sec)"},
		{tool: "pytest", level: LevelWarn, text: "DeprecationWarning: datetime.utcnow() is deprecated"},
		{tool: "vitest", level: LevelWarn, text: "flaky: retrying 'reconnects after socket drop' (2/3)"},
		{tool: "go test", level: LevelError, text: "--- FAIL: TestBackoffJitter (0.03s)"},
		{tool: "jest", level: LevelError, text: "expected 204, received 500 at api/upload.spec.ts:88"},
	},
	PhaseDeploy: {
		{tool: "kubectl", level: LevelInfo, text: "deployment.apps/ingest-worker configured"},
		{tool: "helm", level: LevelInfo, text: "upgrade complete: release nullops-edge revision 47"},
		{tool: "docker", level: LevelInfo, text: "pushed sha256:9f21c0a4 to registry/nullops/api:2.14.0"},
		{tool: "terraform", level: LevelInfo, text: "aws_lb_target_group.api: Modifications complete"},
		{tool: "kubectl", level: LevelDebug, text: "rollout status: 6 of 8 replicas updated"},
		{tool: "argocd", level: LevelDebug, text: "sync wave 2/4 applied, waiting for health"},
		{tool: "kubectl", level: LevelWarn, text: "pod ingest-worker-7d4c readiness probe failed (1/3)"},
		{tool: "terraform", level: LevelWarn, text: "resource drift detected on aws_security_group.edge"},
		{tool: "helm", level: LevelError, text: "release nullops-edge: timed out waiting for condition"},
		{tool: "docker", level: LevelError, text: "manifest for registry/nullops/api:latest not found"},
	},
	PhaseScan: {
		{tool: "trivy", level: LevelInfo, text: "scanned 412 packages, 0 critical findings"},
		{tool: "semgrep", level: LevelInfo, text: "ran 1180 rules over 2942 files in 18.3s"},
		{tool: "gitleaks", level: LevelInfo, text: "no leaks found in 1842 commits"},
		{tool: "govulncheck", level: LevelInfo, text: "no vulnerabilities found in reachable code"},
		{tool: "trivy", level: LevelDebug, text: "loading vulnerability database (schema 2, 214 MB)"},
		{tool: "semgrep", level: LevelDebug, text: "cache hit rate 78%, 642 files skipped"},
		{tool: "trivy", level: LevelWarn, text: "CVE-2025-40817 MEDIUM in libxml2 2.13.4"},
		{tool: "npm audit", level: LevelWarn, text: "3 moderate severity vulnerabilities in 1204 packages"},
		{tool: "govulncheck", level: LevelError, text: "GO-2025-3841 HIGH in golang.org/x/net/http2"},
		{tool: "gitleaks", level: LevelError, text: "aws-access-key detected in infra/staging.tfvars:14"},
	},
}

// logSource は擬似的なログ行を 1 行ずつ生成する feed.Source の実装。
//
// feed パッケージを import しないのは、feed から見て利用側である main が
// インターフェースを満たすだけでよく、import すると依存が逆向きになるため。
type logSource struct {
	mu  sync.Mutex
	seq uint64

	// 保持する行のリングバッファ。長さ capacity の固定長で確保し、
	// 上限に達した後は最古の位置を上書きする。先頭を捨てるスライス操作
	// (buf = buf[1:]) にしないのは、下地の配列が伸び続けるため。
	buf   []LogLine
	start int // 最古の行の位置
	count int // 保持件数

	capacity int
	rnd      *rand.Rand
	sc       *scenario
}

// newLogSource はログフィードの生成器を作る。
//
// 事前条件は capacity が 1 以上、rnd と sc が nil でないこと。
// 違反は呼び出し側の誤りであり、戻り値に error 経路を持たないため panic する。
// rnd は logSource 専用のインスタンスを渡す。*rand.Rand は並行安全でなく、
// scenario と共有すると互いの mutex では保護されない。
func newLogSource(capacity int, rnd *rand.Rand, sc *scenario) *logSource {
	if capacity < 1 {
		panic("newLogSource の capacity は 1 以上でなければならない")
	}
	if rnd == nil {
		panic("newLogSource の rnd は nil であってはならない")
	}
	if sc == nil {
		panic("newLogSource の sc は nil であってはならない")
	}

	return &logSource{
		buf:      make([]LogLine, capacity),
		capacity: capacity,
		rnd:      rnd,
		sc:       sc,
	}
}

// EventName はフロントエンドへ送るイベント名を返す。プロセスの生存期間中つねに同じ値。
func (s *logSource) EventName() string { return logEventName }

// Interval は次の送出までの待ち時間を返す。80〜400 ms の一様乱数。
func (s *logSource) Interval() time.Duration {
	s.mu.Lock()
	defer s.mu.Unlock()

	// 上限を含む閉区間にするため、半開区間の幅へ 1 を足す。
	return logMinInterval + time.Duration(s.rnd.Int64N(int64(logMaxInterval-logMinInterval)+1))
}

// Next は長さ 1 の []LogLine を返す。
//
// 候補集合は不変条件を満たすことをテストで検査しており、Seq も自身で採番するため
// newLogLine が error を返す状況は起こらない。それでも error を握りつぶさず
// panic するのは、候補集合の追加で不変条件が破れたときに気付けるようにするため
// （feed.Source は error 経路を持たない）。
func (s *logSource) Next() any {
	phase := s.sc.Current()

	s.mu.Lock()
	defer s.mu.Unlock()

	candidates := logCandidates[phase]
	c := candidates[s.rnd.IntN(len(candidates))]
	s.seq++

	line, err := newLogLine(s.seq, time.Now().UnixMilli(), c.tool, phase, c.level, c.text)
	if err != nil {
		panic("logSource の候補集合が LogLine の不変条件を破っている: " + err.Error())
	}

	s.push(line)
	return []LogLine{line}
}

// push は 1 行をリングバッファへ積む。上限に達していれば最古の 1 行を捨てる。
// 呼び出し側で mu を保持すること。
func (s *logSource) push(line LogLine) {
	if s.count == s.capacity {
		s.buf[s.start] = line
		s.start = (s.start + 1) % s.capacity
		return
	}
	s.buf[(s.start+s.count)%s.capacity] = line
	s.count++
}

// Snapshot は保持している全行を古い順に返す。
//
// 返すスライスは内部と別の配列であり、呼び出し側の変更は内部へ波及しない。
// 0 件でも nil でなく長さ 0 のスライスを返す（バインディング経由で JSON 化したとき
// null にしないため。spec.md §6.2）。
func (s *logSource) Snapshot() []LogLine {
	s.mu.Lock()
	defer s.mu.Unlock()

	out := make([]LogLine, s.count)
	for i := range s.count {
		out[i] = s.buf[(s.start+i)%s.capacity]
	}
	return out
}

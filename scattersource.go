package main

import (
	"math"
	"math/rand"
	"sync"
	"time"
)

// scatterEventName は点群フィードのイベント名。
const scatterEventName = "nullops:scatter"

// scatterInterval は点群の送出間隔。
//
// 回転の滑らかさをフロントエンドの requestAnimationFrame に任せるため、
// Go 側の送出は毎秒 1 回に抑える(spec.md Requirement 9.5)。
const scatterInterval = 1000 * time.Millisecond

// 画面へ供給する点数(spec.md §6.2)。
//
// 上限は 6 パネル同時稼働時の描画負荷の見積もり(§3 前提 2)、下限は
// 点群が「面」として見える密度(roadmap §1.1)。点数を動かすと画面の
// 情報量と描画負荷の両方が動くため、定数として固定しテストで範囲を固定する。
const (
	scatterPointCount    = 6000
	scatterPointCountMin = 2000
	scatterPointCountMax = 8192
)

// 位相の刻み。Next ごとに 1 段進み、120 段(= 送出間隔 1 秒 × 120 で 2 分)で 1 周する。
//
// 位相を float64 で累積せず段数で持つのは、121 回目の生成を 1 回目と
// ビット単位で一致させるため(spec.md Requirement 3.6)。
const (
	scatterPhaseSteps = 120
	scatterPhaseStep  = 2 * math.Pi / scatterPhaseSteps
)

// 地形の寸法(spec.md §6.3)。
const (
	terrainFloor     = -0.95 // 高さ場の床
	terrainTop       = 0.9   // 峰の重なりで超えた高さを切る天井
	terrainSpan      = 0.98  // (x, z) を置く範囲の半幅
	terrainPeakCount = 5
	terrainPeakSpan  = 0.7 // 峰の中心を置く範囲の半幅
)

// 球の寸法(spec.md §6.3)。
const (
	sphereCX, sphereCY, sphereCZ = 0.38, 0.15, -0.25
	sphereRadius                 = 0.28
)

// トーラスの寸法(spec.md §6.3)。環は XZ 平面に平行。
const (
	torusCX, torusCY, torusCZ = -0.25, -0.6, 0.2
	torusMajor                = 0.42
	torusMinor                = 0.1
)

// scatterPeak は地形の高さ場を作る峰 1 個。生成時に固定する。
type scatterPeak struct {
	px, pz float64 // 中心
	amp    float64 // 振幅 A
	sigma  float64 // 広がり σ
	theta  float64 // 呼吸の位相オフセット θ
}

// scatterPointParam は 1 点の所属する構造と、構造上の固定パラメータ。
//
// 座標は持たない。座標はパラメータと位相から毎フレーム計算する
// (乱歩させると形が崩れるため。spec.md §6.3)。
type scatterPointParam struct {
	structure uint8
	// 地形: a = x, b = z(小数第 4 位に丸めて持つ。出力の X・Z と一致させ、
	// テストが出力の座標から同じ高さを再計算できるようにするため)。
	// 球: (a, b, c) は単位方向ベクトル。
	// トーラス: a = u(環に沿う角)、b = v(管を回る角)。
	a, b, c float64
}

// scatterSource は擬似的な 3 次元の点群をフレーム単位で生成する feed.Source の実装。
//
// feed パッケージを import しないのは、feed から見て利用側である main が
// インターフェースを満たすだけでよく、import すると依存が逆向きになるため
// (logSource と同じ扱い)。
type scatterSource struct {
	mu  sync.Mutex
	seq uint64

	// phaseStep は次の Next が生成に使う位相の段数(0 以上 scatterPhaseSteps 未満)。
	phaseStep int

	peaks  [terrainPeakCount]scatterPeak
	params []scatterPointParam

	// last は最後に生成した点群。Snapshot はこの複製を返す。
	last ScatterCloud

	// rnd は生成時のパラメータの決定にだけ使う。Next では使わない。
	rnd *rand.Rand
}

// newScatterSource は点群の生成器を作る。
//
// 事前条件は pointCount が 1 以上、rnd が nil でないこと。
// 違反は呼び出し側の誤りであり、戻り値に error 経路を持たないため panic する。
// rnd は scatterSource 専用のインスタンスを渡す。*rand.Rand は並行安全でなく、
// 他の生成器と共有すると互いの mutex では保護されない。
//
// 点の並びは地形 → 球 → トーラスの順に固定する。地形の各点を Next をまたいで
// 同じ添字で照合できるようにするため(spec.md Requirement 3.4)。
func newScatterSource(pointCount int, rnd *rand.Rand) *scatterSource {
	if pointCount < 1 {
		panic("newScatterSource の pointCount は 1 以上でなければならない")
	}
	if rnd == nil {
		panic("newScatterSource の rnd は nil であってはならない")
	}

	s := &scatterSource{
		params: make([]scatterPointParam, 0, pointCount),
		last:   ScatterCloud{Points: []ScatterPoint{}},
		rnd:    rnd,
	}

	for k := range s.peaks {
		s.peaks[k] = scatterPeak{
			px:    symmetricUniform(rnd, terrainPeakSpan),
			pz:    symmetricUniform(rnd, terrainPeakSpan),
			amp:   0.6 + rnd.Float64()*1.2,
			sigma: 0.18 + rnd.Float64()*0.22,
			theta: rnd.Float64() * 2 * math.Pi,
		}
	}

	// 配分(spec.md §6.2): 球・トーラスは各 pointCount/6、地形は残り。
	sphereCount := pointCount / 6
	torusCount := pointCount / 6
	terrainCount := pointCount - sphereCount - torusCount

	for range terrainCount {
		s.params = append(s.params, scatterPointParam{
			structure: 0,
			a:         roundTo(symmetricUniform(rnd, terrainSpan), 1e4),
			b:         roundTo(symmetricUniform(rnd, terrainSpan), 1e4),
		})
	}
	for range sphereCount {
		// 正規分布 3 成分を正規化すると球面上で一様になる。
		dx, dy, dz := rnd.NormFloat64(), rnd.NormFloat64(), rnd.NormFloat64()
		n := math.Sqrt(dx*dx + dy*dy + dz*dz)
		if n == 0 {
			dx, dy, dz, n = 0, 1, 0, 1
		}
		s.params = append(s.params, scatterPointParam{structure: 1, a: dx / n, b: dy / n, c: dz / n})
	}
	for range torusCount {
		s.params = append(s.params, scatterPointParam{
			structure: 2,
			a:         rnd.Float64() * 2 * math.Pi,
			b:         rnd.Float64() * 2 * math.Pi,
		})
	}

	return s
}

// EventName はフロントエンドへ送るイベント名を返す。プロセスの生存期間中つねに同じ値。
func (s *scatterSource) EventName() string { return scatterEventName }

// Interval は次の送出までの待ち時間を返す。つねに scatterInterval。
func (s *scatterSource) Interval() time.Duration { return scatterInterval }

// Next は 1 フレーム分の点群を返す。
//
// 現在の位相で生成してから位相を 1 段進める(spec.md §5.1 事後条件)。
// 座標の切り詰めはこの関数の責務であり、newScatterPoint へ渡す時点で
// 不変条件は満たされている。それでも error を握りつぶさず panic するのは、
// 幾何を変えて不変条件が破れたときに気付けるようにするため
// (feed.Source は error 経路を持たない。logSource.Next と同じ規律)。
func (s *scatterSource) Next() any {
	s.mu.Lock()
	defer s.mu.Unlock()

	phase := float64(s.phaseStep) * scatterPhaseStep
	out := make([]ScatterPoint, len(s.params))
	for i, p := range s.params {
		x, y, z, c := s.locate(p, phase)
		sp, err := newScatterPoint(clampUnit(x), clampUnit(y), clampUnit(z), p.structure, c)
		if err != nil {
			panic("scatterSource が ScatterPoint の不変条件を破っている: " + err.Error())
		}
		out[i] = sp
	}

	s.phaseStep = (s.phaseStep + 1) % scatterPhaseSteps
	s.seq++
	s.last = ScatterCloud{Seq: s.seq, Points: out}
	return s.last
}

// locate は 1 点の座標と色値を、固定パラメータと位相から計算する(spec.md §6.3)。
func (s *scatterSource) locate(p scatterPointParam, phase float64) (x, y, z, c float64) {
	switch p.structure {
	case 1:
		// 方向ベクトルを Y 軸まわりに phase だけ回す。中心は動かさない。
		cos, sin := math.Cos(phase), math.Sin(phase)
		dx := p.a*cos + p.c*sin
		dz := -p.a*sin + p.c*cos
		x = sphereCX + dx*sphereRadius
		y = sphereCY + p.b*sphereRadius
		z = sphereCZ + dz*sphereRadius
		c = (p.b + 1) / 2 // 緯度。(y − cy + r) / 2r と同値
	case 2:
		ring := torusMajor + torusMinor*math.Cos(p.b)
		x = torusCX + ring*math.Cos(p.a)
		y = torusCY + torusMinor*math.Sin(p.b)
		z = torusCZ + ring*math.Sin(p.a)
		c = math.Mod(p.a+phase, 2*math.Pi) / (2 * math.Pi)
	default:
		x, z = p.a, p.b
		y = terrainHeight(s.peaks[:], x, z, phase)
		c = (y - terrainFloor) / (terrainTop - terrainFloor)
	}
	return x, y, z, c
}

// terrainHeight は地形の高さ場 h(x, z, φ) を返す(spec.md §6.3)。
//
// 各峰の振幅に sin(φ + θ) の呼吸を掛け、重なりで天井を超えた高さは天井で切る。
// scatterSource のメソッドでなく峰を引数に取るのは、テストが同じ式で
// 出力の座標から高さを再計算して照合するため。
func terrainHeight(peaks []scatterPeak, x, z, phase float64) float64 {
	h := terrainFloor
	for _, pk := range peaks {
		dx, dz := x-pk.px, z-pk.pz
		breath := 0.8 + 0.2*math.Sin(phase+pk.theta)
		h += pk.amp * breath * math.Exp(-(dx*dx+dz*dz)/(2*pk.sigma*pk.sigma))
	}
	return math.Min(h, terrainTop)
}

// Snapshot は最後に生成した点群の複製を返す。
//
// 内部状態を変化させない(spec.md §5.1)。1 度も Next を呼んでいない場合は
// Seq が 0・長さ 0 の非 nil スライスを持つ点群を返す。
func (s *scatterSource) Snapshot() ScatterCloud {
	s.mu.Lock()
	defer s.mu.Unlock()

	// 内部と別の配列を返す。呼び出し側の変更が次フレームの送出内容へ波及しないため。
	out := make([]ScatterPoint, len(s.last.Points))
	copy(out, s.last.Points)
	return ScatterCloud{Seq: s.last.Seq, Points: out}
}

// clampUnit は値を単位立方体の範囲 [-1, 1] へ収める。
//
// §6.3 の寸法は収まるように選んであり、切り詰めが効くのは丸め誤差だけである。
func clampUnit(v float64) float64 {
	if v < -1.0 {
		return -1.0
	}
	if v > 1.0 {
		return 1.0
	}
	return v
}

// symmetricUniform は [-span, span] の一様乱数を返す。
func symmetricUniform(rnd *rand.Rand, span float64) float64 {
	return (rnd.Float64()*2 - 1) * span
}

// drift は現在値を目標へ pull の割合だけ引き戻し、標準偏差 jitter の乱歩を足す。
//
// 点群は乱歩しなくなったが(spec.md §6.3)、graphsource がノードの漂いに使うため残す。
func drift(rnd *rand.Rand, current, target, pull, jitter float64) float64 {
	return current + (target-current)*pull + rnd.NormFloat64()*jitter
}

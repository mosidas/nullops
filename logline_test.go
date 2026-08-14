package main

import (
	"encoding/json"
	"testing"
)

func TestNewLogLine(t *testing.T) {
	t.Run("不変条件を満たす引数から、全フィールドが引数どおりの LogLine を作る", func(t *testing.T) {
		got, err := newLogLine(1, 1_700_000_000_000, "cargo", PhaseBuild, LevelInfo, "Compiling serde v1.0.219")
		if err != nil {
			t.Fatalf("error を返した: %v", err)
		}

		want := LogLine{
			Seq:   1,
			AtMs:  1_700_000_000_000,
			Tool:  "cargo",
			Phase: PhaseBuild,
			Level: LevelInfo,
			Text:  "Compiling serde v1.0.219",
		}
		if got != want {
			t.Errorf("生成された LogLine が一致しない: got %+v, want %+v", got, want)
		}
	})

	t.Run("定義済みの Level をすべて受け付ける", func(t *testing.T) {
		levels := []Level{LevelInfo, LevelWarn, LevelError, LevelDebug}
		for _, level := range levels {
			got, err := newLogLine(1, 0, "go", PhaseTest, level, "ok nullops 0.412s")
			if err != nil {
				t.Errorf("Level %q で error を返した: %v", level, err)
				continue
			}
			if got.Level != level {
				t.Errorf("Level が保持されない: got %q, want %q", got.Level, level)
			}
		}
	})

	t.Run("定義済みの Phase をすべて受け付ける", func(t *testing.T) {
		phases := []Phase{PhaseBuild, PhaseTest, PhaseDeploy, PhaseScan}
		for _, phase := range phases {
			got, err := newLogLine(1, 0, "kubectl", phase, LevelInfo, "deployment.apps/nullops configured")
			if err != nil {
				t.Errorf("Phase %q で error を返した: %v", phase, err)
				continue
			}
			if got.Phase != phase {
				t.Errorf("Phase が保持されない: got %q, want %q", got.Phase, phase)
			}
		}
	})
}

func TestLevelAndPhaseValues(t *testing.T) {
	levels := map[Level]string{
		LevelInfo:  "info",
		LevelWarn:  "warn",
		LevelError: "error",
		LevelDebug: "debug",
	}
	for level, want := range levels {
		if string(level) != want {
			t.Errorf("Level の値が一致しない: got %q, want %q", string(level), want)
		}
	}

	phases := map[Phase]string{
		PhaseBuild:  "build",
		PhaseTest:   "test",
		PhaseDeploy: "deploy",
		PhaseScan:   "scan",
	}
	for phase, want := range phases {
		if string(phase) != want {
			t.Errorf("Phase の値が一致しない: got %q, want %q", string(phase), want)
		}
	}
}

func TestLogLineJSON(t *testing.T) {
	line, err := newLogLine(42, 1_700_000_000_123, "npm", PhaseScan, LevelWarn, "found 3 moderate severity vulnerabilities")
	if err != nil {
		t.Fatalf("error を返した: %v", err)
	}

	encoded, err := json.Marshal(line)
	if err != nil {
		t.Fatalf("JSON 化に失敗した: %v", err)
	}

	want := `{"seq":42,"atMs":1700000000123,"tool":"npm","phase":"scan","level":"warn","text":"found 3 moderate severity vulnerabilities"}`
	if string(encoded) != want {
		t.Errorf("JSON 表現が一致しない:\n got %s\nwant %s", encoded, want)
	}
}

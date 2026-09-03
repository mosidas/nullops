import { CommitGraphPanel } from '../components/CommitGraphPanel';
import { DashboardGrid } from '../components/DashboardGrid';
import { DependencyGraphPanel } from '../components/DependencyGraphPanel';
import { GaugePanel } from '../components/GaugePanel';
import { LogStreamPanel } from '../components/LogStreamPanel';
import { Panel } from '../components/Panel';
import { Scatter3DPanel } from '../components/Scatter3DPanel';
import { TimeseriesPanel } from '../components/TimeseriesPanel';

// 再描画のたびに配列を作り直さないため、モジュールの定数として持つ。
// 並び順は grid の自動配置の順序（1 行目 左→右、2 行目 左→右）と対応する。
const LOG_STREAM_TITLE = 'Log Stream';
const COMMIT_GRAPH_TITLE = 'Commit Graph';
const DEPENDENCY_GRAPH_TITLE = 'Dependency Graph';
const SCATTER_3D_TITLE = 'Scatter 3D';
const TIMESERIES_TITLE = 'Timeseries';
const UTILIZATION_TITLE = 'Utilization';
// 並びは README「画面」表の 6 行と 1 対 1 に対応する（受け入れ基準 11.4）。
const PANEL_TITLES = [
  LOG_STREAM_TITLE,
  COMMIT_GRAPH_TITLE,
  TIMESERIES_TITLE,
  DEPENDENCY_GRAPH_TITLE,
  UTILIZATION_TITLE,
  SCATTER_3D_TITLE,
];

/**
 * 枠の題名から本文を選ぶ。
 *
 * 6 枠すべてが実装済みのパネルへ結び付き、'pending' のプレースホルダは
 * 残っていない（受け入れ基準 11.2）。既定の枝は PANEL_TITLES に無い題名を
 * 渡された場合の保険であり、通常は到達しない。
 */
function panelBody(title: string): React.ReactNode {
  if (title === LOG_STREAM_TITLE) {
    return <LogStreamPanel />;
  }
  if (title === COMMIT_GRAPH_TITLE) {
    return <CommitGraphPanel />;
  }
  if (title === DEPENDENCY_GRAPH_TITLE) {
    return <DependencyGraphPanel />;
  }
  if (title === SCATTER_3D_TITLE) {
    return <Scatter3DPanel />;
  }
  if (title === TIMESERIES_TITLE) {
    return <TimeseriesPanel />;
  }
  if (title === UTILIZATION_TITLE) {
    return <GaugePanel />;
  }
  return 'pending';
}

export default function Home(): React.JSX.Element {
  return (
    <DashboardGrid>
      {PANEL_TITLES.map((title) => (
        <Panel key={title} title={title}>
          {/* 'use client' は葉のパネル側に置く。ここへ広げると DashboardGrid の
              個数検査が Strict Mode で 2 回走り、受け入れ基準 1.4 を破る。 */}
          {panelBody(title)}
        </Panel>
      ))}
    </DashboardGrid>
  );
}

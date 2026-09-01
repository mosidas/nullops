import { DashboardGrid } from '../components/DashboardGrid';
import { LogStreamPanel } from '../components/LogStreamPanel';
import { Panel } from '../components/Panel';

// 再描画のたびに配列を作り直さないため、モジュールの定数として持つ。
// 並び順は grid の自動配置の順序（1 行目 左→右、2 行目 左→右）と対応する。
const LOG_STREAM_TITLE = 'Log Stream';
const PANEL_TITLES = [LOG_STREAM_TITLE, 'Commit Graph', 'Timeseries', 'Dependency Graph', 'Utilization', 'Scatter 3D'];

export default function Home(): React.JSX.Element {
  return (
    <DashboardGrid>
      {PANEL_TITLES.map((title) => (
        <Panel key={title} title={title}>
          {/* 'use client' は LogStreamPanel 側に置く。ここへ広げると DashboardGrid の
              個数検査が Strict Mode で 2 回走り、受け入れ基準 1.4 を破る。 */}
          {title === LOG_STREAM_TITLE ? <LogStreamPanel /> : 'pending'}
        </Panel>
      ))}
    </DashboardGrid>
  );
}

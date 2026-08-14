import { DashboardGrid } from '../components/DashboardGrid';
import { Panel } from '../components/Panel';

// 再描画のたびに配列を作り直さないため、モジュールの定数として持つ。
// 並び順は grid の自動配置の順序（1 行目 左→右、2 行目 左→右）と対応する。
const PANEL_TITLES = ['Log Stream', 'Commit Graph', 'Timeseries', 'Dependency Graph', 'Utilization', 'Scatter 3D'];

export default function Home(): React.JSX.Element {
  return (
    <DashboardGrid>
      {PANEL_TITLES.map((title) => (
        <Panel key={title} title={title}>
          pending
        </Panel>
      ))}
    </DashboardGrid>
  );
}

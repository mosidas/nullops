import { CommitGraphPanel } from '../components/CommitGraphPanel';
import { DashboardGrid, type DashboardSlot } from '../components/DashboardGrid';
import { DependencyGraphPanel } from '../components/DependencyGraphPanel';
import { GaugePanel } from '../components/GaugePanel';
import { LogStreamPanel } from '../components/LogStreamPanel';
import { Scatter3DPanel } from '../components/Scatter3DPanel';
import { TimeseriesPanel } from '../components/TimeseriesPanel';

// slot と本文の対応だけを持つ。配置(列・行)は DashboardGrid と Panel が受け持つ。
// 再描画のたびに要素を作り直さないため、モジュールの定数として持つ。
const PANELS: Readonly<Record<DashboardSlot, React.ReactElement>> = {
  timeseries: <TimeseriesPanel />,
  gauge: <GaugePanel />,
  log: <LogStreamPanel />,
  scatter: <Scatter3DPanel />,
  depgraph: <DependencyGraphPanel />,
  commit: <CommitGraphPanel />,
};

export default function Home(): React.JSX.Element {
  return <DashboardGrid panels={PANELS} />;
}

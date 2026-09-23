'use client';

import * as echarts from 'echarts/core';
import {
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  HeatmapChart,
  TreemapChart,
  FunnelChart,
  SankeyChart,
  SunburstChart
} from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapComponent,
  DatasetComponent,
  TitleComponent,
  ToolboxComponent
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { BRAND_SERIES } from './chartTheme';

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  HeatmapChart,
  TreemapChart,
  FunnelChart,
  SankeyChart,
  SunburstChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  VisualMapComponent,
  DatasetComponent,
  TitleComponent,
  ToolboxComponent,
  CanvasRenderer
]);

echarts.registerTheme('jubilant', {
  color: BRAND_SERIES,
  backgroundColor: 'transparent',
  textStyle: { fontFamily: 'Inter, sans-serif', color: '#142033' },
  title: { textStyle: { color: '#142033', fontWeight: 600 } },
  legend: { textStyle: { color: '#142033' } }
});

export { echarts };
export const ECHARTS_THEME = 'jubilant';

'use client';

import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react/lib/core';
import { echarts, ECHARTS_THEME } from '../../lib/echartsSetup';
import { usePrintMode } from '../../lib/printCharts';
import ChartEmpty from './ChartEmpty';

function printLabel(value) {
  const n = Number(Array.isArray(value) ? value[value.length - 1] : value);
  return Number.isFinite(n) && n !== 0 ? n.toLocaleString('en-IN') : '';
}

function withPrintLabels(option) {
  if (!option) return option;
  const seriesList = Array.isArray(option.series) ? option.series : option.series ? [option.series] : [];
  const yCat = Array.isArray(option.yAxis)
    ? option.yAxis.some((ax) => ax?.type === 'category')
    : option.yAxis?.type === 'category';
  const series = seriesList.map((s) => {
    if (!s) return s;
    const type = s.type;
    if (type === 'scatter' || type === 'sankey') return s;
    const label = {
      show: true,
      color: '#142033',
      fontSize: 10,
      fontWeight: 600,
      formatter: (p) => {
        if (type === 'heatmap') {
          const v = Array.isArray(p.value) ? p.value[2] : p.value;
          return printLabel(v);
        }
        if (type === 'treemap' || type === 'sunburst' || type === 'pie' || type === 'funnel') {
          const n = printLabel(p.value);
          return n ? `${p.name}\n${n}` : p.name;
        }
        return printLabel(p.value);
      }
    };
    if (type === 'bar') {
      label.position = yCat ? 'right' : 'top';
    }
    if (type === 'line') {
      label.position = 'top';
    }
    return { ...s, label: { ...(s.label || {}), ...label }, labelLayout: { hideOverlap: true } };
  });
  const grid = option.grid
    ? (Array.isArray(option.grid)
      ? option.grid.map((g) => ({ ...g, top: Math.max(Number(g?.top) || 0, 36), right: Math.max(Number(g?.right) || 0, 28), containLabel: true }))
      : { ...option.grid, top: Math.max(Number(option.grid.top) || 0, 36), right: Math.max(Number(option.grid.right) || 0, 28), containLabel: true })
    : option.grid;
  return { ...option, animation: false, series, grid };
}

function hasData(option) {
  if (!option) return false;
  const series = Array.isArray(option.series) ? option.series : option.series ? [option.series] : [];
  if (!series.length) return false;
  return series.some((s) => {
      const data = s?.data;
      if (Array.isArray(s.links) && s.links.some((l) => Number(l.value) > 0)) return true;
      if (!Array.isArray(data) || data.length === 0) return false;
      return data.some((d) => {
        if (d == null) return false;
        if (typeof d === 'number') return Number.isFinite(d);
        if (Array.isArray(d)) return d.some((v, i) => i === 2 ? Number(v) > 0 : v != null);
        if (typeof d === 'object') {
          if (Number(d.value) > 0) return true;
          if (Array.isArray(d.children) && d.children.length > 0) return true;
          if (d.name != null) return true;
        }
        return false;
      });
  });
}

function withFocus(option, focus) {
  if (!option) return option;
  const next = { ...option, animationDuration: 380, animationDurationUpdate: 380 };
  if (!focus?.length) return next;
  const cats = next.yAxis?.data || next.xAxis?.data || [];
  const hit = (name) => focus.some((f) => String(f).toLowerCase() === String(name || '').toLowerCase());
  const series = (Array.isArray(next.series) ? next.series : next.series ? [next.series] : []).map((s) => {
    if (!Array.isArray(s?.data)) return s;
    return {
      ...s,
      data: s.data.map((d, i) => {
        const name = (d && typeof d === 'object' && d.name != null) ? d.name : cats[i];
        const opacity = !name || hit(name) ? 1 : 0.22;
        if (d && typeof d === 'object' && !Array.isArray(d)) {
          return { ...d, itemStyle: { ...(d.itemStyle || {}), opacity } };
        }
        return { value: d, itemStyle: { opacity } };
      })
    };
  });
  return { ...next, series };
}

export default function EChart({ option, height = 340, caption, notMerge = true, onPoint, focus = [] }) {
  const printing = usePrintMode();
  const painted = useMemo(() => {
    const focused = withFocus(option, focus);
    return printing ? withPrintLabels(focused) : focused;
  }, [option, focus, printing]);
  const ready = useMemo(() => hasData(option), [option]);
  const onEvents = useMemo(() => {
    if (!onPoint) return undefined;
    return {
      click: (params) => {
        if (!params) return;
        onPoint({
          name: params.name != null ? String(params.name) : '',
          seriesName: params.seriesName,
          seriesType: params.seriesType,
          value: params.value,
          dataIndex: params.dataIndex,
          data: params.data,
          nativeEvent: params.event?.event
        });
      }
    };
  }, [onPoint]);
  if (!ready) return <ChartEmpty caption={caption} />;

  return (
    <div className="chart-wrap" style={onPoint ? { cursor: 'pointer' } : undefined}>
      <ReactECharts
        echarts={echarts}
        option={painted}
        theme={ECHARTS_THEME}
        notMerge={notMerge}
        lazyUpdate
        style={{
          height: printing && Number(height) > 820 ? 820 : height,
          width: '100%'
        }}
        opts={{ renderer: 'canvas' }}
        onEvents={onEvents}
      />
      {caption && <p className="chart-caption">{caption}</p>}
    </div>
  );
}

export function treemapOption(items, { name = 'Count' } = {}) {
  const data = (items || [])
    .map((r) => ({ name: String(r.label ?? r.name ?? 'Unknown'), value: Number(r.value) || 0 }))
    .filter((r) => r.value > 0);
  return {
    tooltip: { trigger: 'item', renderMode: 'richText' },
    series: [{
      type: 'treemap',
      name,
      roam: false,
      nodeClick: false,
      breadcrumb: { show: false },
      label: { show: true, formatter: '{b}\n{c}' },
      data
    }]
  };
}

export function comboLineBarOption(labels, { bar, line, barName = 'Added this year', lineName = 'Running total', dualAxis = false } = {}) {
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'cross' }, renderMode: 'richText' },
    legend: { bottom: 0 },
    grid: { left: 8, right: dualAxis ? 48 : 16, top: 24, bottom: 48, outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' },
    xAxis: { type: 'category', data: labels },
    yAxis: dualAxis
      ? [
          { type: 'value', name: barName, axisLabel: { formatter: (v) => Number(v).toLocaleString('en-IN') } },
          { type: 'value', name: lineName, axisLabel: { formatter: (v) => Number(v).toLocaleString('en-IN') } }
        ]
      : { type: 'value', axisLabel: { formatter: (v) => Number(v).toLocaleString('en-IN') } },
    series: [
      {
        type: 'bar',
        name: barName,
        data: bar || [],
        barMaxWidth: 36,
        emphasis: { focus: 'series' }
      },
      {
        type: 'line',
        name: lineName,
        data: line || [],
        yAxisIndex: dualAxis ? 1 : 0,
        smooth: false,
        symbol: 'circle',
        symbolSize: 8
      }
    ]
  };
}

export function doughnutOption(items) {
  const data = (items || [])
    .map((r) => ({ name: String(r.label ?? r.name ?? 'Unknown'), value: Number(r.value) || 0 }))
    .filter((r) => r.value > 0);
  return {
    tooltip: { trigger: 'item', renderMode: 'richText' },
    legend: { type: 'scroll', orient: 'vertical', right: 0, top: 'middle' },
    series: [{
      type: 'pie',
      radius: ['48%', '72%'],
      center: ['38%', '50%'],
      data
    }]
  };
}

export function lineAreaOption(labels, values, { name = '', rupee = false } = {}) {
  const fmt = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return '';
    return rupee ? `₹${n.toLocaleString('en-IN')}` : n.toLocaleString('en-IN');
  };
  return {
    tooltip: { trigger: 'axis', renderMode: 'richText', valueFormatter: fmt },
    legend: name ? { bottom: 0 } : { show: false },
    grid: { left: 8, right: 16, top: 24, bottom: name ? 48 : 28, outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' },
    xAxis: { type: 'category', data: labels || [] },
    yAxis: { type: 'value', axisLabel: { formatter: fmt } },
    series: [{
      type: 'line',
      name: name || 'Value',
      data: values || [],
      smooth: 0.3,
      symbol: 'circle',
      symbolSize: 8,
      areaStyle: { opacity: 0.12 }
    }]
  };
}

export function groupedBarOption(labels, datasets, { horizontal = false } = {}) {
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, renderMode: 'richText' },
    legend: { bottom: 0 },
    grid: { left: 8, right: 16, top: 24, bottom: 48, outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' },
    xAxis: horizontal
      ? { type: 'value', axisLabel: { formatter: (v) => Number(v).toLocaleString('en-IN') } }
      : { type: 'category', data: labels, axisLabel: { rotate: labels.length > 6 ? 30 : 0 } },
    yAxis: horizontal
      ? { type: 'category', data: labels }
      : { type: 'value', axisLabel: { formatter: (v) => Number(v).toLocaleString('en-IN') } },
    series: (datasets || []).map((ds) => ({
      type: 'bar',
      name: ds.label,
      emphasis: { focus: 'series' },
      data: ds.data
    }))
  };
}

export function stackedBarOption(labels, datasets, { horizontal = false } = {}) {
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, renderMode: 'richText' },
    legend: { bottom: 0 },
    grid: { left: 8, right: 16, top: 24, bottom: 48, outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' },
    xAxis: horizontal
      ? { type: 'value', axisLabel: { formatter: (v) => Number(v).toLocaleString('en-IN') } }
      : { type: 'category', data: labels, axisLabel: { rotate: labels.length > 6 ? 30 : 0 } },
    yAxis: horizontal
      ? { type: 'category', data: labels }
      : { type: 'value', axisLabel: { formatter: (v) => Number(v).toLocaleString('en-IN') } },
    series: (datasets || []).map((ds) => ({
      type: 'bar',
      name: ds.label,
      stack: 'total',
      emphasis: { focus: 'series' },
      data: ds.data
    }))
  };
}

export function heatmapOption(xLabels, yLabels, cells) {
  const data = (cells || []).map((c) => [c[0], c[1], c[2]]);
  const max = data.reduce((m, d) => Math.max(m, Number(d[2]) || 0), 0);
  return {
    tooltip: { trigger: 'item', renderMode: 'richText' },
    grid: { left: 120, right: 24, top: 16, bottom: 72, outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' },
    xAxis: { type: 'category', data: xLabels, splitArea: { show: true }, axisLabel: { rotate: 30 } },
    yAxis: { type: 'category', data: yLabels, splitArea: { show: true } },
    visualMap: { min: 0, max: max || 1, calculable: true, orient: 'horizontal', left: 'center', bottom: 0 },
    series: [{ type: 'heatmap', data, label: { show: true }, emphasis: { itemStyle: { shadowBlur: 8 } } }]
  };
}

export function scatterOption(points, { xName = 'Pre', yName = 'Post' } = {}) {
  return {
    tooltip: { trigger: 'item', renderMode: 'richText' },
    grid: { left: 48, right: 16, top: 24, bottom: 48, outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' },
    xAxis: { name: xName, nameLocation: 'middle', nameGap: 28, axisLabel: { formatter: (v) => Number(v).toLocaleString('en-IN') } },
    yAxis: { name: yName, nameLocation: 'middle', nameGap: 36, axisLabel: { formatter: (v) => Number(v).toLocaleString('en-IN') } },
    series: [{
      type: 'scatter',
      symbolSize: 10,
      data: points || [],
      large: (points || []).length > 400
    }]
  };
}

export function sunburstOption(tree) {
  return {
    tooltip: { trigger: 'item', renderMode: 'richText' },
    series: [{
      type: 'sunburst',
      radius: ['12%', '90%'],
      data: tree || [],
      label: { rotate: 'radial' }
    }]
  };
}

export function roseOption(items) {
  const data = (items || [])
    .map((r) => ({ name: String(r.label ?? r.name ?? 'Unknown'), value: Number(r.value) || 0 }))
    .filter((r) => r.value > 0);
  return {
    tooltip: { trigger: 'item', renderMode: 'richText' },
    legend: { bottom: 0 },
    series: [{
      type: 'pie',
      roseType: 'area',
      radius: ['18%', '70%'],
      data
    }]
  };
}

export function funnelOption(items) {
  const data = (items || [])
    .map((r) => ({ name: String(r.label ?? r.name ?? 'Unknown'), value: Number(r.value) || 0 }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);
  return {
    tooltip: { trigger: 'item', renderMode: 'richText' },
    series: [{ type: 'funnel', left: '12%', width: '70%', data, sort: 'descending' }]
  };
}

export function sankeyOption(nodes, links) {
  return {
    tooltip: { trigger: 'item', renderMode: 'richText' },
    series: [{
      type: 'sankey',
      emphasis: { focus: 'adjacency' },
      data: nodes || [],
      links: links || [],
      lineStyle: { color: 'gradient', curveness: 0.4 }
    }]
  };
}

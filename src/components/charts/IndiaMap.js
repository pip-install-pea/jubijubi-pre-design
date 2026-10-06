'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react/lib/core';
import { echarts, ECHARTS_THEME } from '../../lib/echartsSetup';
import { usePrintMode } from '../../lib/printCharts';
import { NAVY, SKY } from '../../lib/chartTheme';
import { PIN_FILTERS } from '../../lib/geo/locations';
import ChartEmpty from './ChartEmpty';

const NEUTRAL = '#e7e5e4';
const HIGHLIGHT = '#d9e6f5';
const DISPUTED = '#d6d3d1';
const BORDER = '#a8a29e';
const ATTRIBUTION = 'Boundaries: Survey of India (via DataMeet / indian_admin_boundaries)';

let statesTask = null;
let lowerTask = null;
const registeredDrills = new Set();

function loadJson(url) {
  return fetch(url).then((res) => {
    if (!res.ok) throw new Error(url);
    return res.json();
  });
}

function loadStates() {
  if (!statesTask) {
    statesTask = loadJson('/geo/india_states.geojson').then((geo) => {
      echarts.registerMap('jbf-india', geo);
      return geo;
    }).catch((err) => {
      statesTask = null;
      throw err;
    });
  }
  return statesTask;
}

function loadLower() {
  if (!lowerTask) {
    lowerTask = Promise.all([
      loadJson('/geo/india_districts.geojson'),
      loadJson('/geo/india_district_points.geojson')
    ]).catch((err) => {
      lowerTask = null;
      throw err;
    });
  }
  return lowerTask;
}

function registerDrilled(districts, stateCode) {
  const id = `jbf-india-${stateCode}`;
  if (!registeredDrills.has(id)) {
    const features = districts.features.filter((feature) => (
      Number(feature.properties?.state_code) === Number(stateCode)
    ));
    echarts.registerMap(id, { type: 'FeatureCollection', features });
    registeredDrills.add(id);
  }
  return id;
}

function defaultFormat(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString('en-IN') : '';
}

function hasMetricValues(metrics) {
  return Object.values(metrics || {}).some((metric) => Number(metric?.value) > 0);
}

function regionRows(features, { drilled, stateMetrics, districtMetrics, highlightStates, scaled }) {
  return features.map((feature) => {
    const props = feature.properties || {};
    const disputed = Boolean(props.disputed);
    const metric = disputed
      ? null
      : drilled
        ? districtMetrics?.[props.key]
        : stateMetrics?.[props.name];
    const value = Number(metric?.value) > 0 ? Number(metric.value) : null;
    const highlighted = !scaled && !disputed && !drilled && highlightStates?.includes(props.name);
    return {
      name: props.name,
      value,
      visualMap: value != null,
      disputed,
      remarks: props.remarks || '',
      districtKey: props.key || null,
      stateId: metric?.stateId || null,
      districtId: metric?.districtId || null,
      extra: metric?.extra || null,
      itemStyle: disputed
        ? { areaColor: DISPUTED, borderColor: '#a3a3a3' }
        : value == null
          ? { areaColor: highlighted ? HIGHLIGHT : NEUTRAL, borderColor: BORDER }
          : { borderColor: BORDER },
      emphasis: disputed ? { disabled: true } : { label: { show: false } }
    };
  });
}

function bubbleRows(points, districtMetrics, view) {
  if (!points || !hasMetricValues(districtMetrics)) return [];
  const rows = [];
  for (const feature of points.features || []) {
    const props = feature.properties || {};
    if (props.disputed) continue;
    if (view && props.state_abbr !== view.stateAbbr) continue;
    const value = Number(districtMetrics?.[props.key]?.value);
    if (!value) continue;
    const [lon, lat] = feature.geometry?.coordinates || [];
    if (lon == null || lat == null) continue;
    rows.push({
      name: props.name,
      stateAbbr: props.state_abbr,
      value: [lon, lat, value],
      raw: value
    });
  }
  const max = Math.max(...rows.map((row) => row.raw), 1);
  return rows.map((row) => ({
    ...row,
    symbolSize: Math.max(8, Math.min(36, 8 + 28 * Math.sqrt(row.raw / max)))
  }));
}

export async function applyLivelihoodPinClick({ pin, activePinId, patch }) {
  const spec = PIN_FILTERS.livelihood?.[pin.id];
  if (spec == null) return { activePinId, filtered: false };
  if (activePinId === pin.id) {
    patch({ state_id: '', district_id: '' });
    return { activePinId: null, filtered: true };
  }
  const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  const statesRes = await fetch('/api/locations?module=livelihood');
  if (!statesRes.ok) return { activePinId, filtered: false };
  const states = await statesRes.json();
  const state = (Array.isArray(states) ? states : []).find((row) => same(row.name, spec.state));
  if (!state) return { activePinId, filtered: false };
  const districtRes = await fetch(`/api/locations?module=livelihood&state_id=${encodeURIComponent(state.id)}`);
  if (!districtRes.ok) return { activePinId, filtered: false };
  const districts = await districtRes.json();
  const district = (Array.isArray(districts) ? districts : []).find((row) => same(row.name, spec.district));
  if (!district) return { activePinId, filtered: false };
  patch({ state_id: String(state.id), district_id: String(district.id) });
  return { activePinId: pin.id, filtered: true };
}

export default function IndiaMap({
  height = 420,
  stateMetrics,
  districtMetrics,
  metricLabel = '',
  valueFormatter = defaultFormat,
  highlightStates = [],
  pins = [],
  pinMetrics,
  activePinId = null,
  onPinClick,
  onRegionSelect,
  onBack,
  enableDrilldown = false,
  districtBubbles = false,
  unmapped = [],
  caption = '',
  ariaLabel,
  drillStateName
}) {
  const printing = usePrintMode();
  const chartRef = useRef(null);
  const boxRef = useRef(null);
  const actionRef = useRef({});
  const [status, setStatus] = useState('loading');
  const [statesGeo, setStatesGeo] = useState(null);
  const [districtsGeo, setDistrictsGeo] = useState(null);
  const [pointsGeo, setPointsGeo] = useState(null);
  const [view, setView] = useState(null);
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    let cancel = false;
    loadStates().then((geo) => {
      if (cancel) return;
      setStatesGeo(geo);
      setStatus('ready');
    }).catch(() => {
      if (!cancel) setStatus('error');
    });
    return () => { cancel = true; };
  }, []);

  useEffect(() => {
    if (status !== 'ready') return undefined;
    let cancel = false;
    loadLower().then(([districts, points]) => {
      if (cancel) return;
      setDistrictsGeo(districts);
      setPointsGeo(points);
    }).catch(() => {});
    return () => { cancel = true; };
  }, [status]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect?.width || 0;
      setNarrow(width > 0 && width < 640);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [status]);

  const drillTo = async (feature) => {
    if (!feature || feature.properties?.disputed) return;
    let districts;
    let points;
    try {
      [districts, points] = await loadLower();
    } catch {
      return;
    }
    setDistrictsGeo(districts);
    setPointsGeo(points);
    const code = feature.properties.state_code;
    const mapId = registerDrilled(districts, code);
    const features = districts.features.filter((item) => (
      Number(item.properties?.state_code) === Number(code)
    ));
    if (!features.length) return;
    setView({
      mapId,
      stateName: feature.properties.name,
      stateCode: code,
      stateAbbr: feature.properties.state_abbr,
      features
    });
  };

  const back = () => {
    if (!view) return;
    setView(null);
    onBack?.();
  };

  useEffect(() => {
    if (!statesGeo || drillStateName === undefined) return;
    if (!drillStateName) return;
    if (view?.stateName === drillStateName) return;
    const feature = statesGeo.features.find((item) => (
      item.properties?.name === drillStateName && !item.properties?.disputed
    ));
    if (feature) drillTo(feature);
    // drillTo is stable enough for this sync; view is checked above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drillStateName, statesGeo]);

  const backRef = useRef(back);
  backRef.current = back;
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') backRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  actionRef.current = { view, statesGeo, enableDrilldown, onPinClick, onRegionSelect, drillTo };

  const onEvents = useMemo(() => ({
    click: (params) => {
      const actions = actionRef.current;
      if (params.seriesId === 'pins' && params.data?.pin) {
        actions.onPinClick?.(params.data.pin);
        return;
      }
      if (params.seriesId === 'bubbles') return;
      const name = params.name;
      if (!name) return;
      const features = actions.view ? actions.view.features : actions.statesGeo?.features;
      const feature = features?.find((item) => item.properties?.name === name);
      if (!feature || feature.properties?.disputed) return;
      if (!actions.view && actions.enableDrilldown) {
        actions.drillTo(feature);
        actions.onRegionSelect?.({
          level: 'state',
          stateName: feature.properties.name,
          districtKey: null,
          stateId: params.data?.stateId || null,
          districtId: null
        });
        return;
      }
      if (actions.view) {
        actions.onRegionSelect?.({
          level: 'district',
          stateName: actions.view.stateName,
          districtKey: feature.properties.key,
          stateId: params.data?.stateId || null,
          districtId: params.data?.districtId || null
        });
      }
    }
  }), []);

  const scaled = view ? hasMetricValues(districtMetrics) : hasMetricValues(stateMetrics);
  const features = view ? view.features : (statesGeo?.features || []);
  const regionData = regionRows(features, {
    drilled: Boolean(view),
    stateMetrics,
    districtMetrics,
    highlightStates,
    scaled
  });
  const maxValue = regionData.reduce((max, row) => (row.value != null ? Math.max(max, row.value) : max), 0);
  const showScale = scaled && maxValue > 0;
  const districtNames = useMemo(() => {
    const names = new Map();
    for (const feature of districtsGeo?.features || []) {
      if (feature.properties?.key) names.set(feature.properties.key, feature.properties.name);
    }
    return names;
  }, [districtsGeo]);

  const pinData = (pins || []).filter((pin) => (
    pin.lat != null
    && pin.lon != null
    && (!view || pin.state === view.stateName)
  )).map((pin) => ({
    name: pin.town,
    value: [pin.lon, pin.lat],
    pin,
    districtName: districtNames.get(pin.districtKey) || '',
    symbol: 'pin',
    symbolSize: activePinId === pin.id ? 34 : 20,
    itemStyle: {
      color: pin.color,
      borderColor: activePinId === pin.id ? '#142033' : '#ffffff',
      borderWidth: activePinId === pin.id ? 2 : 1
    },
    label: {
      show: !narrow && !printing,
      formatter: `${pin.town} – ${pin.state}`,
      position: 'right',
      fontSize: 10,
      color: '#142033'
    }
  }));

  const bubbles = districtBubbles ? bubbleRows(pointsGeo, districtMetrics, view) : [];
  const pending = (pins || []).filter((pin) => pin.lat == null || pin.lon == null).map((pin) => pin.town);

  const option = useMemo(() => {
    const format = valueFormatter || defaultFormat;
    const tooltipText = (params) => {
      const data = params.data || {};
      if (params.seriesId === 'pins' && data.pin) {
        const lines = [data.pin.town];
        if (data.districtName) lines.push(data.districtName);
        lines.push(data.pin.state);
        const metrics = pinMetrics?.[data.pin.id];
        if (metrics && typeof metrics === 'object') {
          for (const [key, value] of Object.entries(metrics)) lines.push(`${key}: ${value}`);
        }
        return lines.join('\n');
      }
      if (params.seriesId === 'bubbles') {
        const value = Array.isArray(data.value) ? data.value[2] : data.raw;
        return `${data.name}\n${metricLabel || 'Value'}: ${format(value)}`;
      }
      if (data.disputed) return 'Disputed area (inter-state): not counted';
      const place = view ? `${params.name}, ${view.stateName}` : params.name;
      if (!showScale) return place;
      const lines = [place];
      lines.push(data.value == null ? 'No data' : `${metricLabel || 'Value'}: ${format(data.value)}`);
      if (data.extra && typeof data.extra === 'object') {
        for (const [key, value] of Object.entries(data.extra)) lines.push(`${key}: ${value}`);
      }
      if (view && data.remarks) lines.push(String(data.remarks));
      return lines.join('\n');
    };

    const series = [
      {
        id: 'regions',
        type: 'map',
        geoIndex: 0,
        data: regionData,
        selectedMode: false,
        emphasis: { label: { show: false } }
      }
    ];
    if (bubbles.length) {
      series.push({
        id: 'bubbles',
        type: 'scatter',
        coordinateSystem: 'geo',
        data: bubbles,
        symbol: 'circle',
        itemStyle: { color: SKY, opacity: 0.55, borderColor: NAVY, borderWidth: 1 },
        tooltip: { show: true },
        z: 4
      });
    }
    if (pinData.length) {
      series.push({
        id: 'pins',
        type: 'scatter',
        coordinateSystem: 'geo',
        data: pinData,
        symbolOffset: [0, '-40%'],
        z: 6
      });
    }

    return {
      animation: !printing,
      tooltip: { trigger: 'item', renderMode: 'richText', formatter: tooltipText },
      visualMap: showScale ? {
        show: true,
        min: 0,
        max: maxValue,
        calculable: false,
        right: narrow ? 4 : 8,
        bottom: narrow ? 28 : 36,
        text: [format(maxValue), format(0)],
        textGap: 6,
        itemWidth: narrow ? 8 : 12,
        itemHeight: narrow ? 70 : 100,
        inRange: { color: ['#E8F3F8', SKY, NAVY] },
        outOfRange: { color: NEUTRAL },
        textStyle: { color: '#57534e', fontSize: narrow ? 10 : 11 }
      } : { show: false },
      geo: {
        map: view ? view.mapId : 'jbf-india',
        roam: !printing,
        scaleLimit: { min: 1, max: 12 },
        aspectScale: 0.9,
        layoutCenter: [showScale ? '46%' : '50%', '50%'],
        layoutSize: '94%',
        selectedMode: false,
        itemStyle: { areaColor: NEUTRAL, borderColor: BORDER, borderWidth: 0.6 },
        emphasis: { itemStyle: { areaColor: '#d6d3d1' }, label: { show: false } },
        label: { show: false }
      },
      graphic: [{
        type: 'text',
        left: 8,
        bottom: 6,
        silent: true,
        style: {
          text: ATTRIBUTION,
          fill: '#78716c',
          fontSize: narrow ? 10 : 11,
          fontFamily: 'Inter, sans-serif'
        }
      }],
      series
    };
  }, [
    view, regionData, pinData, bubbles, showScale, maxValue, narrow, printing,
    metricLabel, valueFormatter, pinMetrics
  ]);

  const resetView = () => {
    const chart = chartRef.current?.getEchartsInstance?.();
    if (!chart) return;
    const current = chart.getOption();
    if (current.geo?.[0]) {
      current.geo[0].zoom = 1;
      current.geo[0].center = null;
      chart.setOption(current);
    }
  };

  const label = ariaLabel || (metricLabel
    ? `India map: ${metricLabel} by ${view ? 'district' : 'state'}`
    : 'India map');
  const captionBits = [
    caption,
    pending.length ? `Location pending: ${pending.join(', ')}.` : '',
    unmapped.length ? `Not on map: ${unmapped.join(', ')}.` : ''
  ].filter(Boolean);

  if (status === 'error') {
    return <ChartEmpty caption="Map could not be loaded" />;
  }

  return (
    <div ref={boxRef} style={{ position: 'relative', width: '100%' }} aria-label={label}>
      {status === 'loading' || !statesGeo ? (
        <div
          aria-busy="true"
          style={{ height, width: '100%', background: '#f5f5f4', borderRadius: 8 }}
        />
      ) : (
        <>
          {!printing && (
            <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 2, display: 'flex', gap: 8, alignItems: 'center' }}>
              {view && (
                <button type="button" onClick={back} style={buttonStyle}>
                  ← Back to India
                </button>
              )}
              <button type="button" onClick={resetView} style={buttonStyle}>
                Reset view
              </button>
              {view && (
                <span style={{ fontSize: 13, color: '#44403c' }}>India › {view.stateName}</span>
              )}
            </div>
          )}
          <ReactECharts
            ref={chartRef}
            echarts={echarts}
            option={option}
            theme={ECHARTS_THEME}
            notMerge
            onEvents={onEvents}
            style={{ height, width: '100%' }}
            opts={{ renderer: 'canvas' }}
          />
        </>
      )}
      {captionBits.length > 0 && (
        <p className="chart-caption">{captionBits.join(' ')}</p>
      )}
    </div>
  );
}

const buttonStyle = {
  minHeight: 32,
  padding: '4px 10px',
  borderRadius: 6,
  border: '1px solid #d6d3d1',
  background: '#fff',
  color: '#142033',
  fontSize: 13,
  cursor: 'pointer'
};

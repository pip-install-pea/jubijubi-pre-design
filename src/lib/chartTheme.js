import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  BarController,
  ArcElement,
  PointElement,
  LineElement,
  LineController,
  Filler,
  Title,
  Tooltip,
  Legend
} from 'chart.js';

function formatPrintNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return '';
  return n.toLocaleString('en-IN');
}

const printValueLabels = {
  id: 'printValueLabels',
  start(chart) {
    if (typeof window === 'undefined') return;
    const redraw = () => {
      requestAnimationFrame(() => {
        chart.resize();
        chart.update('none');
      });
    };
    window.addEventListener('app:print:prepare', redraw);
    window.addEventListener('app:print:done', redraw);
    chart.$printUnsub = () => {
      window.removeEventListener('app:print:prepare', redraw);
      window.removeEventListener('app:print:done', redraw);
    };
  },
  stop(chart) {
    chart.$printUnsub?.();
  },
  beforeUpdate(chart) {
    if (typeof document === 'undefined') return;
    const printing = document.documentElement.classList.contains('is-printing');
    if (chart.$printPadMode === printing) return;
    chart.$printPadMode = printing;
    chart.options.layout = chart.options.layout || {};
    if (chart.$printPadSaved === undefined) {
      chart.$printPadSaved = chart.options.layout.padding || 0;
    }
    chart.options.layout.padding = printing
      ? (chart.options.indexAxis === 'y'
        ? { top: 10, right: 48, bottom: 6, left: 6 }
        : { top: 22, right: 10, bottom: 6, left: 6 })
      : chart.$printPadSaved;
  },
  afterDatasetsDraw(chart) {
    if (typeof document === 'undefined' || !document.documentElement.classList.contains('is-printing')) {
      return;
    }
    const { ctx } = chart;
    ctx.save();
    ctx.fillStyle = '#142033';
    ctx.font = '600 10px Inter, system-ui, sans-serif';
    chart.data.datasets.forEach((ds, di) => {
      const meta = chart.getDatasetMeta(di);
      if (meta.hidden) return;
      meta.data.forEach((el, i) => {
        const raw = ds.data?.[i];
        let n = raw;
        if (raw && typeof raw === 'object') {
          n = raw.y ?? raw.x ?? raw.r ?? raw.value;
        }
        const text = formatPrintNumber(n);
        if (!text) return;
        const pos = el.tooltipPosition();
        const type = chart.config.type;
        if (type === 'doughnut' || type === 'pie') {
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, pos.x, pos.y);
          return;
        }
        if (type === 'scatter') return;
        const area = chart.chartArea;
        if (chart.options.indexAxis === 'y') {
          const tight = area && pos.x > area.right - 40;
          ctx.fillStyle = tight ? '#ffffff' : '#142033';
          ctx.textAlign = tight ? 'right' : 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, tight ? pos.x - 6 : Math.min(pos.x + 6, (area?.right || pos.x) - 2), pos.y);
          return;
        }
        const above = area && pos.y - 4 < area.top + 6;
        ctx.fillStyle = above ? '#ffffff' : '#142033';
        ctx.textAlign = 'center';
        ctx.textBaseline = above ? 'top' : 'bottom';
        ctx.fillText(text, pos.x, above ? pos.y + 4 : pos.y - 4);
      });
    });
    ctx.restore();
  }
};

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  BarController,
  ArcElement,
  PointElement,
  LineElement,
  LineController,
  Filler,
  Title,
  Tooltip,
  Legend,
  printValueLabels
);

export const NAVY = '#1E4FA3';
export const SKY = '#2A8FBE';
export const GOLD = '#C9A227';
export const LIME = '#5A8F2A';

/** Distinct slices, mid-dark so they read on white — not a toy rainbow. */
export const BRAND_SERIES = [
  NAVY, SKY, GOLD, LIME,
  '#6B5B95', '#C45C3A', '#3D7A6A', '#8B5A2B',
  '#4A6FA5', '#A35D6A', '#5B7F4A', '#3A5A80',
  '#7A6A3A', '#5A4A7A', '#6A3A3A', '#2F5F6F'
];

export function seriesColors(n) {
  const count = Math.max(Number(n) || 0, 0);
  if (count <= BRAND_SERIES.length) return BRAND_SERIES.slice(0, count);
  const out = [];
  for (let i = 0; i < count; i++) out.push(BRAND_SERIES[i % BRAND_SERIES.length]);
  return out;
}

/**
 * Draw numeric reference values as dashed lines (not extra bars).
 * Horizontal bar charts: vertical lines. Vertical charts: horizontal lines.
 */
export function referenceLinePlugin(lines = []) {
  return {
    id: 'jubiReferenceLines',
    afterDraw(chart) {
      const list = lines.filter((l) => Number(l.value) > 0);
      if (!list.length) return;
      const { ctx, chartArea, scales, options } = chart;
      if (!chartArea) return;
      const horizontal = options.indexAxis === 'y';
      const scale = horizontal ? scales.x : scales.y;
      if (!scale) return;
      list.forEach((line, i) => {
        const pixel = scale.getPixelForValue(Number(line.value));
        if (!Number.isFinite(pixel)) return;
        ctx.save();
        ctx.beginPath();
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = line.color || GOLD;
        ctx.lineWidth = 2;
        if (horizontal) {
          ctx.moveTo(pixel, chartArea.top);
          ctx.lineTo(pixel, chartArea.bottom);
        } else {
          ctx.moveTo(chartArea.left, pixel);
          ctx.lineTo(chartArea.right, pixel);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = line.color || GOLD;
        ctx.font = '600 11px Inter, sans-serif';
        const text = line.label || String(line.value);
        if (horizontal) {
          ctx.fillText(text, Math.min(pixel + 6, chartArea.right - 80), chartArea.top + 14 + i * 16);
        } else {
          ctx.fillText(text, chartArea.left + 6, pixel - 6);
        }
        ctx.restore();
      });
    }
  };
}

function localeTick(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return value;
  return value.toLocaleString('en-IN');
}

export function fadeIfUnfocused(color, label, focus) {
  if (!focus?.length) return color;
  const hit = focus.some((f) => String(f).toLowerCase() === String(label || '').toLowerCase());
  if (hit) return color;
  if (typeof color === 'string' && color.startsWith('#') && (color.length === 7 || color.length === 4)) {
    return `${color.length === 4 ? color : color}38`;
  }
  return color;
}

export const baseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 380, easing: 'easeOutQuart' },
  plugins: {
    legend: {
      labels: {
        usePointStyle: true,
        padding: 16,
        color: '#142033',
        font: { size: 12, weight: '500', family: 'Inter, sans-serif' }
      }
    },
    tooltip: {
      backgroundColor: '#122445',
      titleColor: '#ffffff',
      bodyColor: '#E8EEF8',
      padding: 10,
      callbacks: {
        label(ctx) {
          const label = ctx.dataset.label ? `${ctx.dataset.label}: ` : '';
          const raw = ctx.parsed?.y ?? ctx.parsed ?? ctx.raw;
          if (typeof raw === 'number') return `${label}${raw.toLocaleString('en-IN')}`;
          return `${label}${raw}`;
        }
      }
    }
  },
  scales: {
    x: {
      grid: { display: false, drawBorder: false },
      ticks: { color: '#142033', font: { size: 11 } }
    },
    y: {
      beginAtZero: true,
      grid: { color: 'rgba(20, 32, 51, 0.08)', drawBorder: false },
      ticks: { color: '#142033', font: { size: 11 }, callback: localeTick }
    }
  }
};

export const rankingBarOptions = {
  ...baseOptions,
  indexAxis: 'y',
  plugins: {
    ...baseOptions.plugins,
    legend: { display: false }
  },
  scales: {
    x: {
      beginAtZero: true,
      grid: { color: 'rgba(20, 32, 51, 0.08)', drawBorder: false },
      ticks: { color: '#142033', font: { size: 11 }, callback: localeTick }
    },
    y: {
      grid: { display: false, drawBorder: false },
      ticks: {
        color: '#142033',
        font: { size: 11 },
        autoSkip: false,
        crossAlign: 'far',
        callback(value, index) {
          const labels = this.chart?.data?.labels;
          const label = String(labels?.[index] ?? labels?.[value] ?? value ?? '');
          return label.length > 24 ? `${label.slice(0, 22)}…` : label;
        }
      }
    }
  }
};

export function rupeeOptions(extra = {}) {
  return {
    ...baseOptions,
    ...extra,
    plugins: {
      ...baseOptions.plugins,
      ...(extra.plugins || {}),
      tooltip: {
        ...baseOptions.plugins.tooltip,
        callbacks: {
          label(ctx) {
            const label = ctx.dataset.label ? `${ctx.dataset.label}: ` : '';
            const raw = ctx.parsed?.y ?? ctx.parsed ?? ctx.raw;
            if (typeof raw === 'number') return `${label}₹${raw.toLocaleString('en-IN')}`;
            return `${label}${raw}`;
          }
        }
      }
    }
  };
}

export function bucketTop(items, n = 12) {
  const sorted = [...items].sort((a, b) => (b.value || 0) - (a.value || 0));
  if (sorted.length <= n) return sorted;
  const head = sorted.slice(0, n - 1);
  const rest = sorted.slice(n - 1);
  const other = rest.reduce((sum, r) => sum + (r.value || 0), 0);
  return [...head, { label: 'Other', value: other }];
}

export function hasValues(arr) {
  return Array.isArray(arr) && arr.some((v) => Number(v) > 0);
}

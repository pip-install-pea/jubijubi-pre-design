import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Filler,
  Title,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  PointElement,
  LineElement,
  Filler,
  Title,
  Tooltip,
  Legend
);

export const NAVY = '#1E4FA3';
export const SKY = '#3EB5F0';
export const GOLD = '#F0C419';
export const LIME = '#8DC63F';

export const BRAND_SERIES = [
  NAVY, SKY, GOLD, LIME,
  '#5B7FCF', '#7EC8F0', '#F6D96A', '#A8D46A',
  '#163A7A', '#2A8FBE'
];

export function seriesColors(n) {
  if (n <= BRAND_SERIES.length) return BRAND_SERIES.slice(0, n);
  const out = [];
  for (let i = 0; i < n; i++) out.push(BRAND_SERIES[i % BRAND_SERIES.length]);
  return out;
}

function localeTick(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return value;
  return value.toLocaleString('en-IN');
}

export const baseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: {
        usePointStyle: true,
        padding: 16,
        color: '#1B2A4A',
        font: { size: 12, weight: '500', family: 'Inter, sans-serif' }
      }
    },
    tooltip: {
      backgroundColor: '#1E4FA3',
      titleColor: '#ffffff',
      bodyColor: '#F4F8F1',
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
      ticks: { color: '#1B2A4A', font: { size: 11 } }
    },
    y: {
      beginAtZero: true,
      grid: { color: 'rgba(141, 198, 63, 0.18)', drawBorder: false },
      ticks: { color: '#1B2A4A', font: { size: 11 }, callback: localeTick }
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
      grid: { color: 'rgba(141, 198, 63, 0.18)', drawBorder: false },
      ticks: { color: '#1B2A4A', font: { size: 11 }, callback: localeTick }
    },
    y: {
      grid: { display: false, drawBorder: false },
      ticks: { color: '#1B2A4A', font: { size: 11 } }
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

// Shared chart utilities
export const getTimeFormat = (date, period) => {
  if (['6h', '12h', '24h'].includes(period)) {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  } else if (['3d', '7d'].includes(period)) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', hour12: false });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export const makeLineChart = (ctx, labels, values, color, unit) => {
  const { Chart } = window.__chartjs || {};
  const gradient = ctx.createLinearGradient(0, 0, 0, 160);
  gradient.addColorStop(0, color + '55');
  gradient.addColorStop(1, color + '08');
  return {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: color,
        backgroundColor: gradient,
        fill: true,
        tension: 0.35,
        pointRadius: 0,
        pointHoverRadius: 5,
        borderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 500 },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(15,23,42,0.92)',
          titleColor: '#e2e8f0',
          bodyColor: '#e2e8f0',
          borderColor: color,
          borderWidth: 1,
          padding: 8,
          displayColors: false,
          callbacks: {
            label: (ctx) => `${ctx.parsed.y.toFixed(2)} ${unit}`
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(0,0,0,0.04)' },
          ticks: { color: '#94a3b8', font: { size: 9 }, maxTicksLimit: 6 },
          border: { display: false }
        },
        y: {
          grid: { color: 'rgba(0,0,0,0.04)' },
          ticks: { color: '#94a3b8', font: { size: 9 }, maxTicksLimit: 5 },
          border: { display: false }
        }
      },
      interaction: { intersect: false, mode: 'index' }
    }
  };
};

export const statsFor = (values, unit, colorFn) => {
  if (!values.length) return [];
  const cur = values[values.length - 1];
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return [
    { label: 'Current', value: `${cur.toFixed(1)} ${unit}`, color: colorFn ? colorFn(cur) : undefined },
    { label: 'Avg', value: `${avg.toFixed(1)} ${unit}` },
    { label: 'Min', value: `${min.toFixed(1)} ${unit}` },
    { label: 'Max', value: `${max.toFixed(1)} ${unit}` },
  ];
};

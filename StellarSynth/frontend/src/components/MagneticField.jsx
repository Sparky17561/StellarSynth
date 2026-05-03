import React, { useEffect, useRef, useState } from 'react';
import { Chart, registerables } from 'chart.js';
import { useSolarWindData } from './SolarWindProvider';
import { ChartCard } from './ChartCard';
import { getTimeFormat } from './chartUtils';

Chart.register(...registerables);

const MagneticField = () => {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const { magData, isLoading, fetchMagData, filterDataByPeriod } = useSolarWindData();
  const [period, setPeriod] = useState('24h');
  const data = filterDataByPeriod(magData, period);

  useEffect(() => {
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
    if (!data.length || !canvasRef.current) return;
    const labels = data.map(d => getTimeFormat(new Date(d.time), period));
    const values = data.map(d => d.bz);
    const ctx = canvasRef.current.getContext('2d');
    chartRef.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data: values,
          segment: {
            borderColor: ctx2 => (ctx2.p1?.parsed?.y ?? 0) >= 0 ? '#3b82f6' : '#ef4444',
          },
          backgroundColor: 'transparent',
          fill: false,
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 4,
          borderWidth: 2,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 400 },
        plugins: { legend: { display: false }, tooltip: { backgroundColor: '#0f172a', titleColor: '#e2e8f0', bodyColor: '#e2e8f0', padding: 7, displayColors: false, callbacks: { label: c => `Bz: ${c.parsed.y.toFixed(2)} nT` } } },
        scales: {
          x: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { color: '#94a3b8', font: { size: 9 }, maxTicksLimit: 6 }, border: { display: false } },
          y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { color: '#94a3b8', font: { size: 9 }, maxTicksLimit: 5, callback: v => v + ' nT' }, border: { display: false } }
        },
        interaction: { intersect: false, mode: 'index' }
      }
    });
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [magData, period]);

  const values = data.map(d => d.bz);
  const cur = values.length ? values[values.length-1] : null;
  const bzStatus = cur === null ? '—' : cur < -5 ? '⚠️ Storm Risk' : cur < 0 ? 'Southward' : 'Northward';
  const stats = cur !== null ? [
    { label: 'Current Bz', value: `${cur.toFixed(2)} nT`, color: cur < -5 ? '#ef4444' : cur < 0 ? '#f59e0b' : '#22c55e' },
    { label: 'Status', value: bzStatus },
    { label: 'Min', value: `${Math.min(...values).toFixed(1)} nT` },
  ] : [];

  return (
    <ChartCard
      title="Bz Component"
      icon="🧲"
      currentPeriod={period}
      onPeriodChange={setPeriod}
      onRefresh={fetchMagData}
      isLoading={isLoading}
      stats={stats}
    >
      <div className="cc-canvas-wrap">
        {data.length ? <canvas ref={canvasRef} /> : <div className="cc-no-data">No data</div>}
      </div>
    </ChartCard>
  );
};

export default MagneticField;
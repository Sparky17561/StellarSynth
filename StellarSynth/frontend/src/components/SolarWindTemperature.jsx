import React, { useEffect, useRef, useState } from 'react';
import { Chart, registerables } from 'chart.js';
import { useSolarWindData } from './SolarWindProvider';
import { ChartCard } from './ChartCard';
import { getTimeFormat } from './chartUtils';

Chart.register(...registerables);

const COLOR = '#ef4444';

const SolarWindTemperature = () => {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const { plasmaData, isLoading, fetchPlasmaData, filterDataByPeriod } = useSolarWindData();
  const [period, setPeriod] = useState('24h');
  const data = filterDataByPeriod(plasmaData, period);

  useEffect(() => {
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
    if (!data.length || !canvasRef.current) return;
    const labels = data.map(d => getTimeFormat(new Date(d.time), period));
    const values = data.map(d => d.temperature);
    const ctx = canvasRef.current.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 160);
    grad.addColorStop(0, COLOR + '55'); grad.addColorStop(1, COLOR + '08');
    chartRef.current = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: [{ data: values, borderColor: COLOR, backgroundColor: grad, fill: true, tension: 0.35, pointRadius: 0, pointHoverRadius: 4, borderWidth: 2 }] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 400 },
        plugins: { legend: { display: false }, tooltip: { backgroundColor: '#0f172a', titleColor: '#e2e8f0', bodyColor: '#e2e8f0', borderColor: COLOR, borderWidth: 1, padding: 7, displayColors: false, callbacks: { label: c => `${(c.parsed.y/1000).toFixed(0)}k K` } } },
        scales: {
          x: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { color: '#94a3b8', font: { size: 9 }, maxTicksLimit: 6 }, border: { display: false } },
          y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { color: '#94a3b8', font: { size: 9 }, maxTicksLimit: 5, callback: v => (v/1000).toFixed(0)+'k' }, border: { display: false } }
        },
        interaction: { intersect: false, mode: 'index' }
      }
    });
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [plasmaData, period]);

  const fmt = v => v >= 1e6 ? (v/1e6).toFixed(1)+'M K' : (v/1000).toFixed(0)+'k K';
  const values = data.map(d => d.temperature);
  const stats = values.length ? [
    { label: 'Current', value: fmt(values[values.length-1]) },
    { label: 'Avg', value: fmt(values.reduce((a,b)=>a+b,0)/values.length) },
    { label: 'Max', value: fmt(Math.max(...values)) },
  ] : [];

  return (
    <ChartCard
      title="Solar Wind Temperature"
      infoContent={`What is Plotted: This chart displays the temperature of the particles in the solar wind stream.
      
      Y-axis Units: Kelvin (K)
      
      Significance: Temperature fluctuations often correlate with speed and density changes, helping scientists identify different types of solar wind structures like Coronal Mass Ejections (CMEs).`}
      currentPeriod={period}
      onPeriodChange={setPeriod}
      onRefresh={fetchPlasmaData}
      isLoading={isLoading}
      stats={stats}
    >
      <div className="cc-canvas-wrap">
        {data.length ? <canvas ref={canvasRef} /> : <div className="cc-no-data">No data</div>}
      </div>
    </ChartCard>
  );
};

export default SolarWindTemperature;
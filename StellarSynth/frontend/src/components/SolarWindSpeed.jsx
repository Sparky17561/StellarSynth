import React, { useEffect, useRef, useState } from 'react';
import { Chart, registerables } from 'chart.js';
import { useSolarWindData } from './SolarWindProvider';
import { ChartCard } from './ChartCard';
import { getTimeFormat, statsFor } from './chartUtils';

Chart.register(...registerables);

const COLOR = '#3b82f6';
const speedColor = v => v < 300 ? '#22c55e' : v < 450 ? '#f59e0b' : '#ef4444';

const SolarWindSpeed = () => {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const { plasmaData, isLoading, fetchPlasmaData, filterDataByPeriod } = useSolarWindData();
  const [period, setPeriod] = useState('24h');

  const data = filterDataByPeriod(plasmaData, period);

  useEffect(() => {
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
    if (!data.length || !canvasRef.current) return;
    const labels = data.map(d => getTimeFormat(new Date(d.time), period));
    const values = data.map(d => d.speed);
    const ctx = canvasRef.current.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 160);
    grad.addColorStop(0, COLOR + '55'); grad.addColorStop(1, COLOR + '08');
    chartRef.current = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: [{ data: values, borderColor: COLOR, backgroundColor: grad, fill: true, tension: 0.35, pointRadius: 0, pointHoverRadius: 4, borderWidth: 2 }] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 400 },
        plugins: { legend: { display: false }, tooltip: { backgroundColor: '#0f172a', titleColor: '#e2e8f0', bodyColor: '#e2e8f0', borderColor: COLOR, borderWidth: 1, padding: 7, displayColors: false, callbacks: { label: c => `${c.parsed.y.toFixed(1)} km/s` } } },
        scales: { x: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { color: '#94a3b8', font: { size: 9 }, maxTicksLimit: 6 }, border: { display: false } }, y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { color: '#94a3b8', font: { size: 9 }, maxTicksLimit: 5, callback: v => v + ' km/s' }, border: { display: false } } },
        interaction: { intersect: false, mode: 'index' }
      }
    });
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [plasmaData, period]);

  const values = data.map(d => d.speed);
  const stats = values.length ? [
    { label: 'Current', value: `${values[values.length-1].toFixed(0)} km/s`, color: speedColor(values[values.length-1]) },
    { label: 'Avg', value: `${(values.reduce((a,b)=>a+b,0)/values.length).toFixed(0)} km/s` },
    { label: 'Max', value: `${Math.max(...values).toFixed(0)} km/s` },
  ] : [];

  return (
    <ChartCard 
      title="Solar Wind Speed" 
      infoContent={`What is Plotted: This chart tracks the velocity at which the stream of charged particles (the solar wind) is traveling away from the Sun.
      
      Y-axis Units: Kilometers per second 
      
      Significance: It is a key factor in predicting the timing and initial intensity of an event. A higher-speed solar wind stream delivers more kinetic energy, which can impact Earth's magnetic field more strongly.`}
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

export default SolarWindSpeed;
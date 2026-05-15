import React, { useEffect, useRef, useState } from 'react';
import { Chart, registerables } from 'chart.js';
import { useSolarWindData } from './SolarWindProvider';
import { ChartCard } from './ChartCard';
import { getTimeFormat } from './chartUtils';

Chart.register(...registerables);

const COLOR = '#6366f1';

const SolarWindDensity = () => {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const { plasmaData, isLoading, fetchPlasmaData, filterDataByPeriod } = useSolarWindData();
  const [period, setPeriod] = useState('24h');
  const data = filterDataByPeriod(plasmaData, period);

  useEffect(() => {
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
    if (!data.length || !canvasRef.current) return;
    const labels = data.map(d => getTimeFormat(new Date(d.time), period));
    const values = data.map(d => d.density);
    const ctx = canvasRef.current.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 160);
    grad.addColorStop(0, COLOR + '55'); grad.addColorStop(1, COLOR + '08');
    chartRef.current = new Chart(ctx, {
      type: 'line',
      data: { labels, datasets: [{ data: values, borderColor: COLOR, backgroundColor: grad, fill: true, tension: 0.35, pointRadius: 0, pointHoverRadius: 4, borderWidth: 2 }] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 400 },
        plugins: { legend: { display: false }, tooltip: { backgroundColor: '#0f172a', titleColor: '#e2e8f0', bodyColor: '#e2e8f0', borderColor: COLOR, borderWidth: 1, padding: 7, displayColors: false, callbacks: { label: c => `${c.parsed.y.toFixed(2)} p/cm³` } } },
        scales: { x: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { color: '#94a3b8', font: { size: 9 }, maxTicksLimit: 6 }, border: { display: false } }, y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { color: '#94a3b8', font: { size: 9 }, maxTicksLimit: 5 }, border: { display: false } } },
        interaction: { intersect: false, mode: 'index' }
      }
    });
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [plasmaData, period]);

  const values = data.map(d => d.density);
  const stats = values.length ? [
    { label: 'Current', value: `${values[values.length-1].toFixed(1)} p/cm³` },
    { label: 'Avg', value: `${(values.reduce((a,b)=>a+b,0)/values.length).toFixed(1)} p/cm³` },
    { label: 'Max', value: `${Math.max(...values).toFixed(1)} p/cm³` },
  ] : [];

  return (
    <ChartCard 
      title="Solar Wind Density" 
      infoContent={`What is Plotted: This chart shows the number of protons and other particles per cubic centimeter in the solar wind stream.
      
      Y-axis Units: Particles per cubic centimeter (p/cm³)
      
      Significance: Higher density means more material is hitting the Earth's magnetosphere, which can lead to stronger geomagnetic interactions even if speeds are moderate.`}
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

export default SolarWindDensity;
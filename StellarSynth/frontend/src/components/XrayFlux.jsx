import React, { useState, useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import { ChartCard } from './ChartCard';

const ENDPOINT = 'https://services.swpc.noaa.gov/json/goes/primary/xrays-7-day.json';
const PERIOD_MS = { '6h': 6*3600e3, '12h': 12*3600e3, '24h': 24*3600e3, '3d': 3*24*3600e3, '7d': 7*24*3600e3 };
const R_LEVELS = [
  { label: 'R1', value: 1e-5, color: '#f59e0b' },
  { label: 'R2', value: 5e-5, color: '#f97316' },
  { label: 'R3', value: 1e-4, color: '#ef4444' },
  { label: 'R4', value: 2e-4, color: '#b91c1c' },
  { label: 'R5', value: 1e-3, color: '#7c3aed' },
];

const XrayFlux = () => {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const [allData, setAllData] = useState([]);
  const [period, setPeriod] = useState('7d');
  const [loading, setLoading] = useState(false);
  const [cur, setCur] = useState('—');

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch(ENDPOINT);
      const json = await res.json();
      const d = json.filter(r => r.energy === '0.05-0.4nm')
                     .map(r => ({ x: new Date(r.time_tag), y: parseFloat(r.flux) }))
                     .filter((d, i, arr) => d.y > 0 && isFinite(d.y) && (i % 3 === 0 || i === arr.length-1))
                     .sort((a, b) => a.x - b.x);
      setAllData(d);
    } catch(e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); const t = setInterval(fetchData, 300000); return () => clearInterval(t); }, []);

  const getFiltered = () => {
    if (period === 'all') return allData;
    const latest = allData.length ? Math.max(...allData.map(d => d.x.getTime())) : 0;
    return allData.filter(d => latest - d.x.getTime() <= PERIOD_MS[period]);
  };

  useEffect(() => {
    const filt = getFiltered();
    if (filt.length) setCur(filt[filt.length-1].y.toExponential(2) + ' W/m²');
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
    if (!filt.length || !canvasRef.current) return;
    chartRef.current = new Chart(canvasRef.current.getContext('2d'), {
      type: 'line',
      data: { datasets: [{ data: filt, borderColor: '#22c55e', backgroundColor: '#22c55e18', fill: true, tension: 0.2, pointRadius: 0, pointHoverRadius: 4, borderWidth: 1.5 }] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: '#0f172a', titleColor: '#e2e8f0', bodyColor: '#e2e8f0', padding: 7, displayColors: false, callbacks: { label: c => `${c.parsed.y.toExponential(2)} W/m²` } }
        },
        scales: {
          x: { type: 'time', time: { unit: ['6h','12h','24h'].includes(period) ? 'hour' : 'day', displayFormats: { hour: 'HH:mm', day: 'MMM d' } }, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { color: '#94a3b8', font: { size: 9 }, maxTicksLimit: 6 }, border: { display: false } },
          y: { type: 'logarithmic', grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { color: '#94a3b8', font: { size: 9 }, callback: v => `1e${Math.round(Math.log10(v))}` }, border: { display: false } }
        },
        interaction: { intersect: false, mode: 'index' }
      }
    });
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [allData, period]);

  const stats = [
    { label: 'Latest', value: cur },
    { label: 'Band', value: '0.05–0.4nm' },
    { label: 'Satellite', value: 'GOES 19' },
  ];

  return (
    <ChartCard 
      title="X-ray Flux | GOES 19" 
      infoContent={`What is Plotted: This chart shows the intensity of solar X-ray radiation in two wavelength bands.
      
      Y-axis Units: Watts per square meter (W/m²)
      
      Significance: X-ray flux is used to classify solar flares (A, B, C, M, X). Rapid increases correlate with immediate radio blackouts on Earth's sunlit side.`}
      currentPeriod={period} 
      onPeriodChange={setPeriod} 
      onRefresh={fetchData} 
      isLoading={loading} 
      stats={stats}
    >
      <div className="cc-canvas-wrap">
        {allData.length ? <canvas ref={canvasRef} /> : <div className="cc-no-data">Loading…</div>}
      </div>
    </ChartCard>
  );
};

export default XrayFlux;

import React, { useState, useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import { ChartCard } from './ChartCard';

const ENDPOINT = 'https://services.swpc.noaa.gov/json/goes/primary/integral-protons-plot-7-day.json';
const PERIOD_MS = { '6h': 6*3600e3, '12h': 12*3600e3, '24h': 24*3600e3, '3d': 3*24*3600e3, '7d': 7*24*3600e3 };

const ProtonFlux = () => {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const [allData, setAllData] = useState([]);
  const [period, setPeriod] = useState('3d');
  const [energy, setEnergy] = useState('>=10 MeV');
  const [loading, setLoading] = useState(false);
  const [cur, setCur] = useState('—');

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch(ENDPOINT);
      const json = await res.json();
      const d = json.map(r => ({ x: new Date(r.time_tag), y: parseFloat(r.flux), energy: r.energy }))
                     .filter((d, i) => d.y > 0 && isFinite(d.y) && i % 3 === 0)
                     .sort((a, b) => a.x - b.x);
      setAllData(d);
    } catch(e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); const t = setInterval(fetchData, 300000); return () => clearInterval(t); }, []);

  const getFiltered = () => {
    const byE = allData.filter(d => d.energy === energy);
    if (period === 'all') return byE;
    const latest = Math.max(...byE.map(d => d.x.getTime()));
    return byE.filter(d => latest - d.x.getTime() <= PERIOD_MS[period]);
  };

  useEffect(() => {
    const filt = getFiltered();
    if (filt.length) setCur(filt[filt.length-1].y.toExponential(2) + ' pfu');
    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; }
    if (!filt.length || !canvasRef.current) return;
    chartRef.current = new Chart(canvasRef.current.getContext('2d'), {
      type: 'line',
      data: { datasets: [{ data: filt, borderColor: '#f59e0b', backgroundColor: '#f59e0b18', fill: true, tension: 0.2, pointRadius: 0, pointHoverRadius: 4, borderWidth: 1.5 }] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
        plugins: { legend: { display: false }, tooltip: { backgroundColor: '#0f172a', titleColor: '#e2e8f0', bodyColor: '#e2e8f0', padding: 7, displayColors: false, callbacks: { label: c => `${c.parsed.y.toExponential(2)} pfu` } } },
        scales: {
          x: { type: 'time', time: { unit: ['6h','12h','24h'].includes(period) ? 'hour' : 'day', displayFormats: { hour: 'HH:mm', day: 'MMM d' } }, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { color: '#94a3b8', font: { size: 9 }, maxTicksLimit: 6 }, border: { display: false } },
          y: { type: 'logarithmic', grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { color: '#94a3b8', font: { size: 9 }, callback: v => `1e${Math.round(Math.log10(v))}` }, border: { display: false } }
        },
        interaction: { intersect: false, mode: 'index' }
      }
    });
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [allData, period, energy]);

  const stats = [
    { label: 'Latest', value: cur },
    { label: 'Energy', value: energy.replace('>=', '≥') },
    { label: 'Threshold', value: '10 pfu' },
  ];

  return (
    <ChartCard title="Proton Flux | GOES 18" icon="☢️" currentPeriod={period} onPeriodChange={setPeriod} onRefresh={fetchData} isLoading={loading} stats={stats}>
      <div className="cc-canvas-wrap" style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, right: 0, zIndex: 2 }}>
          <select value={energy} onChange={e => setEnergy(e.target.value)} style={{ fontSize: '10px', padding: '2px 4px', border: '1px solid #e8eef8', borderRadius: '4px', color: '#4b5a7a', background: '#f5f8ff' }}>
            <option value=">=10 MeV">≥10 MeV</option>
            <option value=">=50 MeV">≥50 MeV</option>
            <option value=">=100 MeV">≥100 MeV</option>
          </select>
        </div>
        {allData.length ? <canvas ref={canvasRef} /> : <div className="cc-no-data">Loading…</div>}
      </div>
    </ChartCard>
  );
};

export default ProtonFlux;

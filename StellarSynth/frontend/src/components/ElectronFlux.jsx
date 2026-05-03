import React, { useState, useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import './ElectronFlux.css';

const ElectronFlux = () => {
  const [data, setData] = useState([]);
  const [currentPeriod, setCurrentPeriod] = useState('3d');
  const [status, setStatus] = useState('Loading...');
  const [loading, setLoading] = useState(false);
  
  const mainChartRef = useRef(null);
  const miniChartRef = useRef(null);
  const mainChartInstance = useRef(null);
  const miniChartInstance = useRef(null);

  const ENDPOINT = 'https://services.swpc.noaa.gov/json/goes/primary/integral-electrons-7-day.json';
  const THRESHOLD = 1000;
  
  const PERIOD_MS = {
    '6h': 6 * 3600000,
    '12h': 12 * 3600000,
    '24h': 24 * 3600000,
    '3d': 3 * 24 * 3600000,
    '7d': 7 * 24 * 3600000
  };

  const parseUTCDate = (timeString) => new Date(timeString);

  const updateStatus = (data) => {
    if (data.length > 0) {
      const latest = data[data.length - 1];
      const timeStr = latest.x.toLocaleString();
      const fluxStr = latest.y.toExponential(2);
      setStatus(`Latest: ${timeStr} | Flux: ${fluxStr} pfu`);
    } else {
      setStatus('No data available');
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await fetch(ENDPOINT);
      const json = await response.json();
      
      const processedData = json
        .map(d => ({
          x: parseUTCDate(d.time_tag),
          y: parseFloat(d.flux)
        }))
        .filter(d => d.y > 0 && !isNaN(d.y) && isFinite(d.y))
        .sort((a, b) => a.x.getTime() - b.x.getTime());

      setData(processedData);
      updateStatus(processedData);
    } catch (error) {
      console.error('Failed to fetch electron data:', error);
      setStatus('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const windowed = (data, period) => {
    if (period === 'all' || data.length === 0) return data;
    
    const latestTime = Math.max(...data.map(d => d.x.getTime()));
    const cutoff = latestTime - PERIOD_MS[period];
    
    return data.filter(d => d.x.getTime() >= cutoff);
  };

  const getDataRange = (data) => {
    if (data.length === 0) return { min: 1, max: 100 };
    
    const values = data.map(d => d.y);
    const min = Math.min(...values);
    const max = Math.max(...values);
    
    const logMin = Math.log10(min);
    const logMax = Math.log10(max);
    const range = logMax - logMin;
    const padding = Math.max(0.1, range * 0.1);
    
    return {
      min: Math.pow(10, logMin - padding),
      max: Math.pow(10, logMax + padding)
    };
  };

  const getTimeAxisOptions = (period) => {
    let unit, stepSize, hourFormat;

    if (period === '6h') {
      unit = 'hour';
      stepSize = 1;
      hourFormat = 'HH:mm';
    } else if (period === '12h') {
      unit = 'hour';
      stepSize = 2;
      hourFormat = 'HH:mm';
    } else if (period === '24h') {
      unit = 'hour';
      stepSize = 3;
      hourFormat = 'MMM d, HH:mm';
    } else if (period === '3d') {
      unit = 'day';
      stepSize = 1;
      hourFormat = 'HH:mm';
    } else if (period === '7d') {
      unit = 'day';
      stepSize = 1;
      hourFormat = 'HH:mm';
    } else {
      unit = 'day';
      stepSize = 7;
      hourFormat = 'HH:mm';
    }

    return {
      type: 'time',
      time: {
        unit: unit,
        stepSize: stepSize,
        displayFormats: {
          hour: hourFormat,
          day: 'MMM d'
        }
      },
      grid: { color: '#333' },
      ticks: { color: '#888', maxRotation: 0, autoSkip: true }
    };
  };

  const getChartConfig = (data, options = {}) => {
    const range = getDataRange(data);
    
    return {
      type: 'line',
      data: {
        datasets: [{
          label: 'Electron Flux',
          data: data,
          borderColor: '#6b9bd2',
          backgroundColor: options.fill ? '#6b9bd230' : 'transparent',
          borderWidth: options.lineWidth || 1.5,
          fill: options.fill || false,
          tension: 0.1,
          pointRadius: 0,
          pointHoverRadius: 5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(0,0,0,0.9)',
            titleColor: '#fff',
            bodyColor: '#fff',
            borderColor: '#444',
            borderWidth: 1,
            callbacks: {
              title: function(context) {
                const date = new Date(context[0].parsed.x);
                const utcHours = date.getUTCHours().toString().padStart(2, '0');
                const utcMinutes = date.getUTCMinutes().toString().padStart(2, '0');
                const utcDate = date.getUTCDate();
                const month = date.toLocaleDateString('en', { month: 'short', timeZone: 'UTC' });
                return `${month} ${utcDate}, ${utcHours}:${utcMinutes}`;
              },
              label: function(context) {
                return `Flux: ${context.parsed.y.toExponential(2)} pfu`;
              }
            }
          },
          ...(options.showThreshold && {
            annotation: {
              annotations: {
                threshold: {
                  type: 'line',
                  yMin: THRESHOLD,
                  yMax: THRESHOLD,
                  borderColor: '#e74c3c',
                  borderWidth: 2,
                  borderDash: [8, 4],
                  label: {
                    content: 'Threshold',
                    enabled: true,
                    position: 'start',
                    backgroundColor: '#e74c3c'
                  }
                }
              }
            }
          })
        },
        scales: {
          x: getTimeAxisOptions(options.period || '3d'),
          y: {
            type: 'logarithmic',
            min: range.min,
            max: range.max,
            afterBuildTicks: function(scale) {
              const ticks = [];
              const minExponent = Math.floor(Math.log10(scale.min));
              const maxExponent = Math.ceil(Math.log10(scale.max));
              for (let exp = minExponent; exp <= maxExponent; exp++) {
                ticks.push({ value: Math.pow(10, exp) });
              }
              return ticks;
            },
            ticks: {
              callback: function(value) {
                const exponent = Math.log10(value);
                return `1e${Math.round(exponent)}`;
              },
              color: '#888'
            },
            grid: { color: '#333' }
          }
        }
      }
    };
  };

  const updateChart = (chartInstance, data, options = {}) => {
    if (!chartInstance) return;
    
    chartInstance.data.datasets[0].data = data;
    
    const range = getDataRange(data);
    chartInstance.options.scales.y.min = range.min;
    chartInstance.options.scales.y.max = range.max;
    
    if (options.period) {
      chartInstance.options.scales.x = getTimeAxisOptions(options.period);
    }
    
    chartInstance.update('none');
  };

  const updateCharts = () => {
    const filteredData = windowed(data, currentPeriod);
    updateChart(mainChartInstance.current, filteredData, { period: currentPeriod });
    updateChart(miniChartInstance.current, data);
  };

  useEffect(() => {
    fetchData();
    
    // Auto-refresh every 5 minutes
    const interval = setInterval(fetchData, 300000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (data.length > 0) {
      // Initialize charts
      if (mainChartRef.current && !mainChartInstance.current) {
        const ctx = mainChartRef.current.getContext('2d');
        mainChartInstance.current = new Chart(ctx, getChartConfig([], { showThreshold: true }));
      }
      
      if (miniChartRef.current && !miniChartInstance.current) {
        const ctx = miniChartRef.current.getContext('2d');
        miniChartInstance.current = new Chart(ctx, getChartConfig([], { fill: true, period: 'all' }));
      }
      
      updateCharts();
    }
  }, [data]);

  useEffect(() => {
    if (data.length > 0) {
      updateCharts();
    }
  }, [currentPeriod]);

  // Cleanup charts on unmount
  useEffect(() => {
    return () => {
      if (mainChartInstance.current) {
        mainChartInstance.current.destroy();
      }
      if (miniChartInstance.current) {
        miniChartInstance.current.destroy();
      }
    };
  }, []);

  const handlePeriodChange = (period) => {
    setCurrentPeriod(period);
  };

  return (
    <div className="electron-flux-container">
      <h2 className="electron-flux-title">
        Electron Flux | GOES 19 (Pfu)
      </h2>
      
      <div className="electron-flux-status">
        {status}
      </div>
      
      <div className="electron-flux-controls">
        <span className="electron-flux-controls-label">Zoom</span>
        {['6h', '12h', '24h', '3d', '7d', 'all'].map(period => (
          <button
            key={period}
            onClick={() => handlePeriodChange(period)}
            className={`electron-flux-control-button ${currentPeriod === period ? 'active' : ''}`}
          >
            {period}
          </button>
        ))}
      </div>

      <div className="electron-flux-chart-wrapper">
        <div className="electron-flux-chart-container">
          <canvas ref={mainChartRef}></canvas>
        </div>
      </div>
      
      <div className="electron-flux-chart-wrapper">
        <div className="electron-flux-mini-chart-container">
          <canvas ref={miniChartRef}></canvas>
        </div>
        <div className="electron-flux-zoom-hint">
          ≥2 MeV
        </div>
      </div>
      
      {loading && (
        <div className="electron-flux-loading">
          Loading data...
        </div>
      )}
    </div>
  );
};

export default ElectronFlux;
import React, { useState, useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import './XrayFlux.css';

const XrayFlux = () => {
  const [data, setData] = useState([]);
  const [currentPeriod, setCurrentPeriod] = useState('3d');
  const [status, setStatus] = useState('Loading...');
  const [loading, setLoading] = useState(false);

  const mainChartRef = useRef(null);
  const mainChartInstance = useRef(null);

  const ENDPOINT = 'https://services.swpc.noaa.gov/json/goes/primary/xrays-7-day.json';

  // NOAA R-scale thresholds (W/m²)
  const R_SCALE_THRESHOLDS = {
    R1: 1e-5,
    R2: 5e-5,
    R3: 1e-4,
    R4: 2e-4,
    R5: 1e-3,
  };

  const PERIOD_MS = {
    '6h': 6 * 3600000,
    '12h': 12 * 3600000,
    '24h': 24 * 3600000,
    '3d': 3 * 24 * 3600000,
    '7d': 7 * 24 * 3600000,
    all: Infinity,
  };

  const parseUTCDate = (timeString) => new Date(timeString);

  const updateStatus = (arr) => {
    if (arr.length > 0) {
      const latest = arr[arr.length - 1];
      const timeStr = latest.x.toLocaleString();
      const fluxStr = latest.y.toExponential(2);
      setStatus(`Latest: ${timeStr} | Flux: ${fluxStr} W/m²`);
    } else {
      setStatus('No data available');
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch(ENDPOINT);
      const json = await res.json();

      // Use short channel (0.05–0.4 nm)
      const processed = json
        .filter((d) => d.energy === '0.05-0.4nm')
        .map((d) => ({ x: parseUTCDate(d.time_tag), y: parseFloat(d.flux) }))
        .filter((d) => d.y > 0 && isFinite(d.y))
        .sort((a, b) => a.x.getTime() - b.x.getTime());

      setData(processed);
      updateStatus(processed);
    } catch (e) {
      console.error('Failed to fetch X-ray data:', e);
      setStatus('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const windowed = (arr, period) => {
    if (period === 'all' || arr.length === 0) return arr;
    const latestTime = Math.max(...arr.map((d) => d.x.getTime()));
    const cutoff = latestTime - PERIOD_MS[period];
    return arr.filter((d) => d.x.getTime() >= cutoff);
  };

  const getDataRange = (arr) => {
    if (arr.length === 0) return { min: 1e-9, max: 1e-3 };
    const values = arr.map((d) => d.y);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const logMin = Math.log10(min);
    const logMax = Math.log10(max);
    const range = logMax - logMin;
    const padding = Math.max(0.1, range * 0.1);
    return {
      min: Math.pow(10, logMin - padding),
      max: Math.pow(10, logMax + padding),
    };
  };

  const getTimeAxisOptions = (period) => {
    let unit, stepSize, hourFormat;
    if (period === '6h') { unit = 'hour'; stepSize = 1; hourFormat = 'HH:mm'; }
    else if (period === '12h') { unit = 'hour'; stepSize = 2; hourFormat = 'HH:mm'; }
    else if (period === '24h') { unit = 'hour'; stepSize = 3; hourFormat = 'MMM d, HH:mm'; }
    else if (period === '3d') { unit = 'day'; stepSize = 1; hourFormat = 'HH:mm'; }
    else if (period === '7d') { unit = 'day'; stepSize = 1; hourFormat = 'HH:mm'; }
    else { unit = 'day'; stepSize = 7; hourFormat = 'HH:mm'; }

    return {
      type: 'time',
      time: {
        unit,
        stepSize,
        displayFormats: { hour: hourFormat, day: 'MMM d' },
      },
      grid: { color: '#333' },
      ticks: { color: '#888', maxRotation: 0, autoSkip: true },
    };
  };

  const getChartConfig = (dataset, options = {}) => {
    const range = getDataRange(dataset);
    const config = {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'X-ray Flux (0.05–0.4 nm)',
            data: dataset,
            borderColor: '#2ecc71',
            backgroundColor: options.fill ? '#2ecc7130' : 'transparent',
            borderWidth: options.lineWidth || 1.5,
            fill: options.fill || false,
            tension: 0.1,
            pointRadius: 0,
            pointHoverRadius: 5,
          },
        ],
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
              title: function (ctx) {
                const date = new Date(ctx[0].parsed.x);
                const hh = date.getUTCHours().toString().padStart(2, '0');
                const mm = date.getUTCMinutes().toString().padStart(2, '0');
                const d = date.getUTCDate();
                const month = date.toLocaleDateString('en', {
                  month: 'short',
                  timeZone: 'UTC',
                });
                return `${month} ${d}, ${hh}:${mm}`;
              },
              label: function (ctx) {
                return `Flux: ${ctx.parsed.y.toExponential(2)} W/m²`;
              },
            },
          },
        },
        scales: {
          x: getTimeAxisOptions(options.period || '3d'),
          y: {
            type: 'logarithmic',
            min: range.min,
            max: range.max,
            afterBuildTicks: function (scale) {
              const ticks = [];
              const minExponent = Math.floor(Math.log10(scale.min));
              const maxExponent = Math.ceil(Math.log10(scale.max));
              for (let exp = minExponent; exp <= maxExponent; exp++) {
                ticks.push({ value: Math.pow(10, exp) });
              }
              return ticks;
            },
            ticks: {
              callback: (value) => `1e${Math.round(Math.log10(value))}`,
              color: '#888',
            },
            grid: { color: '#333' },
          },
        },
      },
    };

    // Optional: R-scale horizontal lines (requires chartjs-plugin-annotation to actually render)
    if (options.showRScale) {
      const annotations = {};
      const colors = { R1: '#f39c12', R2: '#e67e22', R3: '#e74c3c', R4: '#c0392b', R5: '#8e44ad' };
      Object.entries(R_SCALE_THRESHOLDS).forEach(([scale, value]) => {
        if (value >= range.min && value <= range.max) {
          annotations[scale] = {
            type: 'line',
            yMin: value,
            yMax: value,
            borderColor: colors[scale],
            borderWidth: 1.5,
            borderDash: [6, 3],
            label: {
              content: scale,
              enabled: true,
              position: 'start',
              backgroundColor: colors[scale],
              color: '#fff',
            },
          };
        }
      });
      // This object is harmless if the annotation plugin isn't installed.
      config.options.plugins.annotation = { annotations };
    }

    return config;
  };

  const updateChart = (chartInstance, dataset, options = {}) => {
    if (!chartInstance) return;

    chartInstance.data.datasets[0].data = dataset;

    const range = getDataRange(dataset);
    chartInstance.options.scales.y.min = range.min;
    chartInstance.options.scales.y.max = range.max;

    if (options.period) {
      chartInstance.options.scales.x = getTimeAxisOptions(options.period);
    }

    // Update R-scale annotations if present
    if (options.showRScale && chartInstance.options.plugins.annotation) {
      const colors = { R1: '#f39c12', R2: '#e67e22', R3: '#e74c3c', R4: '#c0392b', R5: '#8e44ad' };
      const annotations = {};
      Object.entries(R_SCALE_THRESHOLDS).forEach(([scale, value]) => {
        if (value >= range.min && value <= range.max) {
          annotations[scale] = {
            type: 'line',
            yMin: value,
            yMax: value,
            borderColor: colors[scale],
            borderWidth: 1.5,
            borderDash: [6, 3],
            label: {
              content: scale,
              enabled: true,
              position: 'start',
              backgroundColor: colors[scale],
              color: '#fff',
            },
          };
        }
      });
      chartInstance.options.plugins.annotation.annotations = annotations;
    }

    chartInstance.update('none');
  };

  const updateMainChart = () => {
    const filtered = windowed(data, currentPeriod);
    updateChart(mainChartInstance.current, filtered, {
      period: currentPeriod,
      showRScale: true,
    });
  };

  // Fetch & refresh
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 300000); // 5 min
    return () => clearInterval(interval);
  }, []);

  // Init on first data load
  useEffect(() => {
    if (data.length > 0) {
      if (mainChartRef.current && !mainChartInstance.current) {
        const ctx = mainChartRef.current.getContext('2d');
        mainChartInstance.current = new Chart(
          ctx,
          getChartConfig([], { showRScale: true })
        );
      }
      updateMainChart();
    }
  }, [data]);

  // Update on period change
  useEffect(() => {
    if (data.length > 0) updateMainChart();
  }, [currentPeriod]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (mainChartInstance.current) {
        mainChartInstance.current.destroy();
      }
    };
  }, []);

  return (
    <div className="xray-flux-container">
      <h2 className="xray-flux-title">X-ray Flux (W/m²) | GOES 19</h2>

      <div className="xray-flux-status">{status}</div>

      <div className="xray-flux-controls">
        <span className="xray-flux-zoom-label">Zoom</span>
        {['6h', '12h', '24h', '3d', '7d', 'all'].map((period) => (
          <button
            key={period}
            onClick={() => setCurrentPeriod(period)}
            className={`xray-flux-period-button ${
              currentPeriod === period ? 'active' : ''
            }`}
          >
            {period}
          </button>
        ))}
      </div>

      <div className="xray-flux-main-chart">
        <div className="xray-flux-chart-wrapper">
          <canvas ref={mainChartRef}></canvas>
        </div>
      </div>

      <div className="xray-flux-description">
        The X-ray flux (measured in W/m²) is monitored in the 0.05–0.4 nm band by NOAA's GOES satellites.
        This parameter is used to classify radio blackouts (NOAA R-scale), with thresholds ranging from
        R1 (minor) at 10⁻⁵ W/m² (M1 flare) to R5 (extreme) at 10⁻³ W/m² (≈X20 flare).
      </div>

      {loading && <div className="xray-flux-loading">Loading data...</div>}
    </div>
  );
};

export default XrayFlux;

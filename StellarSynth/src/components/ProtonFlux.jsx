import React, { useState, useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import 'chartjs-adapter-date-fns';
import './ProtonFlux.css';

const ProtonFlux = () => {
  const [data, setData] = useState([]);
  const [currentPeriod, setCurrentPeriod] = useState('3d');
  const [selectedEnergy, setSelectedEnergy] = useState('>=10 MeV');
  const [status, setStatus] = useState('Loading...');
  const [loading, setLoading] = useState(false);

  const mainChartRef = useRef(null);
  const mainChartInstance = useRef(null);

  const ENDPOINT =
    'https://services.swpc.noaa.gov/json/goes/primary/integral-protons-plot-7-day.json';
  const THRESHOLD = 10;

  const PERIOD_MS = {
    '6h': 6 * 3600000,
    '12h': 12 * 3600000,
    '24h': 24 * 3600000,
    '3d': 3 * 24 * 3600000,
    '7d': 7 * 24 * 3600000,
    all: Infinity,
  };

  const parseUTCDate = (timeString) => new Date(timeString);

  const updateStatus = (dataForStatus) => {
    if (dataForStatus.length > 0) {
      const latest = dataForStatus[dataForStatus.length - 1];
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
        .map((d) => ({
          x: parseUTCDate(d.time_tag),
          y: parseFloat(d.flux),
          energy: d.energy,
        }))
        .filter((d) => d.y > 0 && !isNaN(d.y) && isFinite(d.y))
        .sort((a, b) => a.x.getTime() - b.x.getTime());

      setData(processedData);

      // Update status with >=10 MeV data
      const defaultEnergyData = processedData.filter(
        (d) => d.energy === '>=10 MeV'
      );
      updateStatus(defaultEnergyData);
    } catch (error) {
      console.error('Failed to fetch proton data:', error);
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

  const filterByEnergy = (arr, energy) => arr.filter((d) => d.energy === energy);

  const getDataRange = (arr) => {
    if (arr.length === 0) return { min: 1, max: 100 };
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
        unit,
        stepSize,
        displayFormats: {
          hour: hourFormat,
          day: 'MMM d',
        },
      },
      grid: { color: '#333' },
      ticks: { color: '#888', maxRotation: 0, autoSkip: true },
    };
  };

  const getChartConfig = (dataset, options = {}) => {
    const range = getDataRange(dataset);
    return {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'Proton Flux',
            data: dataset,
            borderColor: '#f1c40f',
            backgroundColor: options.fill ? '#f1c40f30' : 'transparent',
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
              title: function (context) {
                const date = new Date(context[0].parsed.x);
                const utcHours = date.getUTCHours().toString().padStart(2, '0');
                const utcMinutes = date
                  .getUTCMinutes()
                  .toString()
                  .padStart(2, '0');
                const utcDate = date.getUTCDate();
                const month = date.toLocaleDateString('en', {
                  month: 'short',
                  timeZone: 'UTC',
                });
                return `${month} ${utcDate}, ${utcHours}:${utcMinutes}`;
              },
              label: function (context) {
                return `Flux: ${context.parsed.y.toExponential(2)} pfu`;
              },
            },
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
                    backgroundColor: '#e74c3c',
                  },
                },
              },
            },
          }),
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
              callback: function (value) {
                const exponent = Math.log10(value);
                return `1e${Math.round(exponent)}`;
              },
              color: '#888',
            },
            grid: { color: '#333' },
          },
        },
      },
    };
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

    chartInstance.update('none');
  };

  const updateMainChart = () => {
    const energyFiltered = filterByEnergy(data, selectedEnergy);
    const filtered = windowed(energyFiltered, currentPeriod);
    updateChart(mainChartInstance.current, filtered, { period: currentPeriod });
  };

  useEffect(() => {
    fetchData();
    // Auto-refresh every 5 minutes
    const interval = setInterval(fetchData, 300000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (data.length > 0) {
      // Initialize main chart
      if (mainChartRef.current && !mainChartInstance.current) {
        const ctx = mainChartRef.current.getContext('2d');
        mainChartInstance.current = new Chart(
          ctx,
          getChartConfig([], { showThreshold: true })
        );
      }
      updateMainChart();
    }
  }, [data]);

  useEffect(() => {
    if (data.length > 0) updateMainChart();
  }, [currentPeriod, selectedEnergy]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mainChartInstance.current) {
        mainChartInstance.current.destroy();
      }
    };
  }, []);

  const handlePeriodChange = (period) => setCurrentPeriod(period);
  const handleEnergyChange = (e) => setSelectedEnergy(e.target.value);

  return (
    <div className="proton-flux-container">
      <h2 className="proton-flux-title">Proton Flux | GOES 18 (Pfu)</h2>

      <div className="proton-flux-status">{status}</div>

      <div className="proton-flux-energy-selector">
        <select
          value={selectedEnergy}
          onChange={handleEnergyChange}
          className="proton-flux-energy-select"
        >
          <option value=">=10 MeV">greater or equal to 10 MeV</option>
          <option value=">=50 MeV">greater or equal to 50 MeV</option>
          <option value=">=100 MeV">greater or equal to 100 MeV</option>
        </select>
      </div>

      <div className="proton-flux-controls">
        <span className="proton-flux-zoom-label">Zoom</span>
        {['6h', '12h', '24h', '3d', '7d', 'all'].map((period) => (
          <button
            key={period}
            onClick={() => handlePeriodChange(period)}
            className={`proton-flux-period-button ${
              currentPeriod === period ? 'active' : ''
            }`}
          >
            {period}
          </button>
        ))}
      </div>

      <div className="proton-flux-main-chart">
        <div className="proton-flux-chart-wrapper">
          <canvas ref={mainChartRef}></canvas>
        </div>
      </div>

      {loading && <div className="proton-flux-loading">Loading data...</div>}
    </div>
  );
};

export default ProtonFlux;

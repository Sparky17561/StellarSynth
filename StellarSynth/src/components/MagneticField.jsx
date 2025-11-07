import React, { useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
import { useSolarWindData } from './SolarWindProvider';
import './SolarWindChart.css';

Chart.register(...registerables);

const MagneticField = () => {
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const { getFilteredMagData, currentPeriod, isLoading } = useSolarWindData();

  // Helper function to filter data based on time period from the latest data point
  const filterDataByPeriod = (data, period) => {
    if (!data || data.length === 0) return [];
    
    // Sort data by time to ensure we get the actual latest entry
    const sortedData = [...data].sort((a, b) => new Date(b.time) - new Date(a.time));
    
    // Get the latest timestamp from the data, not current time
    const latestDataTime = new Date(sortedData[0].time);
    let cutoffTime;
    
    switch (period) {
      case '6h':
        cutoffTime = new Date(latestDataTime.getTime() - 6 * 60 * 60 * 1000);
        break;
      case '12h':
        cutoffTime = new Date(latestDataTime.getTime() - 12 * 60 * 60 * 1000);
        break;
      case '24h':
        cutoffTime = new Date(latestDataTime.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '3d':
        cutoffTime = new Date(latestDataTime.getTime() - 3 * 24 * 60 * 60 * 1000);
        break;
      case '7d':
        cutoffTime = new Date(latestDataTime.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'all':
      default:
        return sortedData.sort((a, b) => new Date(a.time) - new Date(b.time));
    }
    
    // Filter and return data within the time range, sorted chronologically for display
    return sortedData
      .filter(point => new Date(point.time) >= cutoffTime)
      .sort((a, b) => new Date(a.time) - new Date(b.time));
  };

  // Get appropriate time format based on period
  const getTimeFormat = (date, period) => {
    if (['6h', '12h', '24h'].includes(period)) {
      return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit', 
        hour12: false 
      });
    } else if (['3d', '7d'].includes(period)) {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    } else {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric'
      });
    }
  };

  useEffect(() => {
    // Cleanup previous chart instance first
    if (chartInstance.current) {
      chartInstance.current.destroy();
      chartInstance.current = null;
    }

    // Get data
    const allAvailableData = getFilteredMagData();
    const data = filterDataByPeriod(allAvailableData, currentPeriod);
    
    // Check if we have a canvas element and data
    if (!chartRef.current || !data.length) {
      console.log('No canvas or no data available');
      return;
    }

    const ctx = chartRef.current.getContext('2d');
    
    const labels = data.map(point => getTimeFormat(new Date(point.time), currentPeriod));
    const bzValues = data.map(point => point.bz);
    
    const currentBz = bzValues[bzValues.length - 1] || 0;
    const avgBz = bzValues.reduce((a, b) => a + b, 0) / bzValues.length;
    const minBz = Math.min(...bzValues);
    const maxBz = Math.max(...bzValues);

    // Create gradients
    const positiveGradient = ctx.createLinearGradient(0, 0, 0, 400);
    positiveGradient.addColorStop(0, 'rgba(61, 142, 201, 0.8)');
    positiveGradient.addColorStop(1, 'rgba(61, 142, 201, 0.1)');

    const negativeGradient = ctx.createLinearGradient(0, 0, 0, 400);
    negativeGradient.addColorStop(0, 'rgba(201, 61, 61, 0.1)');
    negativeGradient.addColorStop(1, 'rgba(201, 61, 61, 0.8)');

    try {
      chartInstance.current = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: 'Bz Component',
            data: bzValues,
            segment: {
              borderColor: (ctx) => {
                const value = ctx.p1 && ctx.p1.parsed ? ctx.p1.parsed.y : 0;
                return value >= 0 ? '#3D8EC9' : '#C93D3D';
              },
              backgroundColor: (ctx) => {
                const value = ctx.p1 && ctx.p1.parsed ? ctx.p1.parsed.y : 0;
                return value >= 0 ? 'rgba(61, 142, 201, 0.2)' : 'rgba(201, 61, 61, 0.2)';
              }
            },
            borderColor: '#6B7280',
            backgroundColor: (context) => {
              const chart = context.chart;
              const {ctx, chartArea} = chart;
              if (!chartArea) return null;
              
              const value = context.parsed?.y || 0;
              return value >= 0 ? positiveGradient : negativeGradient;
            },
            fill: 'origin',
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 8,
            pointHoverBorderWidth: 3,
            pointHoverBorderColor: (context) => {
              const value = bzValues[context.dataIndex] || 0;
              return value >= 0 ? '#2563EB' : '#DC2626';
            },
            pointHoverBackgroundColor: (context) => {
              const value = bzValues[context.dataIndex] || 0;
              return value >= 0 ? '#3D8EC9' : '#C93D3D';
            },
            borderWidth: 3,
            pointBorderWidth: 0,
            pointBackgroundColor: 'transparent'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: {
            duration: 1000,
            easing: 'easeInOutQuart'
          },
          plugins: {
            legend: {
              display: true,
              position: 'top',
              labels: {
                color: '#F3F4F6',
                font: {
                  size: 12,
                  weight: '600'
                },
                usePointStyle: true,
                generateLabels: function(chart) {
                  return [
                    {
                      text: '🔵 Northward (Positive Bz)',
                      fillStyle: '#3D8EC9',
                      strokeStyle: '#3D8EC9',
                      pointStyle: 'circle'
                    },
                    {
                      text: '🔴 Southward (Negative Bz)',
                      fillStyle: '#C93D3D',
                      strokeStyle: '#C93D3D',
                      pointStyle: 'circle'
                    }
                  ];
                }
              }
            },
            tooltip: {
              enabled: true,
              backgroundColor: 'rgba(17, 24, 39, 0.95)',
              titleColor: '#F3F4F6',
              bodyColor: '#F3F4F6',
              borderColor: (context) => {
                const dataPoint = context.tooltip && context.tooltip.dataPoints && context.tooltip.dataPoints[0];
                const value = dataPoint ? bzValues[dataPoint.dataIndex] || 0 : 0;
                return value >= 0 ? '#3D8EC9' : '#C93D3D';
              },
              borderWidth: 2,
              cornerRadius: 8,
              padding: 12,
              displayColors: false,
              titleFont: {
                size: 14,
                weight: 'bold'
              },
              bodyFont: {
                size: 13
              },
              callbacks: {
                title: function(context) {
                  return `Time: ${context[0].label}`;
                },
                label: function(context) {
                  const value = context.parsed.y;
                  const direction = value >= 0 ? 'Northward' : 'Southward';
                  const risk = value < -5 ? ' ⚠️ Geostorm Risk!' : value > 5 ? ' ✅ Stable' : '';
                  return `Bz: ${value.toFixed(2)} nT (${direction})${risk}`;
                }
              }
            }
          },
          scales: {
            x: {
              grid: {
                color: 'rgba(75, 85, 99, 0.3)',
                drawBorder: false,
                lineWidth: 1
              },
              ticks: {
                color: '#9CA3AF',
                maxTicksLimit: 8,
                font: {
                  size: 11
                }
              },
              border: {
                display: false
              }
            },
            y: {
              grid: {
                color: (context) => {
                  // Fixed: Check if context.tick exists and has value property
                  if (context.tick && typeof context.tick.value === 'number' && context.tick.value === 0) {
                    return 'rgba(156, 163, 175, 0.6)';
                  }
                  return 'rgba(75, 85, 99, 0.3)';
                },
                drawBorder: false,
                lineWidth: (context) => {
                  // Fixed: Check if context.tick exists and has value property
                  if (context.tick && typeof context.tick.value === 'number' && context.tick.value === 0) {
                    return 2;
                  }
                  return 1;
                }
              },
              ticks: {
                color: (context) => {
                  // Fixed: Check if context.tick exists and has value property
                  if (context.tick && typeof context.tick.value === 'number' && context.tick.value === 0) {
                    return '#F3F4F6';
                  }
                  return '#9CA3AF';
                },
                font: {
                  size: 11,
                  weight: (context) => {
                    // Fixed: Check if context.tick exists and has value property
                    if (context.tick && typeof context.tick.value === 'number' && context.tick.value === 0) {
                      return 'bold';
                    }
                    return 'normal';
                  }
                },
                callback: function(value) {
                  return value.toFixed(1) + ' nT';
                }
              },
              border: {
                display: false
              }
            }
          },
          interaction: {
            intersect: false,
            mode: 'index'
          },
          elements: {
            line: {
              borderJoinStyle: 'round',
              borderCapStyle: 'round'
            }
          },
          onHover: (event, elements) => {
            if (event.native && event.native.target) {
              event.native.target.style.cursor = elements.length > 0 ? 'crosshair' : 'default';
            }
          }
        }
      });

      // Update stats with better formatting and actual time range
      updateStats(data, bzValues, currentBz, avgBz, minBz, maxBz);

    } catch (error) {
      console.error('Error creating chart:', error);
    }

    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
        chartInstance.current = null;
      }
    };
  }, [getFilteredMagData, currentPeriod]);

  const updateStats = (data, bzValues, currentBz, avgBz, minBz, maxBz) => {
    const statsElement = document.querySelector('.magnetic-stats');
    if (!statsElement) return;

    const formatBz = (bz) => bz.toFixed(2);
    const getBzColor = (bz) => {
      if (bz < -10) return '#DC2626';
      if (bz < -5) return '#EF4444';
      if (bz < 0) return '#F59E0B';
      if (bz < 5) return '#10B981';
      return '#3B82F6';
    };

    const getBzStatus = (bz) => {
      if (bz < -10) return '🚨 Severe Risk';
      if (bz < -5) return '⚠️ Geostorm Risk';
      if (bz < 0) return '⚡ Moderate Risk';
      if (bz < 5) return '✅ Stable';
      return '🛡️ Very Stable';
    };

    const latestTime = data.length > 0 ? new Date(data[data.length - 1].time) : null;
    const earliestTime = data.length > 0 ? new Date(data[0].time) : null;
    
    const formatDateTime = (date) => {
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    };

    const positiveCount = bzValues.filter(val => val >= 0).length;
    const negativeCount = bzValues.filter(val => val < 0).length;
    const negativePercentage = ((negativeCount / bzValues.length) * 100).toFixed(1);

    statsElement.innerHTML = `
      <div class="stat-item">
        <span class="stat-label">Current:</span>
        <span class="stat-value" style="color: ${getBzColor(currentBz)}">
          ${formatBz(currentBz)} nT ${getBzStatus(currentBz)}
        </span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Average:</span>
        <span class="stat-value">${formatBz(avgBz)} nT</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Range:</span>
        <span class="stat-value">${formatBz(minBz)} - ${formatBz(maxBz)} nT</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Data Points:</span>
        <span class="stat-value">${data.length}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Southward %:</span>
        <span class="stat-value" style="color: ${negativePercentage > 30 ? '#EF4444' : '#10B981'}">
          ${negativePercentage}% (${negativeCount}/${bzValues.length})
        </span>
      </div>
      ${earliestTime && latestTime ? `
      <div class="stat-item time-range">
        <span class="stat-label">Time Range:</span>
        <span class="stat-value time-range-value">
          <div>${formatDateTime(earliestTime)}</div>
          <div class="to-separator">to</div>
          <div>${formatDateTime(latestTime)}</div>
        </span>
      </div>
      ` : ''}
      <div class="stat-note">
        <small>🔵 Northward = Stable | 🔴 Southward = Geostorm Risk</small>
      </div>
    `;
  };

  const allAvailableData = getFilteredMagData();
  const data = filterDataByPeriod(allAvailableData, currentPeriod);

  const getPeriodDescription = () => {
    switch (currentPeriod) {
      case '6h': return 'Last 6 Hours';
      case '12h': return 'Last 12 Hours';
      case '24h': return 'Last 24 Hours';
      case '3d': return 'Last 3 Days';
      case '7d': return 'Last 7 Days';
      case 'all': return 'All Available Data';
      default: return currentPeriod.toUpperCase();
    }
  };

  return (
    <div className="solar-wind-chart">
      <div className="chart-header">
        <h2 className="chart-title">
          <span className="chart-icon">🧲</span>
          North/South Magnetic Field Component Bz
          <span className="period-indicator">({getPeriodDescription()})</span>
        </h2>
        <div className="chart-loading">
          {isLoading && <div className="loading-spinner"></div>}
        </div>
      </div>
      
      <div className="chart-container">
        {data.length > 0 ? (
          <>
            <canvas ref={chartRef}></canvas>
            <div className="chart-stats magnetic-stats"></div>
          </>
        ) : (
          <div className="no-data">
            <div className="no-data-icon">📊</div>
            <div className="no-data-text">
              No data available for {getPeriodDescription().toLowerCase()}
            </div>
            <div className="no-data-subtext">
              Try selecting a different time period or refreshing the data
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MagneticField;
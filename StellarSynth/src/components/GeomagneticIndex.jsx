import React, { useRef, useState, useEffect } from 'react';
import { useKpData } from './TimeCarousel';
import './GeomagneticIndex.css';

const GeomagneticIndex = () => {
  const { kpData: data, currentPeriod } = useKpData();
  const [tooltip, setTooltip] = useState({
    show: false,
    x: 0,
    y: 0,
    data: null,
  });

  // We'll measure tooltip size once it's shown to clamp properly
  const tooltipRef = useRef(null);
  const [ttSize, setTtSize] = useState({ w: 260, h: 120 }); // sensible defaults

  useEffect(() => {
    if (tooltip.show && tooltipRef.current) {
      const rect = tooltipRef.current.getBoundingClientRect();
      setTtSize({ w: rect.width || 260, h: rect.height || 120 });
    }
  }, [tooltip.show, tooltip.data]);

  const clamp = (num, min, max) => Math.max(min, Math.min(num, max));

  const getKpClass = (kp) => {
    const value = parseFloat(kp);
    if (value < 5) return 'g0';
    if (value < 6) return 'g1';
    if (value < 7) return 'g2';
    if (value < 8) return 'g3';
    if (value < 9) return 'g4';
    return 'g5';
  };

  const formatTime = (timeStr, period) => {
    const date = new Date(timeStr);
    if (period === '6h' || period === '12h' || period === '24h') {
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    } else if (period === '3d') {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        hour12: false,
      });
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
    }
  };

  const handleBarEnter = (e, dataPoint) => {
    // Base target position near the cursor
    const baseX = e.clientX + 16;
    const baseY = e.clientY + 16;

    // If we're too close to the bottom, flip above the cursor
    const margin = 12;
    const maxX = window.innerWidth - ttSize.w - margin;
    const maxY = window.innerHeight - ttSize.h - margin;

    const yFlipped = baseY > maxY ? e.clientY - ttSize.h - 16 : baseY;

    const x = clamp(baseX, margin, maxX);
    const y = clamp(yFlipped, margin, window.innerHeight - margin);

    setTooltip({
      show: true,
      x,
      y,
      data: {
        time:
          `${formatTime(dataPoint[0], '24h')} - ${formatTime(
            dataPoint[0],
            '7d'
          )}`,
        kp: dataPoint[1],
        aRunning: dataPoint[2],
        stations: dataPoint[3],
      },
    });
  };

  const handleBarLeave = () => {
    setTooltip({ show: false, x: 0, y: 0, data: null });
  };

  const handleMouseMove = (e) => {
    if (!tooltip.show) return;

    const baseX = e.clientX + 16;
    const baseY = e.clientY + 16;

    const margin = 12;
    const maxX = window.innerWidth - ttSize.w - margin;
    const maxY = window.innerHeight - ttSize.h - margin;

    const yFlipped = baseY > maxY ? e.clientY - ttSize.h - 16 : baseY;

    const x = clamp(baseX, margin, maxX);
    const y = clamp(yFlipped, margin, window.innerHeight - margin);

    setTooltip((prev) => ({ ...prev, x, y }));
  };

  const currentKp = data.length > 0 ? data[data.length - 1][1] : '0.0';
  const labelFrequency = Math.max(1, Math.floor(data.length / 8));

  return (
    <div className="geomagnetic-index" onMouseMove={handleMouseMove}>
      <div className="chart-header">
        <h2 className="chart-title">Geomagnetic Activity</h2>
        <div className="current-kp">
          <span>Current Kp:</span>
          <span className="kp-value">{currentKp}</span>
        </div>
      </div>

      <div className="chart-area">
        <div className="y-axis">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="y-label">
              {i}
            </div>
          ))}
        </div>

        <div className="chart-grid">
          {[...Array(10)].map((_, i) => (
            <div
              key={i}
              className={`grid-line ${i % 3 === 0 ? 'major' : ''}`}
              style={{ bottom: `${(i / 9) * 100}%` }}
            />
          ))}
        </div>

        <div className="bars-container">
          {data.map((dataPoint, index) => {
            const kpValue = parseFloat(dataPoint[1]);
            return (
              <div
                key={index}
                className={`bar ${getKpClass(dataPoint[1])}`}
                style={{ height: `${Math.max(2, (kpValue / 9) * 100)}%` }}
                onMouseEnter={(e) => handleBarEnter(e, dataPoint)}
                onMouseLeave={handleBarLeave}
              />
            );
          })}
        </div>

        <div className="x-axis">
          {data.map((dataPoint, index) => {
            if (index % labelFrequency === 0) {
              return (
                <div key={index} className="x-label">
                  {formatTime(dataPoint[0], currentPeriod)}
                </div>
              );
            }
            return null;
          })}
        </div>
      </div>

      {tooltip.show && tooltip.data && (
        // position: fixed so nothing can clip it; zIndex high so it floats above
        <div
          ref={tooltipRef}
          className="tooltip show"
          style={{
            position: 'fixed',
            left: `${tooltip.x}px`,
            top: `${tooltip.y}px`,
            zIndex: 9999,
            pointerEvents: 'none',
          }}
        >
          <div className="tooltip-time">{tooltip.data.time}</div>
          <div className="tooltip-kp">Kp Index: {tooltip.data.kp}</div>
          <div>
            A-Running: <span>{tooltip.data.aRunning}</span>
          </div>
          <div>
            Stations: <span>{tooltip.data.stations}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default GeomagneticIndex;

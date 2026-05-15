import React, { useState } from 'react';
import { useSolarWindData } from './SolarWindProvider';
import { ChartCard } from './ChartCard';
import './ChartCard.css';

// Safe parse of NOAA date strings like "2024-05-01 12:00:00.000"
const parseKpDate = (str) => {
  if (!str) return null;
  const iso = str.trim().replace(' ', 'T');
  const withZ = iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z';
  const d = new Date(withZ);
  return isNaN(d.getTime()) ? null : d;
};

const formatKpTime = (str, period) => {
  const d = parseKpDate(str);
  if (!d) return '';
  if (['6h', '12h', '24h'].includes(period))
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const kpColor = (val) => {
  if (isNaN(val) || val < 0) return '#e2e8f0';
  if (val < 5) return '#22c55e';
  if (val < 6) return '#86efac';
  if (val < 7) return '#facc15';
  if (val < 8) return '#fb923c';
  if (val < 9) return '#f87171';
  return '#dc2626';
};

const getSlice = (all, period) => {
  switch (period) {
    case '6h':  return all.slice(-3);
    case '12h': return all.slice(-5);
    case '24h': return all.slice(-9);
    case '3d':  return all.slice(-25);
    case '7d':  return all.slice(-57);
    default:    return all;
  }
};

const BAR_HEIGHT_PX = 120; // fixed pixel height of bar container

const GeomagneticIndex = () => {
  const { kpData, isLoading, fetchKpData } = useSolarWindData();
  const [period, setPeriod] = useState('7d');

  const raw = Array.isArray(kpData) ? kpData : [];
  const data = getSlice(raw, period);

  // Parse values safely
  const parsed = data.map(dp => {
    const val = parseFloat(dp[1]);
    return { time: dp[0], value: isNaN(val) ? 0 : val };
  });

  const validValues = parsed.filter(p => p.value > 0);
  const curKp = validValues.length ? validValues[validValues.length - 1].value.toFixed(1) : '—';
  const maxKp = validValues.length ? Math.max(...validValues.map(p => p.value)).toFixed(1) : '—';

  // X-axis labels (show ~6 evenly spaced)
  const step = Math.max(1, Math.floor(parsed.length / 6));

  const stats = [
    { label: 'Current Kp', value: curKp, color: kpColor(parseFloat(curKp)) },
    { label: 'Max', value: maxKp },
    { label: 'Count', value: parsed.length },
  ];

  return (
    <ChartCard
      title="Geomagnetic Activity (Kp)"
      infoContent={`What is Plotted: The Kp index is a measure of the character of geomagnetic activity on a global scale.
      
      Y-axis Units: Kp units (0 to 9)
      
      Significance: It is the primary indicator of geomagnetic storms. High values (Kp ≥ 5) indicate storms that can cause auroras, satellite issues, and power grid stress.`}
      currentPeriod={period}
      onPeriodChange={setPeriod}
      onRefresh={fetchKpData}
      isLoading={isLoading}
      stats={stats}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        {parsed.length === 0 ? (
          <div className="cc-no-data">No Kp data available</div>
        ) : (
          <>
            {/* Bar chart using fixed pixel heights */}
            <div style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: '2px',
              height: `${BAR_HEIGHT_PX}px`,
              width: '100%',
              marginBottom: '4px'
            }}>
              {parsed.map((dp, i) => {
                const heightPx = Math.max(3, (dp.value / 9) * BAR_HEIGHT_PX);
                return (
                  <div
                    key={i}
                    title={`Kp ${dp.value.toFixed(1)} @ ${formatKpTime(dp.time, period)}`}
                    style={{
                      flex: 1,
                      height: `${heightPx}px`,
                      background: kpColor(dp.value),
                      borderRadius: '3px 3px 0 0',
                      transition: 'opacity 0.15s',
                      cursor: 'default',
                      minWidth: '2px',
                    }}
                    onMouseOver={e => e.currentTarget.style.opacity = '0.7'}
                    onMouseOut={e => e.currentTarget.style.opacity = '1'}
                  />
                );
              })}
            </div>

            {/* X-axis labels */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '0 2px'
            }}>
              {parsed.map((dp, i) => (
                <span key={i} style={{
                  flex: 1,
                  fontSize: '9px',
                  color: '#9aa5be',
                  textAlign: 'center',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  visibility: i % step === 0 ? 'visible' : 'hidden'
                }}>
                  {formatKpTime(dp.time, period)}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </ChartCard>
  );
};

export default GeomagneticIndex;

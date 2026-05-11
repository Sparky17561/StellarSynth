import React, { useState, useEffect, createContext, useContext } from 'react';

// ==================== SOLAR WIND PROVIDER ====================

export const SolarWindContext = createContext();

export const useSolarWindData = () => {
  const context = useContext(SolarWindContext);
  if (!context) {
    throw new Error('useSolarWindData must be used within a SolarWindProvider');
  }
  return context;
};

export const SolarWindProvider = ({ children }) => {
  const [plasmaData, setPlasmaData] = useState([]);
  const [magData, setMagData] = useState([]);
  const [protonData, setProtonData] = useState([]);
  const [xrayData, setXrayData] = useState([]);
  const [kpData, setKpData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Helper to safely parse NOAA date strings (e.g. "2024-05-01 12:00:00.000")
  const parseNOAADate = (dateStr) => {
    if (!dateStr) return new Date();
    // If it has a space instead of T, replace it. If it doesn't end in Z, append Z to ensure UTC.
    let isoStr = dateStr.trim().replace(' ', 'T');
    if (!isoStr.endsWith('Z') && !isoStr.includes('+') && !isoStr.match(/-\d{2}:\d{2}$/)) {
      isoStr += 'Z';
    }
    return new Date(isoStr);
  };

  // Fetch Solar Wind Plasma Data
  const fetchPlasmaData = async () => {
    try {
      const response = await fetch('https://services.swpc.noaa.gov/products/solar-wind/plasma-7-day.json');
      const rawData = await response.json();
      const processedData = rawData.slice(1).map(row => ({
        time: parseNOAADate(row[0]),
        density: parseFloat(row[1]) || 0,
        speed: parseFloat(row[2]) || 0,
        temperature: parseFloat(row[3]) || 0
      }));
      setPlasmaData(processedData);
    } catch (error) {
      console.error('Error fetching plasma data:', error);
    }
  };

  // Fetch Magnetic Field Data
  // Note: mag-7-day.json can be >700KB and gets truncated by NOAA CDN sometimes.
  // Use 1-day endpoint (smaller) and fall back gracefully.
  const fetchMagData = async () => {
    const endpoints = [
      'https://services.swpc.noaa.gov/products/solar-wind/mag-1-day.json',
      'https://services.swpc.noaa.gov/products/solar-wind/mag-7-day.json',
    ];
    for (const url of endpoints) {
      try {
        const response = await fetch(url);
        const text = await response.text();
        // Safely parse — NOAA sometimes returns truncated JSON on large payloads
        let rawData;
        try {
          rawData = JSON.parse(text);
        } catch {
          // Try to recover by trimming to last complete array entry
          const lastBracket = text.lastIndexOf('],');
          if (lastBracket > 0) {
            try {
              rawData = JSON.parse(text.slice(0, lastBracket + 1) + ']');
            } catch {
              console.warn(`Magnetic data from ${url} could not be parsed even after recovery.`);
              continue;
            }
          } else {
            continue;
          }
        }
        const processedData = rawData.slice(1).map(row => ({
          time: parseNOAADate(row[0]),
          bz: parseFloat(row[3]) || 0
        }));
        setMagData(processedData);
        return; // success — stop trying endpoints
      } catch (error) {
        console.error(`Error fetching magnetic data from ${url}:`, error);
      }
    }
  };

  // Fetch Proton Flux Data
  const fetchProtonData = async () => {
    try {
      const response = await fetch('https://services.swpc.noaa.gov/json/goes/primary/integral-protons-plot-7-day.json');
      const json = await response.json();
      const processedData = json
        .map(d => ({
          x: new Date(d.time_tag),
          y: parseFloat(d.flux),
          energy: d.energy
        }))
        .filter(d => d.y > 0 && !isNaN(d.y) && isFinite(d.y))
        .sort((a, b) => a.x.getTime() - b.x.getTime());
      setProtonData(processedData);
    } catch (error) {
      console.error('Error fetching proton data:', error);
    }
  };

  // Fetch X-ray Flux Data
  const fetchXrayData = async () => {
    try {
      const response = await fetch('https://services.swpc.noaa.gov/json/goes/primary/xrays-7-day.json');
      const json = await response.json();
      const processedData = json
        .filter(d => d.energy === "0.05-0.4nm")
        .map(d => ({
          x: new Date(d.time_tag),
          y: parseFloat(d.flux)
        }))
        .filter(d => d.y > 0 && !isNaN(d.y) && isFinite(d.y))
        .sort((a, b) => a.x.getTime() - b.x.getTime());
      setXrayData(processedData);
    } catch (error) {
      console.error('Error fetching X-ray data:', error);
    }
  };

  // Fetch Kp Index Data — NOAA returns objects {time_tag, Kp, a_running, station_count}
  const fetchKpData = async () => {
    try {
      const response = await fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json');
      const rawData = await response.json();
      
      // Handle both old array format [[timestamp, kp, ...]] and new object format [{time_tag, Kp, ...}]
      const processedData = rawData.map(row => {
        if (Array.isArray(row)) {
          // Old format: [timestamp, kp_value, ...]
          return [row[0], row[1]];
        } else if (row && typeof row === 'object') {
          // New format: {time_tag: "...", Kp: 3.0, ...}
          return [row.time_tag, row.Kp];
        }
        return null;
      }).filter(row => row !== null && row[0] && row[1] !== undefined && row[1] !== '' && !isNaN(parseFloat(row[1])));

      setKpData(processedData);
    } catch (error) {
      console.error('Error fetching Kp data:', error);
    }
  };

  // Refresh all data
  const refreshData = async () => {
    setIsLoading(true);
    await Promise.all([
      fetchPlasmaData(),
      fetchMagData(),
      fetchProtonData(),
      fetchXrayData(),
      fetchKpData()
    ]);
    setIsLoading(false);
  };

  // Helper method for generic period filtering, passing period explicitly
  const filterDataByPeriod = (data, period) => {
    if (!data || data.length === 0) return [];
    const sortedData = [...data].sort((a, b) => b.time.getTime() - a.time.getTime());
    const latestDataTime = sortedData[0].time.getTime();
    let ms;
    
    switch (period) {
      case '6h': ms = 6 * 3600 * 1000; break;
      case '12h': ms = 12 * 3600 * 1000; break;
      case '24h': ms = 24 * 3600 * 1000; break;
      case '3d': ms = 3 * 24 * 3600 * 1000; break;
      case '7d': ms = 7 * 24 * 3600 * 1000; break;
      default: 
        return sortedData.sort((a, b) => a.time.getTime() - b.time.getTime());
    }
    
    return sortedData
      .filter(d => latestDataTime - d.time.getTime() <= ms)
      .sort((a, b) => a.time.getTime() - b.time.getTime());
  };

  // Initial data fetch
  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 300000); // Refresh every 5 minutes
    return () => clearInterval(interval);
  }, []);

  const value = {
    plasmaData,
    magData,
    protonData,
    xrayData,
    kpData,
    isLoading,
    refreshData,
    fetchPlasmaData,
    fetchMagData,
    fetchProtonData,
    fetchXrayData,
    fetchKpData,
    filterDataByPeriod
  };

  return (
    <SolarWindContext.Provider value={value}>
      {children}
    </SolarWindContext.Provider>
  );
};
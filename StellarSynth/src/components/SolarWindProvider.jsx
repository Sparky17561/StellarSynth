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
  const [currentDashboard, setCurrentDashboard] = useState('speed');
  const [currentPeriod, setCurrentPeriod] = useState('24h');
  const [isLoading, setIsLoading] = useState(false);

  // Fetch Solar Wind Plasma Data
  const fetchPlasmaData = async () => {
    try {
      const response = await fetch('https://services.swpc.noaa.gov/products/solar-wind/plasma-7-day.json');
      const rawData = await response.json();
      const processedData = rawData.slice(1).map(row => ({
        time: new Date(row[0]),
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
  const fetchMagData = async () => {
    try {
      const response = await fetch('https://services.swpc.noaa.gov/products/solar-wind/mag-7-day.json');
      const rawData = await response.json();
      const processedData = rawData.slice(1).map(row => ({
        time: new Date(row[0]),
        bz: parseFloat(row[3]) || 0
      }));
      setMagData(processedData);
    } catch (error) {
      console.error('Error fetching magnetic data:', error);
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

  // Fetch Kp Index Data
  const fetchKpData = async () => {
    try {
      const response = await fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json');
      const rawData = await response.json();
      const processedData = rawData.slice(1).map(row => [
        row[0],
        row[1],
        row[2],
        row[3]
      ]);
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

  // Filter data by time period
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
    currentDashboard,
    currentPeriod,
    isLoading,
    setCurrentDashboard,
    setCurrentPeriod,
    refreshData,
    getRawPlasmaData: () => plasmaData,
    getRawMagData: () => magData,
    getRawProtonData: () => protonData,
    getRawXrayData: () => xrayData,
    getRawKpData: () => kpData,
    getFilteredPlasmaData: () => filterDataByPeriod(plasmaData, currentPeriod),
    getFilteredMagData: () => filterDataByPeriod(magData, currentPeriod),
    getFilteredProtonData: () => filterDataByPeriod(protonData, currentPeriod),
    getFilteredXrayData: () => filterDataByPeriod(xrayData, currentPeriod)
  };

  return (
    <SolarWindContext.Provider value={value}>
      {children}
    </SolarWindContext.Provider>
  );
};
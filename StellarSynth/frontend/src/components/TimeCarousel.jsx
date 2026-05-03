import React, { useState, useEffect, createContext, useContext } from 'react';
import './TimeCarousel.css';

// Create a context to share data between TimeCarousel and GeomagneticIndex
export const KpDataContext = createContext();

// Custom hook to use the KP data context
export const useKpData = () => {
  const context = useContext(KpDataContext);
  if (!context) {
    throw new Error('useKpData must be used within a KpDataProvider');
  }
  return context;
};

// Provider component that wraps both TimeCarousel and GeomagneticIndex
export const KpDataProvider = ({ children }) => {
  const [kpData, setKpData] = useState([]);
  const [currentPeriod, setCurrentPeriod] = useState('7d');
  const [isLoading, setIsLoading] = useState(false);
  const [isLive, setIsLive] = useState(true);

  const getDataForPeriod = (period) => {
    const allData = kpData;
    
    switch (period) {
      case '6h':
        return allData.slice(-3);
      case '12h':
        return allData.slice(-5);
      case '24h':
        return allData.slice(-9);
      case '3d':
        return allData.slice(-25);
      case '7d':
        return allData.slice(-57);
      case 'all':
      default:
        return allData;
    }
  };

  const handlePeriodChange = (period) => {
    setCurrentPeriod(period);
  };

  const handleRefresh = async () => {
    setIsLoading(true);
    
    try {
      const response = await fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json');
      
      if (response.ok) {
        const data = await response.json();
        setKpData(data.slice(1)); // Remove header row
        setIsLive(true);
      } else {
        throw new Error('Failed to fetch data');
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      setIsLive(false);
    } finally {
      setIsLoading(false);
    }
  };

  // Initial data fetch
  useEffect(() => {
    handleRefresh();
  }, []);

  const value = {
    kpData: getDataForPeriod(currentPeriod),
    currentPeriod,
    isLoading,
    isLive,
    handlePeriodChange,
    handleRefresh
  };

  return (
    <KpDataContext.Provider value={value}>
      {children}
    </KpDataContext.Provider>
  );
};

const TimeCarousel = () => {
  const { currentPeriod, isLoading, handlePeriodChange, handleRefresh } = useKpData();

  const periods = [
    { key: '6h', label: '6H' },
    { key: '12h', label: '12H' },
    { key: '24h', label: '24H' },
    { key: '3d', label: '3D' },
    { key: '7d', label: '7D' },
    { key: 'all', label: 'ALL' }
  ];

  return (
    <div className="time-carousel">
      <div className="time-selector">
        {periods.map((period) => (
          <button
            key={period.key}
            className={`time-btn ${currentPeriod === period.key ? 'active' : ''}`}
            onClick={() => handlePeriodChange(period.key)}
            disabled={isLoading}
          >
            <span className="btn-text">{period.label}</span>
          </button>
        ))}
      </div>
      
      <button 
        className={`refresh-btn ${isLoading ? 'loading' : ''}`}
        onClick={handleRefresh}
        disabled={isLoading}
      >
        <div className="refresh-icon">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path 
              d="M4 4V8H8M20 20V16H16M18 12C18 16.4183 14.4183 20 10 20C5.58172 20 2 16.4183 2 12C2 7.58172 5.58172 4 10 4C12.2091 4 14.2091 4.89543 15.6569 6.34315L18 8.68629"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <span className="refresh-text">
          {isLoading ? 'Updating...' : 'Refresh Data'}
        </span>
      </button>
    </div>
  );
};

export default TimeCarousel;
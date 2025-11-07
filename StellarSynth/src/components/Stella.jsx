import React, { useState } from 'react';
import './Stella.css';

const Stella = () => {
  const [messages, setMessages] = useState([
    {
      id: 1,
      type: 'bot',
      text: 'Hello! I\'m Stella, your AI space weather assistant. I can help you with solar flare predictions, historical data queries, and current space weather conditions. How can I assist you today?',
      time: new Date().toLocaleTimeString()
    }
  ]);
  const [inputValue, setInputValue] = useState('');

  const quickQueries = [
    '📊 Show current solar activity',
    '🔍 Pull 10-year solar flare data',
    '⚡ What\'s the flare risk today?',
    '📈 Analyze last week\'s trends'
  ];

  const handleSendMessage = () => {
    if (inputValue.trim()) {
      const newMessage = {
        id: messages.length + 1,
        type: 'user',
        text: inputValue,
        time: new Date().toLocaleTimeString()
      };
      
      setMessages([...messages, newMessage]);
      setInputValue('');

      // Simulate bot response
      setTimeout(() => {
        const botResponse = {
          id: messages.length + 2,
          type: 'bot',
          text: 'I\'m analyzing your query. This is a demo response. In the full version, I\'ll provide intelligent insights based on real-time space weather data and historical records.',
          time: new Date().toLocaleTimeString()
        };
        setMessages(prev => [...prev, botResponse]);
      }, 1000);
    }
  };

  const handleQuickQuery = (query) => {
    setInputValue(query.substring(2)); // Remove emoji
  };

  return (
    <div className="stella-page">
      <div className="stella-container">
        <div className="stella-header">
          <div className="header-content">
            <div className="stella-avatar">🤖</div>
            <div>
              <h1 className="stella-title">Stella AI Assistant</h1>
              <p className="stella-subtitle">Intelligent Space Weather Analysis</p>
            </div>
          </div>
          <div className="stella-status">
            <span className="status-indicator">●</span>
            <span>Online</span>
          </div>
        </div>

        <div className="features-bar">
          <div className="feature-chip">
            <span>💬 Natural Language Queries</span>
          </div>
          <div className="feature-chip">
            <span>📊 Historical Data Access</span>
          </div>
          <div className="feature-chip">
            <span>🔮 Predictive Insights</span>
          </div>
        </div>

        <div className="chat-section">
          <div className="messages-container">
            {messages.map((message) => (
              <div key={message.id} className={`message ${message.type}`}>
                {message.type === 'bot' && <div className="message-avatar">🤖</div>}
                <div className="message-content">
                  <p className="message-text">{message.text}</p>
                  <span className="message-time">{message.time}</span>
                </div>
                {message.type === 'user' && <div className="message-avatar user">👤</div>}
              </div>
            ))}
          </div>

          <div className="quick-queries">
            <p className="quick-label">Quick Queries:</p>
            <div className="quick-buttons">
              {quickQueries.map((query, index) => (
                <button
                  key={index}
                  className="quick-btn"
                  onClick={() => handleQuickQuery(query)}
                >
                  {query}
                </button>
              ))}
            </div>
          </div>

          <div className="input-section">
            <input
              type="text"
              className="chat-input"
              placeholder="Ask Stella anything about space weather..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
            />
            <button className="send-btn" onClick={handleSendMessage}>
              <span>Send</span>
              <span className="send-icon">→</span>
            </button>
          </div>
        </div>

        <div className="capabilities-section">
          <h2>What Stella Can Do</h2>
          <div className="capabilities-grid">
            <div className="capability-card">
              <div className="capability-icon">🔍</div>
              <h3>Smart Queries</h3>
              <p>Ask complex questions like "Show me all X-class flares from 2020-2024"</p>
            </div>
            <div className="capability-card">
              <div className="capability-icon">📈</div>
              <h3>Data Analysis</h3>
              <p>Get insights on patterns, trends, and correlations in space weather data</p>
            </div>
            <div className="capability-card">
              <div className="capability-icon">⏰</div>
              <h3>Real-Time Updates</h3>
              <p>Receive current solar activity status and predictions on demand</p>
            </div>
            <div className="capability-card">
              <div className="capability-icon">🔌</div>
              <h3>API Integration</h3>
              <p>Pro users can integrate Stella's intelligence into their applications</p>
            </div>
          </div>
        </div>

        <div className="pro-banner">
          <div className="pro-content">
            <div className="pro-badge">✨ PRO FEATURE</div>
            <h3>Unlock Full Potential</h3>
            <p>Upgrade to Pro for extended conversations, API access, and insider email alerts</p>
            <button className="upgrade-btn">Upgrade to Pro</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Stella;
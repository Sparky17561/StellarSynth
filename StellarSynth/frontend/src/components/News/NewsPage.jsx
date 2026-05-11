import React, { useState, useEffect } from 'react';
import { ArrowLeft, ExternalLink, Clock, Rss } from 'lucide-react';
import './NewsPage.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
const API = `${API_BASE}/api/news/`;

const formatDate = (d) => {
  try {
    return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch { return ''; }
};

// ─── Article Reader ───────────────────────────────────────────────────────────
const ArticleReader = ({ article, onBack }) => (
  <div className="news-reader">
    <button className="news-back-btn" onClick={onBack}>
      <ArrowLeft size={15} /> Back to News
    </button>

    <article className="news-reader-article">
      {article.urlToImage && (
        <div className="news-reader-img-wrap">
          <img src={article.urlToImage} alt={article.title} className="news-reader-img" />
        </div>
      )}

      <div className="news-reader-body">
        <div className="news-reader-source-row">
          <span className="news-source-badge"><Rss size={11} /> {article.source || 'Space News'}</span>
          <span className="news-reader-date"><Clock size={11} /> {formatDate(article.publishedAt)}</span>
        </div>

        <h1 className="news-reader-title">{article.title}</h1>

        <div className="news-reader-content">
          <p>{article.description}</p>
          <div className="news-reader-note">
            <p>This is a preview extracted from the RSS feed. For the full, unabridged article, visit the source.</p>
          </div>
        </div>

        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="news-reader-cta"
        >
          Read full article at {article.source || 'source'} <ExternalLink size={14} />
        </a>
      </div>
    </article>
  </div>
);

// ─── News List ────────────────────────────────────────────────────────────────
const NewsPage = () => {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('all');

  const FILTERS = ['all', 'solar flare', 'geomagnetic', 'aurora', 'nasa'];

  useEffect(() => {
    const fetchNews = async () => {
      try {
        const res = await fetch(API);
        if (!res.ok) throw new Error('fetch failed');
        const data = await res.json();
        setArticles(data.articles || []);
      } catch (err) {
        setError('Failed to load news. Please ensure the backend is running.');
      } finally { setLoading(false); }
    };
    fetchNews();
  }, []);

  const filtered = filter === 'all'
    ? articles
    : articles.filter(a => (a.title + ' ' + a.description).toLowerCase().includes(filter));

  if (selected) return <ArticleReader article={selected} onBack={() => setSelected(null)} />;

  return (
    <div className="news-page">
      <div className="news-hero">
        <div>
          <h1>Space & Solar Weather News</h1>
          <p>Live feed from NOAA, NASA, and Space.com — filtered for solar relevance.</p>
        </div>
      </div>

      {/* Filters */}
      <div className="news-filters">
        {FILTERS.map(f => (
          <button
            key={f}
            className={`news-filter-btn${filter === f ? ' active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {loading && (
        <div className="news-skeleton-grid">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="news-skeleton-card">
              <div className="skeleton-img" />
              <div className="skeleton-body">
                <div className="skeleton-line short" />
                <div className="skeleton-line" />
                <div className="skeleton-line" />
                <div className="skeleton-line shorter" />
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <div className="news-error">{error}</div>}

      {!loading && !error && (
        <>
          {filtered.length === 0 && (
            <div className="news-empty">No articles found for "{filter}"</div>
          )}
          <div className="news-grid">
            {filtered.map((article, i) => (
              <div key={i} className="news-card" onClick={() => setSelected(article)}>
                <div className="news-card-img-wrap">
                  <img
                    src={article.urlToImage}
                    alt={article.title}
                    className="news-card-img"
                    onError={e => { e.target.src = 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&q=80&w=600'; }}
                  />
                </div>
                <div className="news-card-body">
                  <div className="news-source-badge">
                    <Rss size={10} /> {article.source || 'Space News'}
                  </div>
                  <h3 className="news-card-title">{article.title}</h3>
                  <p className="news-card-desc">{article.description}</p>
                  <div className="news-card-footer">
                    <span className="news-card-date"><Clock size={11} /> {formatDate(article.publishedAt)}</span>
                    <span className="news-read-more">Read more →</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default NewsPage;

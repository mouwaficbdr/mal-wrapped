import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Sparkles, Star, TrendingUp, Clock, Tv, BookOpen, Users, Award } from 'lucide-react';

function generateCodeVerifier(length = 128) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const CLIENT_ID = process.env.NEXT_PUBLIC_MAL_CLIENT_ID || 'your_client_id';
const AUTH_URL = 'https://myanimelist.net/v1/oauth2/authorize';

export default function MALWrapped() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [username, setUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState('');
  const [animeList, setAnimeList] = useState([]);
  const [mangaList, setMangaList] = useState([]);
  const [userData, setUserData] = useState(null);
  const [error, setError] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [stats, setStats] = useState(null);

  const slides = stats ? [
    { id: 'welcome' },
    { id: 'year_summary' },
    { id: 'top_genre' },
    { id: 'top_shows' },
    { id: 'watch_time' },
    { id: 'top_studio' },
    { id: 'hidden_gems' },
    { id: 'seasonal' },
    { id: 'community' },
    { id: 'manga_summary' },
    { id: 'top_manga' },
    { id: 'manga_genres' },
    { id: 'manga_authors' },
    { id: 'finale' },
  ] : [];

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const errorParam = urlParams.get('error');
    const errorDescription = urlParams.get('error_description');
    const storedVerifier = localStorage.getItem('pkce_verifier');
    const storedToken = localStorage.getItem('mal_access_token');

    if (errorParam) {
      setError(`Authorization failed: ${errorDescription || errorParam}`);
      window.history.replaceState({}, document.title, window.location.pathname);
      localStorage.removeItem('pkce_verifier');
      return;
    }

    if (code && storedVerifier) {
      exchangeCodeForToken(code, storedVerifier);
    } else if (code && !storedVerifier) {
      setError('Authorization session expired. Please try connecting again.');
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (storedToken) {
      fetchUserData(storedToken);
    }
  }, []);

  async function exchangeCodeForToken(code, verifier) {
    setIsLoading(true);
    setError('');
    setLoadingProgress('Connecting to MAL...');
    
    try {
      const response = await fetch('/api/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, code_verifier: verifier }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Authentication failed');
      }

      const data = await response.json();
      localStorage.setItem('mal_access_token', data.access_token);
      if (data.refresh_token) localStorage.setItem('mal_refresh_token', data.refresh_token);
      localStorage.removeItem('pkce_verifier');
      window.history.replaceState({}, document.title, window.location.pathname);

      await fetchUserData(data.access_token);
      setIsAuthenticated(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchUserData(accessToken) {
    setIsLoading(true);
    setLoadingProgress('Fetching your profile...');
    
    try {
      const response = await fetch('/api/mal/user', {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });

      if (!response.ok) throw new Error('Failed to fetch user data');
      const data = await response.json();
      
      setUsername(data.name);
      setUserData(data);
      
      await fetchAnimeList(accessToken);
      await fetchMangaList(accessToken);
      
      setIsAuthenticated(true);
    } catch (err) {
      setError(err.message);
      localStorage.removeItem('mal_access_token');
    } finally {
      setIsLoading(false);
    }
  }

  async function fetchAnimeList(accessToken) {
    setLoadingProgress('Loading your anime list...');
    try {
      let allAnime = [];
      let offset = 0;
      const limit = 100;

      while (true) {
        const response = await fetch(`/api/mal/animelist?offset=${offset}&limit=${limit}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        });

        if (!response.ok) break;
        const data = await response.json();
        
        if (!data.data || data.data.length === 0) break;
        allAnime = [...allAnime, ...data.data];
        
        if (!data.paging?.next) break;
        offset += limit;
      }

      setAnimeList(allAnime);
      calculateStats(allAnime, []);
    } catch (err) {
      console.error('Error fetching anime list:', err);
    }
  }

  async function fetchMangaList(accessToken) {
    setLoadingProgress('Loading your manga list...');
    try {
      let allManga = [];
      let offset = 0;
      const limit = 100;

      while (true) {
        const response = await fetch(`/api/mal/mangalist?offset=${offset}&limit=${limit}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        });

        if (!response.ok) break;
        const data = await response.json();
        
        if (!data.data || data.data.length === 0) break;
        allManga = [...allManga, ...data.data];
        
        if (!data.paging?.next) break;
        offset += limit;
      }

      setMangaList(allManga);
      calculateStats(animeList, allManga);
    } catch (err) {
      console.error('Error fetching manga list:', err);
    }
  }

  function calculateStats(anime, manga) {
    const currentYear = 2025;
    
    // Filter anime from current year
    const thisYearAnime = anime.filter(item => {
      const startDate = item.node?.start_date;
      return startDate && new Date(startDate).getFullYear() === currentYear;
    });

    // Get completed anime with ratings
    const completedAnime = anime.filter(item => 
      item.list_status?.status === 'completed' && item.list_status?.score > 0
    );

    // Calculate genres
    const genreCounts = {};
    anime.forEach(item => {
      item.node?.genres?.forEach(genre => {
        genreCounts[genre.name] = (genreCounts[genre.name] || 0) + 1;
      });
    });

    const topGenres = Object.entries(genreCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Calculate studios
    const studioCounts = {};
    anime.forEach(item => {
      item.node?.studios?.forEach(studio => {
        studioCounts[studio.name] = (studioCounts[studio.name] || 0) + 1;
      });
    });

    const topStudios = Object.entries(studioCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Top rated shows
    const topRated = completedAnime
      .sort((a, b) => b.list_status.score - a.list_status.score)
      .slice(0, 5);

    // Hidden gems (high rating, low popularity)
    const hiddenGems = completedAnime
      .filter(item => 
        item.list_status.score >= 8 && 
        item.node?.num_list_users < 100000
      )
      .sort((a, b) => b.list_status.score - a.list_status.score)
      .slice(0, 5);

    // Watch time calculation
    const totalEpisodes = anime.reduce((sum, item) => 
      sum + (item.list_status?.num_episodes_watched || 0), 0
    );
    const avgEpisodeLength = 24; // minutes
    const totalMinutes = totalEpisodes * avgEpisodeLength;
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);

    // Manga stats
    const completedManga = manga.filter(item => 
      item.list_status?.status === 'completed' && item.list_status?.score > 0
    );

    const topManga = completedManga
      .sort((a, b) => b.list_status.score - a.list_status.score)
      .slice(0, 5);

    // Manga authors
    const authorCounts = {};
    manga.forEach(item => {
      item.node?.authors?.forEach(author => {
        const name = author.node?.first_name + ' ' + author.node?.last_name;
        authorCounts[name] = (authorCounts[name] || 0) + 1;
      });
    });

    const topAuthors = Object.entries(authorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Manga genres
    const mangaGenreCounts = {};
    manga.forEach(item => {
      item.node?.genres?.forEach(genre => {
        mangaGenreCounts[genre.name] = (mangaGenreCounts[genre.name] || 0) + 1;
      });
    });

    const topMangaGenres = Object.entries(mangaGenreCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    setStats({
      thisYearAnime,
      totalAnime: anime.length,
      totalManga: manga.length,
      topGenres,
      topStudios,
      topRated,
      hiddenGems,
      watchTime: { days, hours, totalMinutes },
      completedCount: completedAnime.length,
      topManga,
      topAuthors,
      topMangaGenres,
    });
  }

  async function handleBegin() {
    setIsLoading(true);
    setError('');

    try {
      const verifier = generateCodeVerifier();
      localStorage.setItem('pkce_verifier', verifier);

      const params = new URLSearchParams({
        response_type: 'code',
        client_id: CLIENT_ID,
        code_challenge: verifier,
      });

      window.location.href = `${AUTH_URL}?${params.toString()}`;
    } catch (err) {
      setError(err.message);
      setIsLoading(false);
    }
  }

  function SlideContent({ slide }) {
    if (!slide || !stats) return null;

    const colors = ['#FF1493', '#00CED1', '#FFD700', '#FF6347', '#9370DB', '#00FA9A'];
    
    switch (slide.id) {
      case 'welcome':
        return (
          <div className="slide-card bg-gradient-pink">
            <Sparkles className="float-icon" size={48} />
            <h2 className="text-6xl font-black mb-6 text-shadow">Hi, {username}!</h2>
            <p className="text-2xl font-medium">Your 2025 Anime Year in Review</p>
            <div className="pulse-circle" style={{top: '10%', left: '80%'}}></div>
          </div>
        );

      case 'year_summary':
        return (
          <div className="slide-card bg-gradient-cyan">
            <Tv className="float-icon" size={48} />
            <h2 className="text-5xl font-black mb-4">You Watched</h2>
            <div className="stat-box">
              <div className="text-7xl font-black text-yellow-300">{stats.thisYearAnime.length}</div>
              <div className="text-2xl mt-2">series in 2025</div>
            </div>
            <div className="decorative-shape" style={{background: '#FF1493'}}></div>
          </div>
        );

      case 'top_genre':
        return (
          <div className="slide-card bg-gradient-purple">
            <TrendingUp className="float-icon" size={48} />
            <h2 className="text-5xl font-black mb-6">Your Top Genres</h2>
            <div className="genre-list">
              {stats.topGenres.map(([genre, count], idx) => (
                <div key={genre} className="genre-card" style={{
                  background: colors[idx],
                  animationDelay: `${idx * 0.1}s`
                }}>
                  <div className="text-2xl font-bold">{genre}</div>
                  <div className="text-lg opacity-90">{count} shows</div>
                </div>
              ))}
            </div>
            <div className="pulse-circle" style={{top: '20%', right: '10%'}}></div>
          </div>
        );

      case 'top_shows':
        return (
          <div className="slide-card bg-gradient-orange">
            <Star className="float-icon" size={48} />
            <h2 className="text-5xl font-black mb-6">Your Favorite Shows</h2>
            <div className="show-list">
              {stats.topRated.slice(0, 5).map((item, idx) => (
                <div key={item.node.id} className="show-item" style={{animationDelay: `${idx * 0.1}s`}}>
                  <div className="show-rank">{idx + 1}</div>
                  <div className="show-info">
                    <div className="show-title">{item.node.title}</div>
                    <div className="show-score">⭐ {item.list_status.score}/10</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'watch_time':
        return (
          <div className="slide-card bg-gradient-teal">
            <Clock className="float-icon" size={48} />
            <h2 className="text-5xl font-black mb-4">Time Spent</h2>
            <div className="stat-box">
              <div className="text-7xl font-black text-pink-300">{stats.watchTime.days}</div>
              <div className="text-2xl">days</div>
              <div className="text-4xl font-bold text-yellow-300 mt-4">{stats.watchTime.hours}</div>
              <div className="text-xl">hours</div>
            </div>
            <p className="text-xl mt-6 opacity-90">in anime worlds!</p>
            <div className="decorative-shape" style={{background: '#FFD700', right: '10%'}}></div>
          </div>
        );

      case 'top_studio':
        return (
          <div className="slide-card bg-gradient-blue">
            <Award className="float-icon" size={48} />
            <h2 className="text-5xl font-black mb-6">Favorite Studios</h2>
            <div className="studio-list">
              {stats.topStudios.map(([studio, count], idx) => (
                <div key={studio} className="studio-card" style={{
                  background: colors[idx % colors.length],
                  animationDelay: `${idx * 0.1}s`
                }}>
                  <div className="text-xl font-bold">{studio}</div>
                  <div className="text-sm opacity-90">{count} shows</div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'hidden_gems':
        return (
          <div className="slide-card bg-gradient-violet">
            <Sparkles className="float-icon" size={48} />
            <h2 className="text-5xl font-black mb-6">Hidden Gems</h2>
            <p className="text-xl mb-6">Underrated shows you loved</p>
            <div className="gem-list">
              {stats.hiddenGems.slice(0, 3).map((item, idx) => (
                <div key={item.node.id} className="gem-card" style={{animationDelay: `${idx * 0.15}s`}}>
                  <div className="gem-title">{item.node.title}</div>
                  <div className="gem-score">⭐ {item.list_status.score}/10</div>
                  <div className="gem-popularity">{item.node.num_list_users.toLocaleString()} users</div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'seasonal':
        return (
          <div className="slide-card bg-gradient-pink">
            <TrendingUp className="float-icon" size={48} />
            <h2 className="text-5xl font-black mb-4">Seasonal Highlight</h2>
            <div className="stat-box">
              <div className="text-2xl text-cyan-300 mb-2">Winter 2025</div>
              <div className="text-5xl font-black">{stats.thisYearAnime.length}</div>
              <div className="text-xl mt-2">new shows watched</div>
            </div>
            <div className="pulse-circle" style={{bottom: '20%', left: '15%'}}></div>
          </div>
        );

      case 'community':
        return (
          <div className="slide-card bg-gradient-green">
            <Users className="float-icon" size={48} />
            <h2 className="text-5xl font-black mb-6">Community Stats</h2>
            <div className="stat-grid">
              <div className="stat-item">
                <div className="text-5xl font-black text-yellow-300">{stats.completedCount}</div>
                <div className="text-lg">Completed</div>
              </div>
              <div className="stat-item">
                <div className="text-5xl font-black text-pink-300">{stats.totalAnime}</div>
                <div className="text-lg">Total Anime</div>
              </div>
            </div>
            <p className="text-xl mt-6">Keep going, otaku! 🎌</p>
          </div>
        );

      case 'manga_summary':
        return (
          <div className="slide-card bg-gradient-orange">
            <BookOpen className="float-icon" size={48} />
            <h2 className="text-5xl font-black mb-4">Your Manga Journey</h2>
            <div className="stat-box">
              <div className="text-7xl font-black text-cyan-300">{stats.totalManga}</div>
              <div className="text-2xl mt-2">manga titles</div>
            </div>
            <p className="text-xl mt-6 opacity-90">You're a true reader! 📚</p>
            <div className="decorative-shape" style={{background: '#FF6347'}}></div>
          </div>
        );

      case 'top_manga':
        return (
          <div className="slide-card bg-gradient-purple">
            <Star className="float-icon" size={48} />
            <h2 className="text-5xl font-black mb-6">Top Manga</h2>
            <div className="show-list">
              {stats.topManga.slice(0, 5).map((item, idx) => (
                <div key={item.node.id} className="show-item" style={{animationDelay: `${idx * 0.1}s`}}>
                  <div className="show-rank">{idx + 1}</div>
                  <div className="show-info">
                    <div className="show-title">{item.node.title}</div>
                    <div className="show-score">⭐ {item.list_status.score}/10</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'manga_genres':
        return (
          <div className="slide-card bg-gradient-teal">
            <TrendingUp className="float-icon" size={48} />
            <h2 className="text-5xl font-black mb-6">Manga Genres</h2>
            <div className="genre-list">
              {stats.topMangaGenres.map(([genre, count], idx) => (
                <div key={genre} className="genre-card" style={{
                  background: colors[idx],
                  animationDelay: `${idx * 0.1}s`
                }}>
                  <div className="text-2xl font-bold">{genre}</div>
                  <div className="text-lg opacity-90">{count} titles</div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'manga_authors':
        return (
          <div className="slide-card bg-gradient-cyan">
            <Award className="float-icon" size={48} />
            <h2 className="text-5xl font-black mb-6">Favorite Authors</h2>
            <div className="studio-list">
              {stats.topAuthors.map(([author, count], idx) => (
                <div key={author} className="studio-card" style={{
                  background: colors[idx % colors.length],
                  animationDelay: `${idx * 0.1}s`
                }}>
                  <div className="text-xl font-bold">{author}</div>
                  <div className="text-sm opacity-90">{count} works</div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'finale':
        return (
          <div className="slide-card bg-gradient-rainbow">
            <Sparkles className="float-icon" size={60} />
            <h2 className="text-6xl font-black mb-6 text-shadow">Thank You!</h2>
            <p className="text-3xl font-bold mb-4">MAL Wrapped 2025</p>
            <p className="text-xl opacity-90">Let's make 2026 even more epic! 🎉</p>
            <div className="pulse-circle" style={{top: '15%', right: '15%'}}></div>
            <div className="pulse-circle" style={{bottom: '15%', left: '15%'}}></div>
            <div className="decorative-shape"></div>
          </div>
        );

      default:
        return null;
    }
  }

  return (
    <>
      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-20px) rotate(5deg); }
        }
        
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.2); opacity: 0.3; }
        }
        
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(50px); }
          to { opacity: 1; transform: translateX(0); }
        }
        
        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        body {
          background: #0a0a0a;
          color: white;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          overflow-x: hidden;
        }
        
        .slide-card {
          width: 100%;
          min-height: 600px;
          padding: 3rem;
          border-radius: 32px;
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
          animation: slideIn 0.5s ease-out;
        }
        
        .bg-gradient-pink {
          background: linear-gradient(135deg, #FF1493 0%, #FF6B9D 100%);
        }
        
        .bg-gradient-cyan {
          background: linear-gradient(135deg, #00CED1 0%, #20B2AA 100%);
        }
        
        .bg-gradient-purple {
          background: linear-gradient(135deg, #9370DB 0%, #8A2BE2 100%);
        }
        
        .bg-gradient-orange {
          background: linear-gradient(135deg, #FF6347 0%, #FF8C00 100%);
        }
        
        .bg-gradient-teal {
          background: linear-gradient(135deg, #008080 0%, #20B2AA 100%);
        }
        
        .bg-gradient-blue {
          background: linear-gradient(135deg, #4169E1 0%, #1E90FF 100%);
        }
        
        .bg-gradient-violet {
          background: linear-gradient(135deg, #8B00FF 0%, #9370DB 100%);
        }
        
        .bg-gradient-green {
          background: linear-gradient(135deg, #00FA9A 0%, #3CB371 100%);
        }
        
        .bg-gradient-rainbow {
          background: linear-gradient(135deg, #FF1493 0%, #00CED1 25%, #FFD700 50%, #9370DB 75%, #FF6347 100%);
        }
        
        .float-icon {
          position: absolute;
          top: 2rem;
          right: 2rem;
          animation: float 3s ease-in-out infinite;
          opacity: 0.8;
        }
        
        .pulse-circle {
          position: absolute;
          width: 150px;
          height: 150px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.2);
          animation: pulse 2s ease-in-out infinite;
        }
        
        .decorative-shape {
          position: absolute;
          width: 100px;
          height: 100px;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.15);
          transform: rotate(45deg);
          bottom: 10%;
          right: 5%;
        }
        
        .text-shadow {
          text-shadow: 4px 4px 12px rgba(0, 0, 0, 0.3);
        }
        
        .stat-box {
          background: rgba(0, 0, 0, 0.2);
          padding: 2rem 3rem;
          border-radius: 24px;
          backdrop-filter: blur(10px);
          border: 2px solid rgba(255, 255, 255, 0.1);
        }
        
        .genre-list, .studio-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          width: 100%;
          max-width: 500px;
        }
        
        .genre-card, .studio-card {
          padding: 1.5rem 2rem;
          border-radius: 20px;
          text-align: center;
          font-weight: bold;
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
          animation: slideInRight 0.5s ease-out;
          transition: transform 0.2s;
        }
        
        .genre-card:hover, .studio-card:hover {
          transform: translateX(10px) scale(1.05);
        }
        
        .show-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          width: 100%;
          max-width: 600px;
        }
        
        .show-item {
          display: flex;
          align-items: center;
          gap: 1.5rem;
          padding: 1.5rem;
          background: rgba(0, 0, 0, 0.3);
          border-radius: 16px;
          backdrop-filter: blur(10px);
          border: 2px solid rgba(255, 255, 255, 0.1);
          animation: slideIn 0.5s ease-out;
          transition: transform 0.2s;
        }
        
        .show-item:hover {
          transform: translateX(10px);
        }
        
        .show-rank {
          font-size: 2rem;
          font-weight: 900;
          min-width: 50px;
          text-align: center;
          color: #FFD700;
        }
        
        .show-info {
          flex: 1;
          text-align: left;
        }
        
        .show-title {
          font-size: 1.25rem;
          font-weight: bold;
          margin-bottom: 0.5rem;
        }
        
        .show-score {
          font-size: 1rem;
          opacity: 0.9;
        }
        
        .gem-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          width: 100%;
          max-width: 500px;
        }
        
        .gem-card {
          padding: 1.5rem;
          background: rgba(0, 0, 0, 0.3);
          border-radius: 16px;
          backdrop-filter: blur(10px);
          border: 2px solid rgba(255, 255, 255, 0.1);
          animation: slideIn 0.5s ease-out;
          text-align: center;
        }
        
        .gem-title {
          font-size: 1.25rem;
          font-weight: bold;
          margin-bottom: 0.5rem;
        }
        
        .gem-score {
          font-size: 1rem;
          color: #FFD700;
          margin-bottom: 0.25rem;
        }
        
        .gem-popularity {
          font-size: 0.9rem;
          opacity: 0.7;
        }
        
        .stat-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 2rem;
          margin: 2rem 0;
        }
        
        .stat-item {
          background: rgba(0, 0, 0, 0.2);
          padding: 2rem;
          border-radius: 20px;
          backdrop-filter: blur(10px);
          border: 2px solid rgba(255, 255, 255, 0.1);
        }
        
        .nav-button {
          padding: 1rem 2rem;
          border-radius: 50px;
          border: none;
          font-weight: bold;
          font-size: 1rem;
          cursor: pointer;
          transition: all 0.3s;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
        }
        
        .nav-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
        }
        
        .nav-button:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }
        
        .nav-prev {
          background: rgba(255, 255, 255, 0.2);
          color: white;
        }
        
        .nav-next {
          background: linear-gradient(135deg, #FF1493, #FF6B9D);
          color: white;
        }
        
        .progress-dots {
          display: flex;
          gap: 0.75rem;
          justify-content: center;
          flex-wrap: wrap;
        }
        
        .progress-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.3);
          transition: all 0.3s;
        }
        
        .progress-dot.active {
          background: #FF1493;
          transform: scale(1.5);
          box-shadow: 0 0 15px rgba(255, 20, 147, 0.6);
        }
        
        .cta-button {
          padding: 1.25rem 3rem;
          border-radius: 50px;
          border: none;
          font-weight: 900;
          font-size: 1.25rem;
          cursor: pointer;
          transition: all 0.3s;
          box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
          background: linear-gradient(135deg, #9370DB, #8A2BE2);
          color: white;
        }
        
        .cta-button:hover:not(:disabled) {
          transform: translateY(-4px) scale(1.05);
          box-shadow: 0 12px 35px rgba(147, 112, 219, 0.5);
        }
        
        .cta-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .error-box {
          background: rgba(220, 38, 38, 0.9);
          padding: 1.5rem;
          border-radius: 20px;
          margin-bottom: 2rem;
          border: 2px solid rgba(255, 255, 255, 0.2);
          font-weight: 600;
        }
        
        .loading-text {
          font-size: 1.5rem;
          color: #00CED1;
          animation: pulse 2s ease-in-out infinite;
        }
        
        @media (max-width: 768px) {
          .slide-card { padding: 2rem; min-height: 500px; }
          h2 { font-size: 2.5rem !important; }
          .stat-box { padding: 1.5rem 2rem; }
          .show-rank { font-size: 1.5rem; min-width: 40px; }
          .show-title { font-size: 1rem; }
          .stat-grid { grid-template-columns: 1fr; gap: 1rem; }
        }
      `}</style>
      
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #16213e 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem'
      }}>
        <div style={{
          background: 'rgba(0, 0, 0, 0.6)',
          borderRadius: '32px',
          padding: '3rem',
          maxWidth: '900px',
          width: '100%',
          backdropFilter: 'blur(20px)',
          border: '2px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 25px 80px rgba(0, 0, 0, 0.5)'
        }}>
          {error && (
            <div className="error-box">
              <p style={{whiteSpace: 'pre-line', fontSize: '0.95rem'}}>{error}</p>
            </div>
          )}
          
          {isLoading && (
            <div style={{textAlign: 'center', padding: '2rem'}}>
              <div className="loading-text">{loadingProgress || 'Loading...'}</div>
            </div>
          )}
          
          {!isAuthenticated && !isLoading && (
            <div style={{textAlign: 'center'}}>
              <div style={{
                marginBottom: '2rem',
                animation: 'float 3s ease-in-out infinite'
              }}>
                <Sparkles size={64} style={{color: '#9370DB'}} />
              </div>
              
              <h1 style={{
                fontSize: '4rem',
                fontWeight: 900,
                marginBottom: '1.5rem',
                background: 'linear-gradient(135deg, #FF1493, #00CED1, #FFD700)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                textShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
              }}>
                MAL Wrapped 2025
              </h1>
              
              <p style={{
                fontSize: '1.5rem',
                marginBottom: '3rem',
                color: '#00CED1'
              }}>
                Your anime year in review ✨
              </p>
              
              <button onClick={handleBegin} className="cta-button" disabled={!CLIENT_ID}>
                Connect with MAL
              </button>
              
              <div style={{
                marginTop: '2rem',
                padding: '1rem',
                background: 'rgba(147, 112, 219, 0.1)',
                borderRadius: '16px',
                fontSize: '0.9rem',
                color: '#9370DB'
              }}>
                ✓ Secure authentication<br />
                ✓ View your complete stats<br />
                ✓ Discover your anime journey
              </div>
            </div>
          )}
          
          {isAuthenticated && stats && (
            <>
              <SlideContent slide={slides[currentSlide]} />
              
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '2rem',
                gap: '1rem'
              }}>
                <button
                  className="nav-button nav-prev"
                  onClick={() => setCurrentSlide(Math.max(0, currentSlide - 1))}
                  disabled={currentSlide === 0}
                >
                  <ChevronLeft size={20} />
                  Prev
                </button>
                
                <div className="progress-dots">
                  {slides.map((slide, idx) => (
                    <div
                      key={slide.id}
                      className={`progress-dot ${idx === currentSlide ? 'active' : ''}`}
                    />
                  ))}
                </div>
                
                <button
                  className="nav-button nav-next"
                  onClick={() => setCurrentSlide(Math.min(slides.length - 1, currentSlide + 1))}
                  disabled={currentSlide === slides.length - 1}
                >
                  Next
                  <ChevronRight size={20} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
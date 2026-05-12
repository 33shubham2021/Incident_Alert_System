import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { decodeJwt } from '../services/api';
import DashMap from '../components/DashMap';

const TICKER_MSGS = [
  '🔴 Heavy Traffic on A40 Westbound — 40 min delay  ·  ',
  '🟠 Accident cleared on Clapham High St  ·  ',
  '🟡 Road Closure: Waterloo Bridge until 18:00 — use alternative routes  ·  ',
  '🔵 Heavy Rain Warning in effect — reduce speed on A10 North  ·  ',
  '🟠 Construction work on Vauxhall Bridge — expect delays  ·  ',
  '🔴 Major congestion on City Road — 15 min delay  ·  ',
];

const INITIAL_PLACES = [
  { id: 1, name: 'London',   country: 'United Kingdom', emoji: '🇬🇧', bg: '#eef1ff', alerts: 4 },
  { id: 2, name: 'New York', country: 'United States',  emoji: '🇺🇸', bg: '#fff1f0', alerts: 7 },
  { id: 3, name: 'Tokyo',    country: 'Japan',          emoji: '🇯🇵', bg: '#fff7ed', alerts: 2 },
  { id: 4, name: 'Paris',    country: 'France',         emoji: '🇫🇷', bg: '#f0f9ff', alerts: 3 },
  { id: 5, name: 'Sydney',   country: 'Australia',      emoji: '🇦🇺', bg: '#f0fdf4', alerts: 1 },
];

function getFlagEmoji(code) {
  if (!code || code.length !== 2) return '📍';
  const offset = 127397;
  return String.fromCodePoint(...code.split('').map((c) => c.charCodeAt(0) + offset));
}

function getGreeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning,' : h < 17 ? 'Good afternoon,' : 'Good evening,';
}

function InlineMsg({ msg }) {
  if (!msg.text) return null;
  return <div className={`inline-msg ${msg.type}`}>{msg.text}</div>;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { token, logout } = useAuth();

  // Enable scrolling on dashboard, restore on leave
  useEffect(() => {
    document.documentElement.style.height   = 'auto';
    document.documentElement.style.overflow = 'auto';
    document.body.style.height              = 'auto';
    document.body.style.overflow            = 'auto';
    document.body.classList.add('dashboard-body');
    return () => {
      document.documentElement.style.height   = '';
      document.documentElement.style.overflow = '';
      document.body.style.height              = '';
      document.body.style.overflow            = '';
      document.body.classList.remove('dashboard-body');
    };
  }, []);

  // Decode JWT for user info
  const decoded = token ? decodeJwt(token) : null;
  const payload = decoded?.payload || {};
  const rawName = payload.name || payload.sub || 'User';
  const nameParts = rawName.split(' ');
  const firstName = nameParts[0] || 'User';
  const lastName  = nameParts.slice(1).join(' ') || '';
  const userEmail = payload.email || payload.sub || '—';
  const userPhone = payload.mobile_number || payload.phone || '+44 7700 900123';
  const avatarInitials = (firstName[0] + (lastName[0] || '')).toUpperCase();

  // Subscribed places
  const [places,   setPlaces]   = useState(INITIAL_PLACES);
  const [phone,    setPhone]    = useState(userPhone);
  const [newPhone, setNewPhone] = useState('');
  const [phoneMsg, setPhoneMsg] = useState({ text: '', type: '' });

  // Place search
  const [placeSearch,  setPlaceSearch]  = useState('');
  const [suggestions,  setSuggestions]  = useState([]);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [subscribeMsg, setSubscribeMsg] = useState({ text: '', type: '' });
  const searchTimeout = useRef(null);

  // Test notification
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifMsg,     setNotifMsg]     = useState({ text: '', type: '' });

  function showTimed(setter, msg, ms = 3500) {
    setter(msg);
    setTimeout(() => setter({ text: '', type: '' }), ms);
  }

  function handleLogout() {
    logout();
    navigate('/', { replace: true });
  }

  function handlePhoneUpdate(e) {
    e.preventDefault();
    if (!newPhone.trim()) {
      showTimed(setPhoneMsg, { text: 'Please enter a phone number.', type: 'error' });
      return;
    }
    setPhone(newPhone.trim());
    setNewPhone('');
    showTimed(setPhoneMsg, { text: 'Phone number updated successfully!', type: 'success' });
  }

  function removePlace(id) {
    setPlaces((prev) => prev.filter((p) => p.id !== id));
  }

  function handlePlaceInput(val) {
    setPlaceSearch(val);
    setSelectedPlace(null);
    clearTimeout(searchTimeout.current);

    if (!val.trim() || val.length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    setSuggestions([{ loading: true }]);
    setShowDropdown(true);
    searchTimeout.current = setTimeout(() => fetchSuggestions(val), 360);
  }

  async function fetchSuggestions(query) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=7&addressdetails=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await res.json();
      if (!data.length) { setSuggestions([]); return; }

      const items = data.map((item) => {
        const addr    = item.address || {};
        const city    = addr.city || addr.town || addr.village || addr.county || item.display_name.split(',')[0];
        const country = addr.country || '';
        const code    = (addr.country_code || '').toUpperCase();
        const flag    = getFlagEmoji(code);
        return { name: city, country, emoji: flag, bg: '#f1f4f9', alerts: 0,
          lat: +item.lat, lng: +item.lon, label: `${flag} ${city}${country ? ', ' + country : ''}` };
      });
      setSuggestions(items);
    } catch {
      setSuggestions([]);
    }
  }

  function selectSuggestion(place) {
    setSelectedPlace(place);
    setPlaceSearch(place.label);
    setShowDropdown(false);
  }

  function handleSubscribe() {
    const query = placeSearch.trim();
    if (!query) {
      showTimed(setSubscribeMsg, { text: 'Please search and select a place first.', type: 'error' });
      return;
    }
    const name = selectedPlace ? selectedPlace.name : query.split(',')[0].trim();
    if (places.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      showTimed(setSubscribeMsg, { text: `Already subscribed to ${name}.`, type: 'error' });
      return;
    }
    setPlaces((prev) => [
      ...prev,
      { id: Date.now(), name, country: selectedPlace?.country || '', emoji: selectedPlace?.emoji || '📍', bg: '#f1f4f9', alerts: 0 },
    ]);
    setPlaceSearch('');
    setSelectedPlace(null);
    showTimed(setSubscribeMsg, { text: `Subscribed to ${name}!`, type: 'success' });
  }

  async function handleTestNotification() {
    setNotifLoading(true);
    setNotifMsg({ text: '', type: '' });
    try {
      await new Promise((r) => setTimeout(r, 1200)); // replace with real API call
      showTimed(
        setNotifMsg,
        { text: `✓ Test alert sent! Please check your SMS on ${phone} for the alert message.`, type: 'success' },
        4000
      );
    } catch {
      showTimed(setNotifMsg, { text: 'Failed to send test alert — please try again.', type: 'error' });
    } finally {
      setNotifLoading(false);
    }
  }

  const placeCount = places.length;

  return (
    <>
      {/* ── Top bar ── */}
      <header className="topbar">
        <div className="topbar-brand">
          <div className="brand-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </div>
          <span className="brand-name">AlertMap</span>
          <span className="brand-sub">Real-Time Intelligence</span>
        </div>

        <div className="topbar-pills">
          <span className="pill pill-traffic"><span className="dot dot-red" /> Traffic</span>
          <span className="pill pill-climate"><span className="dot dot-blue" /> Climate</span>
          <span className="pill pill-closure"><span className="dot dot-amber" /> Closures</span>
          <span className="pill pill-accident"><span className="dot dot-orange" /> Accidents</span>
        </div>

        <div className="topbar-right">
          <button className="dash-logout-btn" onClick={handleLogout}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Logout
          </button>
        </div>
      </header>

      {/* ── Dashboard content ── */}
      <main className="dash-main">

        {/* Welcome card */}
        <div className="welcome-card">
          <div className="welcome-card-accent" />
          <div className="wc-left">
            <div className="welcome-avatar-wrap">
              <div className="welcome-avatar">{avatarInitials || 'U'}</div>
              <div className="online-dot" />
            </div>
            <div className="welcome-text">
              <p className="welcome-greeting">{getGreeting()}</p>
              <h2 className="welcome-name">{firstName} {lastName}</h2>
              <div className="welcome-badge"><span className="badge-dot" />Active subscriber</div>
            </div>
          </div>

          <div className="wc-divider" />

          <div className="wc-details">
            <div className="detail-row">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              <span>{userEmail}</span>
            </div>
            <div className="detail-row">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.18 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.54a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.5 16z" />
              </svg>
              <span>{phone}</span>
            </div>
            <div className="detail-row">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span>Member since January 2024</span>
            </div>
          </div>

          <div className="wc-divider" />

          <div className="wc-stats">
            <div className="wc-stat">
              <span className="wcs-value" style={{ color: 'var(--accent)' }}>{placeCount}</span>
              <span className="wcs-label">Places</span>
            </div>
            <div className="wcs-sep" />
            <div className="wc-stat">
              <span className="wcs-value" style={{ color: 'var(--red)' }}>12</span>
              <span className="wcs-label">Alerts</span>
            </div>
            <div className="wcs-sep" />
            <div className="wc-stat">
              <span className="wcs-value" style={{ color: 'var(--green)' }}>98%</span>
              <span className="wcs-label">Uptime</span>
            </div>
          </div>
        </div>

        {/* Subscribed Places */}
        <section className="dash-section">
          <div className="section-header">
            <div className="section-title-wrap">
              <div className="section-icon" style={{ background: 'linear-gradient(135deg,var(--accent),#7c3aed)' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                </svg>
              </div>
              <h3 className="section-title">Subscribed Places</h3>
            </div>
            <span className="section-badge">{placeCount} place{placeCount !== 1 ? 's' : ''}</span>
          </div>

          <div className="places-grid">
            {places.map((p) => {
              const alertClass = p.alerts === 0 ? 'chip-alerts-none' : p.alerts <= 3 ? 'chip-alerts-low' : 'chip-alerts-high';
              return (
                <div key={p.id} className="place-chip">
                  <div className="place-chip-icon" style={{ background: p.bg }}>{p.emoji}</div>
                  <div className="place-chip-info">
                    <div className="place-chip-name">{p.name}</div>
                    <div className="place-chip-sub">{p.country}</div>
                    <div className={`place-chip-alerts ${alertClass}`}>
                      {p.alerts === 0 ? '✓ No alerts' : `⚠ ${p.alerts} alert${p.alerts !== 1 ? 's' : ''}`}
                    </div>
                  </div>
                  <button className="place-chip-remove" title={`Unsubscribe from ${p.name}`} onClick={() => removePlace(p.id)}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        {/* Update Phone */}
        <section className="dash-section">
          <div className="section-header">
            <div className="section-title-wrap">
              <div className="section-icon" style={{ background: 'linear-gradient(135deg,#f59e0b,#f97316)' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.18 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.54a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.5 16z" />
                </svg>
              </div>
              <h3 className="section-title">Update Phone Number</h3>
            </div>
          </div>
          <p className="section-desc">Update your contact number to receive SMS alerts for your subscribed places.</p>
          <form className="phone-form" onSubmit={handlePhoneUpdate}>
            <div className="phone-input-row">
              <div className="input-wrap phone-input-wrap">
                <svg className="input-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.18 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.54a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.5 16z" />
                </svg>
                <input type="tel" className="field-input phone-field" placeholder="+1 234 567 8900"
                  value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
              </div>
              <button type="submit" className="btn-action">Save Number</button>
            </div>
            <InlineMsg msg={phoneMsg} />
          </form>
        </section>

        {/* Subscribe to More Places */}
        <section className="dash-section">
          <div className="section-header">
            <div className="section-title-wrap">
              <div className="section-icon" style={{ background: 'linear-gradient(135deg,#22c55e,#16a34a)' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </div>
              <h3 className="section-title">Subscribe to More Places</h3>
            </div>
          </div>
          <p className="section-desc">Search any city, region, or landmark worldwide to receive real-time alerts.</p>

          <div className="place-search-wrap" style={{ position: 'relative' }}>
            <div className="place-search-box">
              <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
              </svg>
              <input
                type="text"
                className="place-search-input"
                placeholder="Search city, country, landmark…"
                autoComplete="off"
                value={placeSearch}
                onChange={(e) => handlePlaceInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubscribe();
                  if (e.key === 'Escape') setShowDropdown(false);
                }}
              />
              <button type="button" className="search-btn" onClick={handleSubscribe}>Subscribe</button>
            </div>

            {showDropdown && (
              <ul className="place-dropdown">
                {suggestions[0]?.loading ? (
                  <li className="drop-loading">Searching…</li>
                ) : suggestions.length === 0 ? (
                  <li className="drop-loading">No results found</li>
                ) : (
                  suggestions.map((s, i) => (
                    <li key={i} onClick={() => selectSuggestion(s)}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
                      </svg>
                      <div>
                        <span className="drop-place-name">{s.emoji} {s.name}</span>
                        <span className="drop-place-country">{s.country}</span>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
          <InlineMsg msg={subscribeMsg} />
        </section>

        {/* Test Notification */}
        <section className="dash-section">
          <div className="section-header">
            <div className="section-title-wrap">
              <div className="section-icon" style={{ background: 'linear-gradient(135deg,#8b5cf6,#6d28d9)' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              </div>
              <h3 className="section-title">Test Notification</h3>
            </div>
            <span className="section-badge" style={{ background: '#f5f3ff', color: '#7c3aed', borderColor: 'rgba(124,58,237,.2)' }}>
              SMS Alert
            </span>
          </div>
          <p className="section-desc">Send a test SMS alert to your registered mobile number to verify notifications are working.</p>

          <div className="notif-test-row">
            <div className="notif-preview-pill">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="5" y="2" width="14" height="20" rx="2" ry="2" /><line x1="12" y1="18" x2="12.01" y2="18" />
              </svg>
              <span>{phone}</span>
            </div>
            <button className="btn-action notif-test-btn" disabled={notifLoading} onClick={handleTestNotification}>
              {notifLoading ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin .7s linear infinite' }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Sending…
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                  Send Test Alert
                </>
              )}
            </button>
          </div>
          <InlineMsg msg={notifMsg} />
        </section>

        {/* Live Map */}
        <section className="dash-section">
          <div className="section-header">
            <div className="section-title-wrap">
              <div className="section-icon" style={{ background: 'linear-gradient(135deg,#3b82f6,var(--accent))' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
                  <line x1="9" y1="3" x2="9" y2="18" /><line x1="15" y1="6" x2="15" y2="21" />
                </svg>
              </div>
              <h3 className="section-title">Live Alert Map</h3>
            </div>
            <div className="map-legend-inline">
              <span className="legend-item"><span className="leg-dot" style={{ background: '#ef4444' }} />Traffic</span>
              <span className="legend-item"><span className="leg-dot" style={{ background: '#3b82f6' }} />Climate</span>
              <span className="legend-item"><span className="leg-dot" style={{ background: '#f59e0b' }} />Closure</span>
              <span className="legend-item"><span className="leg-dot" style={{ background: '#f97316' }} />Accident</span>
            </div>
          </div>

          <div className="dash-ticker">
            <span className="ticker-label">LIVE</span>
            <div className="ticker-track">
              <span className="ticker-text">{TICKER_MSGS.join('')}</span>
            </div>
          </div>

          <DashMap />
        </section>

      </main>
    </>
  );
}

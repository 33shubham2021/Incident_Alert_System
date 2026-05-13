import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { decodeJwt, fetchUser, fetchSubscriptions, addSubscription, deleteSubscription, triggerDummyTest } from '../services/api';
import { ALERTS_API } from '../config';
import DashMap from '../components/DashMap';

const ALERT_EMOJIS = { TRAFFIC: '🔴', CLIMATE: '🔵', CLOSURE: '🟡', ACCIDENT: '🟠' };
const TICKER_FALLBACK = '🔴 Loading live alerts…  ·  ';

function getFlagEmoji(code) {
  if (!code || code.length !== 2) return '📍';
  const offset = 127397;
  return String.fromCodePoint(...code.split('').map((c) => c.charCodeAt(0) + offset));
}

function getGreeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning,' : h < 17 ? 'Good afternoon,' : 'Good evening,';
}

function formatMemberSince(dateStr) {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function InlineMsg({ msg }) {
  if (!msg.text) return null;
  return <div className={`inline-msg ${msg.type}`}>{msg.text}</div>;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { token, logout } = useAuth();

  // Enable scrolling on dashboard
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

  // Decode JWT for identity
  const decoded = token ? decodeJwt(token) : null;
  const jwtPayload = decoded?.payload || {};
  const mobileNumber = jwtPayload.mobileNumber || '';
  console.log(`[Dashboard] Loaded. mobileNumber from JWT: ${mobileNumber}`);

  // User info state (hydrated from API)
  const [userInfo, setUserInfo] = useState({
    name: jwtPayload.name || 'User',
    email: jwtPayload.email || '—',
    mobileNumber: mobileNumber || '—',
    createdAt: null,
  });

  // Subscriptions state
  const [subscriptions, setSubscriptions] = useState([]);
  const [subsLoading, setSubsLoading]     = useState(true);
  const [placeNames,   setPlaceNames]     = useState({});

  // Live ticker state
  const [tickerText,   setTickerText]     = useState('');

  // Place search state
  const [placeSearch,   setPlaceSearch]   = useState('');
  const [suggestions,   setSuggestions]   = useState([]);
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [showDropdown,  setShowDropdown]  = useState(false);
  const [subscribeMsg,  setSubscribeMsg]  = useState({ text: '', type: '' });
  const searchTimeout = useRef(null);

  // Test notification state
  const [notifLoading, setNotifLoading] = useState(false);
  const [notifMsg,     setNotifMsg]     = useState({ text: '', type: '' });

  // Popup state for when user has no subscriptions on dummy-test
  const [showNoSubsPopup, setShowNoSubsPopup] = useState(false);

  function showTimed(setter, msg, ms = 3500) {
    setter(msg);
    setTimeout(() => setter({ text: '', type: '' }), ms);
  }

  // Reverse-geocode subscription coordinates → human-readable place names (sequential to respect Nominatim rate limit)
  const reverseGeocodeAll = useCallback(async (subs) => {
    if (!subs.length) return;
    const results = {};
    for (let i = 0; i < subs.length; i++) {
      const sub = subs[i];
      const key = `${sub.latitude}_${sub.longitude}`;
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${sub.latitude}&lon=${sub.longitude}`,
          { headers: { 'Accept-Language': 'en' } }
        );
        const json = await res.json();
        const addr = json.address || {};
        results[key] = addr.city || addr.town || addr.village || addr.county || addr.state
          || (json.display_name || '').split(',')[0].trim()
          || `${sub.latitude.toFixed(4)}, ${sub.longitude.toFixed(4)}`;
      } catch {
        results[key] = `${sub.latitude.toFixed(4)}, ${sub.longitude.toFixed(4)}`;
      }
      if (i < subs.length - 1) await new Promise((r) => setTimeout(r, 350));
    }
    setPlaceNames((prev) => ({ ...prev, ...results }));
    console.log(`[Dashboard] Reverse-geocoded ${subs.length} subscription(s)`);
  }, []);

  // Fetch recent alerts and build live ticker text
  const loadTickerAlerts = useCallback(async () => {
    try {
      const url = `${ALERTS_API.baseUrl}${ALERTS_API.alertsPath}?minutes=${ALERTS_API.windowMinutes}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.alerts && json.alerts.length > 0) {
        const text = json.alerts
          .map((a) => `${ALERT_EMOJIS[a.alert_type] || '📍'} [${a.alert_type}] ${a.description}  ·  `)
          .join('');
        setTickerText(text);
        console.log(`[Dashboard] Ticker loaded ${json.alerts.length} alert(s) from last ${ALERTS_API.windowMinutes}min`);
      }
    } catch (err) {
      console.warn('[Dashboard] loadTickerAlerts failed:', err.message);
    }
  }, []);

  function handleLogout() {
    console.log('[Dashboard] User logging out');
    logout();
    navigate('/', { replace: true });
  }

  // Fetch user info from API server
  const loadUser = useCallback(async () => {
    if (!mobileNumber) return;
    console.log(`[Dashboard] Fetching user info for mobile=${mobileNumber}`);
    try {
      const { ok, data } = await fetchUser(mobileNumber);
      if (ok && data.user) {
        setUserInfo({
          name: data.user.name,
          email: data.user.email,
          mobileNumber: data.user.mobile_number,
          createdAt: data.user.created_at,
        });
        console.log(`[Dashboard] User info loaded: name="${data.user.name}" email="${data.user.email}"`);
      } else {
        console.warn('[Dashboard] fetchUser failed:', data.message);
      }
    } catch (err) {
      console.error('[Dashboard] fetchUser error:', err.message);
    }
  }, [mobileNumber]);

  // Fetch subscriptions from API server
  const loadSubscriptions = useCallback(async () => {
    if (!mobileNumber) {
      setSubsLoading(false);
      return;
    }
    console.log(`[Dashboard] Fetching subscriptions for mobile=${mobileNumber}`);
    setSubsLoading(true);
    try {
      const { ok, data } = await fetchSubscriptions(mobileNumber);
      if (ok) {
        const subs = data.subscriptions || [];
        setSubscriptions(subs);
        reverseGeocodeAll(subs);
        console.log(`[Dashboard] Loaded ${data.count} subscription(s)`);
      } else {
        console.warn('[Dashboard] fetchSubscriptions failed:', data.message);
        setSubscriptions([]);
      }
    } catch (err) {
      console.error('[Dashboard] fetchSubscriptions error:', err.message);
      setSubscriptions([]);
    } finally {
      setSubsLoading(false);
    }
  }, [mobileNumber, reverseGeocodeAll]);

  useEffect(() => {
    loadUser();
    loadSubscriptions();
  }, [loadUser, loadSubscriptions]);

  // Poll live ticker alerts on mount and every 60s
  useEffect(() => {
    loadTickerAlerts();
    const id = setInterval(loadTickerAlerts, ALERTS_API.pollIntervalMs);
    return () => clearInterval(id);
  }, [loadTickerAlerts]);

  // Place search via Nominatim
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
        return {
          name: city,
          country,
          emoji: flag,
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon),
          label: `${flag} ${city}${country ? ', ' + country : ''}`,
        };
      });
      setSuggestions(items);
    } catch {
      setSuggestions([]);
    }
  }

  function selectSuggestion(place) {
    console.log(`[Dashboard] Selected place: "${place.name}" lat=${place.lat} lon=${place.lng}`);
    setSelectedPlace(place);
    setPlaceSearch(place.label);
    setShowDropdown(false);
  }

  async function handleSubscribe() {
    if (!selectedPlace) {
      showTimed(setSubscribeMsg, { text: 'Please search and select a place from the list first.', type: 'error' });
      return;
    }

    if (!mobileNumber) {
      showTimed(setSubscribeMsg, { text: 'Unable to identify your account. Please log in again.', type: 'error' });
      return;
    }

    console.log(`[Dashboard] Subscribing to "${selectedPlace.name}" lat=${selectedPlace.lat} lon=${selectedPlace.lng}`);

    try {
      const { ok, data } = await addSubscription(mobileNumber, selectedPlace.lat, selectedPlace.lng, 50);
      if (ok) {
        showTimed(setSubscribeMsg, { text: `Subscribed to ${selectedPlace.name}!`, type: 'success' });
        setPlaceSearch('');
        setSelectedPlace(null);
        setSuggestions([]);
        await loadSubscriptions();
      } else {
        showTimed(setSubscribeMsg, { text: data.message || 'Failed to subscribe.', type: 'error' });
      }
    } catch (err) {
      console.error('[Dashboard] addSubscription error:', err.message);
      showTimed(setSubscribeMsg, { text: 'Network error. Please try again.', type: 'error' });
    }
  }

  async function handleRemoveSubscription(sub) {
    console.log(`[Dashboard] Removing subscription id=${sub.id} lat=${sub.latitude} lon=${sub.longitude}`);
    try {
      const { ok, data } = await deleteSubscription(mobileNumber, sub.latitude, sub.longitude);
      if (ok) {
        await loadSubscriptions();
      } else {
        console.warn('[Dashboard] deleteSubscription failed:', data.message);
      }
    } catch (err) {
      console.error('[Dashboard] deleteSubscription error:', err.message);
    }
  }

  async function handleTestNotification() {
    if (subscriptions.length === 0) {
      console.log('[Dashboard] No subscriptions — showing popup');
      setShowNoSubsPopup(true);
      return;
    }

    // Pick the first subscribed location to trigger the dummy alert
    const target = subscriptions[0];
    console.log(`[Dashboard] Triggering dummy test at lat=${target.latitude} lon=${target.longitude} (subscription id=${target.id})`);

    setNotifLoading(true);
    setNotifMsg({ text: '', type: '' });
    try {
      const { ok, data } = await triggerDummyTest(target.latitude, target.longitude);
      if (ok) {
        const { alertType, description } = data.alert;
        const smsMsg = `[AlertMap] ${alertType} ALERT: ${description} (near your subscribed location)`;
        showTimed(
          setNotifMsg,
          { text: `Message delivered to mobile number: ${userInfo.mobileNumber} with message: "${smsMsg}"`, type: 'success' },
          7000
        );
      } else {
        showTimed(setNotifMsg, { text: data.message || 'Failed to trigger test alert.', type: 'error' });
      }
    } catch (err) {
      console.error('[Dashboard] triggerDummyTest error:', err.message);
      showTimed(setNotifMsg, { text: 'Network error. Please try again.', type: 'error' });
    } finally {
      setNotifLoading(false);
    }
  }

  const nameParts   = userInfo.name.split(' ');
  const firstName   = nameParts[0] || 'User';
  const lastName    = nameParts.slice(1).join(' ') || '';
  const avatarInitials = (firstName[0] + (lastName[0] || '')).toUpperCase();
  const placeCount  = subscriptions.length;

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

        {/* Welcome / User card */}
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
              <span>{userInfo.email}</span>
            </div>
            <div className="detail-row">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.18 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.54a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.5 16z" />
              </svg>
              <span>{userInfo.mobileNumber}</span>
            </div>
            <div className="detail-row">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span>Member since {formatMemberSince(userInfo.createdAt)}</span>
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
              <span className="wcs-value" style={{ color: 'var(--red)' }}>—</span>
              <span className="wcs-label">Alerts</span>
            </div>
            <div className="wcs-sep" />
            <div className="wc-stat">
              <span className="wcs-value" style={{ color: 'var(--green)' }}>Active</span>
              <span className="wcs-label">Status</span>
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

          {subsLoading ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '.85rem', padding: '1rem 0' }}>Loading subscriptions…</p>
          ) : subscriptions.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '.85rem', padding: '1rem 0' }}>
              No subscriptions yet. Use the section below to subscribe to places.
            </p>
          ) : (
            <div className="places-grid">
              {subscriptions.map((sub) => (
                <div key={sub.id} className="place-chip">
                  <div className="place-chip-icon" style={{ background: '#f1f4f9' }}>📍</div>
                  <div className="place-chip-info">
                    <div className="place-chip-name">
                      {placeNames[`${sub.latitude}_${sub.longitude}`] || `${sub.latitude.toFixed(4)}, ${sub.longitude.toFixed(4)}`}
                    </div>
                    <div className="place-chip-sub">Radius: {sub.distance} km</div>
                    <div className="place-chip-alerts chip-alerts-none">✓ Subscribed</div>
                  </div>
                  <button
                    className="place-chip-remove"
                    title="Unsubscribe"
                    onClick={() => handleRemoveSubscription(sub)}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Update Phone — DISABLED */}
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
            <span className="section-badge" style={{ background: '#fef3c7', color: '#92400e', borderColor: 'rgba(146,64,14,.2)' }}>
              Coming Soon
            </span>
          </div>
          <p className="section-desc" style={{ color: 'var(--text-muted)' }}>
            This feature is currently under development. Your registered number is: <strong>{userInfo.mobileNumber}</strong>
          </p>
          <div className="phone-input-row">
            <div className="input-wrap phone-input-wrap" style={{ opacity: 0.5 }}>
              <svg className="input-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.18 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.54a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21.5 16z" />
              </svg>
              <input type="tel" className="field-input phone-field" disabled placeholder="Feature under development" />
            </div>
            <button type="button" className="btn-action" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }}>
              Change Number
            </button>
          </div>
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
          <p className="section-desc">Search any city, region, or landmark to receive real-time alerts within 50 km.</p>

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
          <p className="section-desc">
            Triggers a dummy alert at one of your subscribed locations and logs an SMS notification on the server.
          </p>

          <div className="notif-test-row">
            <div className="notif-preview-pill">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="5" y="2" width="14" height="20" rx="2" ry="2" /><line x1="12" y1="18" x2="12.01" y2="18" />
              </svg>
              <span>{userInfo.mobileNumber}</span>
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
              <span className="ticker-text">
                {tickerText || TICKER_FALLBACK}
                {tickerText || TICKER_FALLBACK}
              </span>
            </div>
          </div>

          <DashMap />
        </section>

      </main>

      {/* No-subscriptions popup for dummy test */}
      {showNoSubsPopup && (
        <div className="reg-modal-overlay">
          <div className="reg-success-card" style={{ borderTop: '4px solid #f59e0b' }}>
            <div className="success-check-circle" style={{ background: 'linear-gradient(135deg,#f59e0b,#f97316)' }}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                <circle cx="12" cy="12" r="10" />
              </svg>
            </div>
            <h3 className="success-title">No Subscriptions Found</h3>
            <p className="success-desc">
              You need to subscribe to at least one place before sending a test alert.<br />
              Use the <strong>"Subscribe to More Places"</strong> section above to get started.
            </p>
            <button className="btn-primary" onClick={() => setShowNoSubsPopup(false)} style={{ maxWidth: '200px', margin: '0 auto' }}>
              OK
            </button>
          </div>
        </div>
      )}
    </>
  );
}

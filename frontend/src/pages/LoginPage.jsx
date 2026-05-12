import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { loginUser, extractToken } from '../services/api';
import { API_CONFIG } from '../config';
import LoginMap from '../components/LoginMap';
import RegisterModal from '../components/RegisterModal';

function calcPwStrength(val) {
  let score = 0;
  if (val.length >= 8)           score++;
  if (/[A-Z]/.test(val))         score++;
  if (/[0-9]/.test(val))         score++;
  if (/[^A-Za-z0-9]/.test(val))  score++;
  const colors = ['', '#ef4444', '#f97316', '#f59e0b', '#22c55e'];
  const labels = ['', 'Weak',    'Fair',    'Good',    'Strong' ];
  return { width: score * 25, color: colors[score] || '', label: labels[score] || '' };
}

export default function LoginPage() {
  const navigate = useNavigate();
  const auth     = useAuth();

  // Lock body scroll for the split-panel layout
  useEffect(() => {
    document.documentElement.style.height   = '100%';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.height              = '100%';
    document.body.style.overflow            = 'hidden';
    return () => {
      document.documentElement.style.height   = '';
      document.documentElement.style.overflow = '';
      document.body.style.height              = '';
      document.body.style.overflow            = '';
    };
  }, []);

  // Login form state
  const [mobile,     setMobile]     = useState('');
  const [password,   setPassword]   = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPw,     setShowPw]     = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [msg,        setMsg]        = useState({ text: '', type: '' });

  // Modals
  const [showRegModal,     setShowRegModal]     = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // Dev API config panel
  const [apiBaseUrl,    setApiBaseUrl]    = useState(API_CONFIG.baseUrl);
  const [showApiConfig, setShowApiConfig] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setMsg({ text: '', type: '' });
    setLoading(true);
    try {
      const { ok, data } = await loginUser(mobile, password, apiBaseUrl);
      if (!ok) {
        const detail = data.detail || data.message || data.error || `HTTP error`;
        setMsg({ text: `Login failed: ${detail}`, type: 'error' });
      } else {
        const token = extractToken(data);
        if (token) {
          auth.login(token, rememberMe);
          navigate('/dashboard', { replace: true });
        } else {
          setMsg({ text: 'Login succeeded but no token found in response.', type: 'error' });
        }
      }
    } catch (err) {
      setMsg({
        text: err.name === 'TypeError'
          ? 'Cannot reach API — check Base URL and CORS settings.'
          : `Unexpected error: ${err.message}`,
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }

  function handleRegSuccess() {
    setShowRegModal(false);
    setShowSuccessModal(true);
  }

  function handleSuccessOk() {
    setShowSuccessModal(false);
  }

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

        <div className="topbar-right" />
      </header>

      {/* ── Main split layout ── */}
      <main className="layout">
        <LoginMap />

        {/* ── Auth panel ── */}
        <aside className="auth-panel">
          <div className="auth-card">

            {/* Hero */}
            <div className="auth-header">
              <div className="auth-hero">
                <div className="hero-rings">
                  <div className="ring ring-1" /><div className="ring ring-2" /><div className="ring ring-3" />
                  <div className="hero-icon">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                  </div>
                </div>
              </div>
              <h1 className="auth-title">Welcome back</h1>
              <p className="auth-sub">Sign in to access real-time road alerts</p>
            </div>

            {/* Tab bar — Register opens modal */}
            <div className="tab-bar">
              <button className="tab active">Sign In</button>
              <button className="tab" onClick={() => setShowRegModal(true)}>Register</button>
            </div>

            {/* Login form */}
            <form className="auth-form" onSubmit={handleLogin}>
              <div className="field-group">
                <label className="field-label">Mobile number</label>
                <div className="input-wrap">
                  <svg className="input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="5" y="2" width="14" height="20" rx="2" ry="2" /><line x1="12" y1="18" x2="12.01" y2="18" />
                  </svg>
                  <input type="tel" className="field-input" placeholder="+91 98765 43210" required
                    value={mobile} onChange={(e) => setMobile(e.target.value)} />
                </div>
              </div>

              <div className="field-group">
                <label className="field-label">Password</label>
                <div className="input-wrap">
                  <svg className="input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <input type={showPw ? 'text' : 'password'} className="field-input" placeholder="••••••••" required
                    value={password} onChange={(e) => setPassword(e.target.value)} />
                  <button type="button" className="toggle-pw" onClick={() => setShowPw((v) => !v)}>
                    {showPw
                      ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    }
                  </button>
                </div>
              </div>

              <div className="field-row">
                <label className="checkbox-label">
                  <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                  Remember me
                </label>
                <a href="#" className="link-subtle">Forgot password?</a>
              </div>

              <button type="submit" className="btn-primary" disabled={loading}>
                {loading ? <span className="btn-spinner" /> : <span className="btn-text">Sign In</span>}
              </button>
            </form>

            {msg.text && <div className={`auth-msg ${msg.type}`}>{msg.text}</div>}
          </div>

          {/* API Config accordion (dev helper) */}
          <div className="api-config">
            <div className="api-config-header" onClick={() => setShowApiConfig((v) => !v)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
              </svg>
              <span>API Configuration</span>
              <svg className={`chevron ${showApiConfig ? 'open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
            {showApiConfig && (
              <div className="api-config-body">
                <div className="field-group">
                  <label className="field-label">Base URL</label>
                  <input type="text" className="field-input" value={apiBaseUrl}
                    onChange={(e) => setApiBaseUrl(e.target.value)} />
                </div>
              </div>
            )}
          </div>
        </aside>
      </main>

      {/* Register modal */}
      <RegisterModal
        open={showRegModal}
        onClose={() => setShowRegModal(false)}
        onSuccess={handleRegSuccess}
        apiBaseUrl={apiBaseUrl}
      />

      {/* Registration success popup */}
      {showSuccessModal && (
        <div className="reg-modal-overlay">
          <div className="reg-success-card">
            <div className="success-check-circle">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h3 className="success-title">Registration Successful!</h3>
            <p className="success-desc">
              Your account has been created successfully.<br />Please sign in with your credentials.
            </p>
            <button className="btn-primary" onClick={handleSuccessOk} style={{ maxWidth: '200px', margin: '0 auto' }}>
              OK
            </button>
          </div>
        </div>
      )}
    </>
  );
}

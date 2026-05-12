import { useState } from 'react';
import { registerUser, extractToken } from '../services/api';

const COUNTRY_CODES = [
  { value: '+1',   label: '🇺🇸 +1' },
  { value: '+1-CA',label: '🇨🇦 +1' },
  { value: '+44',  label: '🇬🇧 +44' },
  { value: '+91',  label: '🇮🇳 +91' },
  { value: '+61',  label: '🇦🇺 +61' },
  { value: '+49',  label: '🇩🇪 +49' },
  { value: '+33',  label: '🇫🇷 +33' },
  { value: '+39',  label: '🇮🇹 +39' },
  { value: '+34',  label: '🇪🇸 +34' },
  { value: '+31',  label: '🇳🇱 +31' },
  { value: '+46',  label: '🇸🇪 +46' },
  { value: '+48',  label: '🇵🇱 +48' },
  { value: '+7',   label: '🇷🇺 +7'  },
  { value: '+81',  label: '🇯🇵 +81' },
  { value: '+82',  label: '🇰🇷 +82' },
  { value: '+86',  label: '🇨🇳 +86' },
  { value: '+65',  label: '🇸🇬 +65' },
  { value: '+62',  label: '🇮🇩 +62' },
  { value: '+60',  label: '🇲🇾 +60' },
  { value: '+66',  label: '🇹🇭 +66' },
  { value: '+92',  label: '🇵🇰 +92' },
  { value: '+880', label: '🇧🇩 +880'},
  { value: '+971', label: '🇦🇪 +971'},
  { value: '+966', label: '🇸🇦 +966'},
  { value: '+90',  label: '🇹🇷 +90' },
  { value: '+972', label: '🇮🇱 +972'},
  { value: '+55',  label: '🇧🇷 +55' },
  { value: '+52',  label: '🇲🇽 +52' },
  { value: '+27',  label: '🇿🇦 +27' },
  { value: '+234', label: '🇳🇬 +234'},
  { value: '+64',  label: '🇳🇿 +64' },
];

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

export default function RegisterModal({ open, onClose, onSuccess, apiBaseUrl }) {
  const [name,        setName]        = useState('');
  const [email,       setEmail]       = useState('');
  const [countryCode, setCountryCode] = useState('+44');
  const [phone,       setPhone]       = useState('');
  const [password,    setPassword]    = useState('');
  const [confirm,     setConfirm]     = useState('');
  const [showPw,      setShowPw]      = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading,     setLoading]     = useState(false);
  const [msg,         setMsg]         = useState({ text: '', type: '' });
  const [mismatch,    setMismatch]    = useState(false);
  const [pwStrength,  setPwStrength]  = useState({ width: 0, color: '', label: '' });

  function handlePwChange(val) {
    setPassword(val);
    setPwStrength(calcPwStrength(val));
  }

  function handleConfirmChange(val) {
    setConfirm(val);
    setMismatch(val !== '' && val !== password);
  }

  function resetForm() {
    setName(''); setEmail(''); setCountryCode('+44'); setPhone('');
    setPassword(''); setConfirm(''); setShowPw(false); setShowConfirm(false);
    setLoading(false); setMsg({ text: '', type: '' }); setMismatch(false);
    setPwStrength({ width: 0, color: '', label: '' });
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function handleBackdrop(e) {
    if (e.target === e.currentTarget) handleClose();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (password !== confirm) { setMismatch(true); return; }
    setMismatch(false);
    setLoading(true);
    setMsg({ text: '', type: '' });

    const rawCode      = countryCode.replace(/-[A-Z]+$/, '');
    const mobile_number = `${rawCode}-${phone.trim()}`;

    try {
      const { ok, data } = await registerUser(
        name.trim(), email.trim(), mobile_number, password, apiBaseUrl
      );

      if (!ok) {
        const detail = data.message || data.detail || data.error || 'Registration failed.';
        setMsg({ text: detail, type: 'error' });
      } else {
        resetForm();
        onSuccess();
      }
    } catch (err) {
      setMsg({
        text: err.name === 'TypeError'
          ? 'Cannot reach API — check connection.'
          : `Unexpected error: ${err.message}`,
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <>
      {/* Register form modal */}
      <div className="reg-modal-overlay" onClick={handleBackdrop}>
        <div className="reg-modal-card">
          <button className="reg-modal-close" type="button" onClick={handleClose} aria-label="Close">
            &times;
          </button>

          <div className="reg-modal-header">
            <div className="auth-hero" style={{ marginBottom: '.9rem' }}>
              <div className="hero-rings">
                <div className="ring ring-1" /><div className="ring ring-2" /><div className="ring ring-3" />
                <div className="hero-icon">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
              </div>
            </div>
            <h2 className="reg-modal-title">Create Account</h2>
            <p className="reg-modal-sub">Join AlertMap and get real-time alerts for your area</p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            {/* Full Name */}
            <div className="field-group">
              <label className="field-label">Full Name</label>
              <div className="input-wrap">
                <svg className="input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                </svg>
                <input type="text" className="field-input" placeholder="Jane Doe" required
                  value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              </div>
            </div>

            {/* Email */}
            <div className="field-group">
              <label className="field-label">Email Address</label>
              <div className="input-wrap">
                <svg className="input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                </svg>
                <input type="email" className="field-input" placeholder="you@example.com" required
                  value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </div>
            </div>

            {/* Mobile */}
            <div className="field-group">
              <label className="field-label">Mobile Number</label>
              <div className="phone-input-group">
                <select className="country-code-select" value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}>
                  {COUNTRY_CODES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
                <input type="tel" className="field-input reg-phone-input" placeholder="7700 900 123" required
                  value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel-national" />
              </div>
            </div>

            {/* Password */}
            <div className="field-group">
              <label className="field-label">Password</label>
              <div className="input-wrap">
                <svg className="input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <input type={showPw ? 'text' : 'password'} className="field-input" placeholder="Min. 8 characters" required
                  value={password} onChange={(e) => handlePwChange(e.target.value)} autoComplete="new-password" />
                <button type="button" className="toggle-pw" onClick={() => setShowPw((v) => !v)}>
                  {showPw
                    ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
              <div className="pw-strength-bar">
                <div className="pw-strength-fill" style={{ width: `${pwStrength.width}%`, background: pwStrength.color }} />
              </div>
              <span className="pw-strength-label" style={{ color: pwStrength.color }}>{pwStrength.label}</span>
            </div>

            {/* Confirm Password */}
            <div className="field-group">
              <label className="field-label">Confirm Password</label>
              <div className="input-wrap">
                <svg className="input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                <input type={showConfirm ? 'text' : 'password'} className={`field-input ${mismatch ? 'error' : ''}`}
                  placeholder="Repeat password" required value={confirm}
                  onChange={(e) => handleConfirmChange(e.target.value)} autoComplete="new-password" />
                <button type="button" className="toggle-pw" onClick={() => setShowConfirm((v) => !v)}>
                  {showConfirm
                    ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
              {mismatch && (
                <span style={{ color: '#ef4444', fontSize: '.75rem', marginTop: '.25rem', display: 'block' }}>
                  Passwords do not match
                </span>
              )}
            </div>

            <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: '.4rem' }}>
              {loading ? <span className="btn-spinner" /> : <span className="btn-text">Create Account</span>}
            </button>

            {msg.text && (
              <div className={`auth-msg ${msg.type}`} style={{ marginTop: '.75rem' }}>
                {msg.text}
              </div>
            )}
          </form>
        </div>
      </div>
    </>
  );
}

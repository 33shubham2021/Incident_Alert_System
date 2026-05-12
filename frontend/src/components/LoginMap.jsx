import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';

const ALERT_DATA = [
  { type: 'traffic',  lat: 51.510, lng: -0.085, title: 'Heavy Traffic Jam',       desc: 'A40 Westbound — 40 min delay',        severity: 'High'   },
  { type: 'accident', lat: 51.497, lng: -0.105, title: 'Accident Reported',        desc: '2 vehicles — lane blocked',           severity: 'Medium' },
  { type: 'closure',  lat: 51.515, lng: -0.070, title: 'Road Closure',             desc: 'Waterloo Bridge — until 18:00',       severity: 'High'   },
  { type: 'climate',  lat: 51.503, lng: -0.120, title: 'Heavy Rain Warning',       desc: 'Reduced visibility, slow down',       severity: 'Low'    },
  { type: 'traffic',  lat: 51.522, lng: -0.095, title: 'Traffic Build-up',         desc: 'City Road — 15 min delay',            severity: 'Medium' },
  { type: 'closure',  lat: 51.488, lng: -0.095, title: 'Construction Zone',        desc: 'Vauxhall Bridge — 1 lane open',       severity: 'Medium' },
  { type: 'climate',  lat: 51.530, lng: -0.075, title: 'Fog Alert',                desc: 'Low visibility on A10 North',         severity: 'Low'    },
  { type: 'accident', lat: 51.480, lng: -0.110, title: 'Minor Collision',          desc: 'Clapham High St — cleared soon',      severity: 'Low'    },
];

const MARKER_COLORS = { traffic: '#ef4444', accident: '#f97316', closure: '#f59e0b', climate: '#3b82f6' };
const TYPE_LABELS   = { traffic: 'Traffic Jam', accident: 'Accident', closure: 'Road Closure', climate: 'Climate Alert' };
const TICKER_MSGS   = [
  '🔴 Heavy Traffic on A40 Westbound — 40 min delay  ·  ',
  '🟠 Accident cleared on Clapham High St  ·  ',
  '🟡 Road Closure: Waterloo Bridge until 18:00 — use alternative routes  ·  ',
  '🔵 Heavy Rain Warning in effect — reduce speed on A10 North  ·  ',
  '🟠 Construction work on Vauxhall Bridge — expect delays  ·  ',
  '🔴 Major congestion on City Road — 15 min delay  ·  ',
];

function severityColor(s) {
  return s === 'High' ? '#ef4444' : s === 'Medium' ? '#f97316' : '#22c55e';
}

function makeIcon(type) {
  return L.divIcon({
    className: '',
    html: `<div class="custom-marker marker-${type}" style="background:${MARKER_COLORS[type]}"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

export default function LoginMap() {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const layersRef    = useRef({});

  const [searchQuery, setSearchQuery]       = useState('');
  const [currentLayer, setCurrentLayer]     = useState('street');
  const [trafficVisible, setTrafficVisible] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const streetTile = L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      { attribution: '© OpenStreetMap contributors', maxZoom: 19 }
    );
    const satelliteTile = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: 'Tiles © Esri', maxZoom: 19 }
    );

    const map = L.map(container, {
      center: [51.505, -0.09],
      zoom: 13,
      layers: [streetTile],
      zoomControl: false,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const markers = ALERT_DATA.map((a) => {
      const m = L.marker([a.lat, a.lng], { icon: makeIcon(a.type) });
      m.bindPopup(
        `<span class="popup-badge" style="background:${MARKER_COLORS[a.type]}">${TYPE_LABELS[a.type]}</span>
         <div class="popup-title">${a.title}</div>
         <div class="popup-body">${a.desc}</div>
         <div class="popup-body" style="margin-top:4px;font-weight:600;color:${severityColor(a.severity)}">Severity: ${a.severity}</div>`,
        { maxWidth: 200 }
      );
      return m;
    });

    const trafficLayer = L.layerGroup(markers).addTo(map);

    mapRef.current = map;
    layersRef.current = { streetTile, satelliteTile, trafficLayer };

    return () => {
      map.remove();
      mapRef.current = null;
      layersRef.current = {};
    };
  }, []);

  function toggleLayer() {
    const map = mapRef.current;
    const { streetTile, satelliteTile } = layersRef.current;
    if (!map) return;
    if (currentLayer === 'street') {
      map.removeLayer(streetTile);
      satelliteTile.addTo(map);
      setCurrentLayer('satellite');
    } else {
      map.removeLayer(satelliteTile);
      streetTile.addTo(map);
      setCurrentLayer('street');
    }
  }

  function toggleTrafficLayer() {
    const map = mapRef.current;
    const { trafficLayer } = layersRef.current;
    if (!map || !trafficLayer) return;
    if (trafficVisible) {
      map.removeLayer(trafficLayer);
    } else {
      trafficLayer.addTo(map);
    }
    setTrafficVisible((v) => !v);
  }

  function goToMyLocation() {
    const map = mapRef.current;
    if (!navigator.geolocation || !map) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        map.flyTo([lat, lng], 15, { duration: 1.4 });
        L.circleMarker([lat, lng], {
          radius: 8, fillColor: '#4f6ef7', color: 'white', weight: 2.5, fillOpacity: 1,
        })
          .addTo(map)
          .bindPopup('<div class="popup-title">You are here</div>')
          .openPopup();
      },
      () => showToast('Location access denied')
    );
  }

  function showToast(msg) {
    const el = document.createElement('div');
    el.textContent = msg;
    Object.assign(el.style, {
      position: 'fixed', bottom: '60px', left: '50%', transform: 'translateX(-50%)',
      background: 'rgba(15,22,41,.85)', color: 'white', padding: '7px 18px',
      borderRadius: '99px', fontSize: '.8rem', zIndex: '9999',
      backdropFilter: 'blur(6px)',
    });
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2800);
  }

  async function searchLocation() {
    const q = searchQuery.trim();
    const map = mapRef.current;
    if (!q || !map) return;
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await res.json();
      if (data.length) {
        const { lat, lon, display_name } = data[0];
        map.flyTo([+lat, +lon], 14, { duration: 1.4 });
        L.popup({ maxWidth: 280 })
          .setLatLng([+lat, +lon])
          .setContent(
            `<div class="popup-title">${display_name.split(',')[0]}</div><div class="popup-body">${display_name}</div>`
          )
          .openOn(map);
      } else {
        showToast('No results found');
      }
    } catch {
      showToast('Search failed — check connection');
    }
  }

  return (
    <section className="map-panel">
      <div className="map-toolbar">
        <div className="search-box">
          <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Search location, road, city…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchLocation()}
          />
          <button className="search-btn" onClick={searchLocation}>Go</button>
        </div>

        <div className="map-controls">
          <button className="map-btn" title="My Location" onClick={goToMyLocation}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
            </svg>
          </button>
          <button className="map-btn" title="Toggle Satellite/Street" onClick={toggleLayer}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
            </svg>
          </button>
          <button className="map-btn" title="Toggle Traffic Layer" onClick={toggleTrafficLayer}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22V12M12 12l-3-3m3 3 3-3M6 6l-3 3m3-3L3 3M18 6l3 3m-3-3 3-3" />
            </svg>
          </button>
        </div>
      </div>

      <div ref={containerRef} id="map" />

      <div className="map-legend">
        <p className="legend-title">Live Alerts</p>
        <div className="legend-items">
          <span className="legend-item"><span className="leg-dot" style={{ background: '#ef4444' }} />Traffic Jam</span>
          <span className="legend-item"><span className="leg-dot" style={{ background: '#3b82f6' }} />Climate</span>
          <span className="legend-item"><span className="leg-dot" style={{ background: '#f59e0b' }} />Road Closure</span>
          <span className="legend-item"><span className="leg-dot" style={{ background: '#f97316' }} />Accident</span>
        </div>
      </div>

      <div className="alert-ticker">
        <span className="ticker-label">LIVE</span>
        <div className="ticker-track">
          <span className="ticker-text">{TICKER_MSGS.join('')}</span>
        </div>
      </div>
    </section>
  );
}

// Map initialisation, drawing, and transect overlay

let map, drawControl, drawnItems;
let transectLayer = null;
let triggerLayer  = null;
let boundsRect    = null;

window._surveyBounds   = null;
window._transectData   = null;

// ─── Initialise map ────────────────────────────────────────────────────────
const map_ = L.map('map', { center: [51.5, -0.1], zoom: 16 });

L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics',
  maxZoom: 21
}).addTo(map_);

// ── Labels overlay ──────────────────────────────────────────────────────────
L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
  attribution: '', maxZoom: 21, opacity: 0.7
}).addTo(map_);

map = map_;
drawnItems = new L.FeatureGroup().addTo(map);

drawControl = new L.Control.Draw({
  draw: {
    rectangle: { shapeOptions: { color: '#00d4ff', weight: 2, fillOpacity: 0.08 } },
    polygon: false, polyline: false, circle: false, circlemarker: false, marker: false
  },
  edit: { featureGroup: drawnItems }
});
map.addControl(drawControl);

map.on(L.Draw.Event.CREATED, function(e) {
  drawnItems.clearLayers();
  if (transectLayer) { map.removeLayer(transectLayer); transectLayer = null; }
  if (triggerLayer)  { map.removeLayer(triggerLayer);  triggerLayer  = null; }

  drawnItems.addLayer(e.layer);
  window._surveyBounds = e.layer.getBounds();
  document.getElementById('mapInfo').style.display = 'none';
  document.getElementById('btnPlan').disabled = false;
  document.getElementById('btnKML').disabled  = false;
  document.getElementById('btnCSV').disabled  = false;
  redrawTransects();
});

map.on(L.Draw.Event.EDITED, function() {
  drawnItems.eachLayer(l => { window._surveyBounds = l.getBounds(); });
  redrawTransects();
});

// ─── Geo helpers ────────────────────────────────────────────────────────────

// Haversine distance in metres
function haversineDist(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Move a point (lat,lng) by (dx metres East, dy metres North)
function offsetPoint(lat, lng, dx, dy) {
  const R = 6371000;
  const newLat = lat + (dy / R) * (180 / Math.PI);
  const newLng = lng + (dx / R) * (180 / Math.PI) / Math.cos(lat * Math.PI / 180);
  return [newLat, newLng];
}

// ─── Transect generation ────────────────────────────────────────────────────
function redrawTransects() {
  if (!window._surveyBounds) return;
  const c = calcPhotogrammetry();
  if (!c) return;

  if (transectLayer) { map.removeLayer(transectLayer); transectLayer = null; }
  if (triggerLayer)  { map.removeLayer(triggerLayer);  triggerLayer  = null; }

  const bounds = window._surveyBounds;
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();

  // Area dimensions in metres
  const widthM  = haversineDist(sw.lat, sw.lng, sw.lat, ne.lng);
  const heightM = haversineDist(sw.lat, sw.lng, ne.lat, sw.lng);

  // Determine transect direction
  const dir = document.getElementById('transectDir').value;
  let runNS; // true = transects run N-S, false = E-W
  if      (dir === 'ns')   runNS = true;
  else if (dir === 'ew')   runNS = false;
  else                     runNS = heightM >= widthM; // auto: long axis

  // Transects run along one axis; spacing applied across the other
  const spanM     = runNS ? widthM  : heightM;  // how far we step across
  const lengthM   = runNS ? heightM : widthM;   // how long each transect is

  const nTransects = Math.ceil(spanM / c.transectSpacing) + 1;
  const nTriggers  = Math.floor(lengthM / c.frameSpacing) + 1;

  const transectLines = [];
  const triggerPoints = [];
  const transectMeta  = [];

  for (let t = 0; t < nTransects; t++) {
    const offset = t * c.transectSpacing;
    if (offset > spanM + c.transectSpacing) break;

    let p1, p2;
    if (runNS) {
      p1 = offsetPoint(sw.lat, sw.lng, offset, 0);
      p2 = offsetPoint(sw.lat, sw.lng, offset, lengthM);
    } else {
      p1 = offsetPoint(sw.lat, sw.lng, 0, offset);
      p2 = offsetPoint(sw.lat, sw.lng, lengthM, offset);
    }

    // Clip to bounds
    p1[0] = Math.max(sw.lat, Math.min(ne.lat, p1[0]));
    p1[1] = Math.max(sw.lng, Math.min(ne.lng, p1[1]));
    p2[0] = Math.max(sw.lat, Math.min(ne.lat, p2[0]));
    p2[1] = Math.max(sw.lng, Math.min(ne.lng, p2[1]));

    transectLines.push([p1, p2]);
    transectMeta.push({ start: p1, end: p2, index: t+1 });

    // Trigger points along this transect
    // Alternate direction (boustrophedon)
    const forward = t % 2 === 0;
    for (let f = 0; f < nTriggers; f++) {
      const frac = forward ? f / Math.max(nTriggers - 1, 1) : 1 - f / Math.max(nTriggers - 1, 1);
      const lat  = p1[0] + (p2[0] - p1[0]) * frac;
      const lng  = p1[1] + (p2[1] - p1[1]) * frac;
      if (lat >= sw.lat && lat <= ne.lat && lng >= sw.lng && lng <= ne.lng) {
        triggerPoints.push([lat, lng]);
      }
    }
  }

  // Draw transect lines
  transectLayer = L.layerGroup();
  transectLines.forEach((pts, i) => {
    L.polyline(pts, { color: '#00d4ff', weight: 1.5, opacity: 0.85 }).addTo(transectLayer);
  });
  transectLayer.addTo(map);

  // Draw trigger points (tiny dots, limit rendered to 2000 for performance)
  triggerLayer = L.layerGroup();
  const renderLimit = Math.min(triggerPoints.length, 2000);
  const step = Math.ceil(triggerPoints.length / renderLimit);
  for (let i = 0; i < triggerPoints.length; i += step) {
    L.circleMarker(triggerPoints[i], {
      radius: 2, color: '#ffcc00', fillColor: '#ffcc00',
      fillOpacity: 0.8, weight: 0
    }).addTo(triggerLayer);
  }
  triggerLayer.addTo(map);

  // Area
  const areaMsq = widthM * heightM;
  const surveyLengthM = nTransects * lengthM;
  const surveyTimeSec = surveyLengthM / c.spd;
  const hrs = Math.floor(surveyTimeSec / 3600);
  const min = Math.floor((surveyTimeSec % 3600) / 60);

  document.getElementById('r_tc').textContent = nTransects;
  document.getElementById('r_ph').textContent = (nTransects * nTriggers).toLocaleString();
  document.getElementById('r_st').textContent = hrs + 'h ' + min + 'm';
  document.getElementById('r_ca').textContent = (areaMsq).toFixed(0) + ' m² (' + (areaMsq/10000).toFixed(3) + ' ha)';

  // Store for export
  window._transectData = {
    transectLines, triggerPoints, nTransects, nTriggers,
    widthM, heightM, calc: c, transectMeta
  };
}

// ─── UI helpers ─────────────────────────────────────────────────────────────
function startDrawing() {
  new L.Draw.Rectangle(map, drawControl.options.draw.rectangle).enable();
  document.getElementById('mapInfo').textContent = 'Drag to draw your survey rectangle…';
  document.getElementById('mapInfo').style.display = 'block';
}

function clearAll() {
  drawnItems.clearLayers();
  if (transectLayer) { map.removeLayer(transectLayer); transectLayer = null; }
  if (triggerLayer)  { map.removeLayer(triggerLayer);  triggerLayer  = null; }
  window._surveyBounds = null;
  window._transectData = null;
  document.getElementById('r_tc').textContent = '—';
  document.getElementById('r_ph').textContent = '—';
  document.getElementById('r_st').textContent = '—';
  document.getElementById('r_ca').textContent = '—';
  document.getElementById('btnPlan').disabled = true;
  document.getElementById('btnKML').disabled  = true;
  document.getElementById('btnCSV').disabled  = true;
  document.getElementById('mapInfo').textContent = 'Click "Draw Survey Area" then drag a rectangle on the map';
  document.getElementById('mapInfo').style.display = 'block';
}

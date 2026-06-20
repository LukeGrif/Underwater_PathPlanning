// Map initialisation, drawing, and transect overlay

let map, drawControl, drawnItems;
let transectLayer = null;
let triggerLayer  = null;

window._surveyPolygon = null;
window._surveyBounds  = null;
window._transectData  = null;

// ─── Initialise map ───────────────────────────────────────────────────────────
// University of Limerick — Plassey campus
const map_ = L.map('map', { center: [52.6741, -8.5717], zoom: 17 });

L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
  attribution: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics',
  maxZoom: 21
}).addTo(map_);

L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
  attribution: '', maxZoom: 21, opacity: 0.7
}).addTo(map_);

map = map_;
drawnItems = new L.FeatureGroup().addTo(map);

const shapeStyle = { color: '#00d4ff', weight: 2, fillOpacity: 0.08 };

drawControl = new L.Control.Draw({
  draw: {
    polygon: {
      shapeOptions: shapeStyle,
      showArea: true,
      allowIntersection: false
    },
    rectangle: { shapeOptions: shapeStyle },
    polyline: false, circle: false, circlemarker: false, marker: false
  },
  edit: { featureGroup: drawnItems }
});
map.addControl(drawControl);

// ─── Draw events ──────────────────────────────────────────────────────────────

function extractRing(layer) {
  const ll = layer.getLatLngs();
  // Polygon returns [[...]], rectangle returns [...]
  const ring = Array.isArray(ll[0]) ? ll[0] : ll;
  return ring.map(p => [p.lat, p.lng]);
}

map.on(L.Draw.Event.CREATED, function(e) {
  drawnItems.clearLayers();
  clearOverlays();
  drawnItems.addLayer(e.layer);
  window._surveyPolygon = extractRing(e.layer);
  window._surveyBounds  = e.layer.getBounds();
  document.getElementById('mapInfo').style.display = 'none';
  enableExports(true);
  redrawTransects();
});

map.on(L.Draw.Event.EDITED, function() {
  drawnItems.eachLayer(l => {
    window._surveyPolygon = extractRing(l);
    window._surveyBounds  = l.getBounds();
  });
  redrawTransects();
});

// ─── Coordinate helpers ───────────────────────────────────────────────────────

// [lat,lng] → [x_east, y_north] metres, relative to origin [lat,lng]
function toMeters(p, origin) {
  const R = 6371000;
  const dy = (p[0] - origin[0]) * Math.PI / 180 * R;
  const dx = (p[1] - origin[1]) * Math.PI / 180 * R * Math.cos(origin[0] * Math.PI / 180);
  return [dx, dy];
}

// [x_east, y_north] metres → [lat,lng]
function fromMeters(m, origin) {
  const R = 6371000;
  const lat = origin[0] + m[1] / R * 180 / Math.PI;
  const lng = origin[1] + m[0] / (R * Math.cos(origin[0] * Math.PI / 180)) * 180 / Math.PI;
  return [lat, lng];
}

// Rotate 2-D point CCW by alpha radians
function rotateCCW(p, alpha) {
  const c = Math.cos(alpha), s = Math.sin(alpha);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
}

function lerp2(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

// ─── Polygon math ─────────────────────────────────────────────────────────────

// Ray-casting PIP in 2-D metre space
function pip(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (((yi > p[1]) !== (yj > p[1])) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

// t along line p1→p2 where it crosses segment p3→p4; null if no crossing
function segCross(p1, p2, p3, p4) {
  const dx = p2[0] - p1[0], dy = p2[1] - p1[1];
  const ex = p4[0] - p3[0], ey = p4[1] - p3[1];
  const denom = dx * ey - dy * ex;
  if (Math.abs(denom) < 1e-10) return null;
  const t = ((p3[0] - p1[0]) * ey - (p3[1] - p1[1]) * ex) / denom;
  const u = ((p3[0] - p1[0]) * dy - (p3[1] - p1[1]) * dx) / denom;
  return (u >= 0 && u <= 1) ? t : null;
}

// Clip an infinite line (start→end, extended beyond bbox) to a polygon.
// Returns array of [segStart, segEnd] metre pairs that lie inside the polygon.
function clipToPoly(start, end, poly) {
  const ts = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const t = segCross(start, end, poly[i], poly[(i + 1) % n]);
    if (t !== null) ts.push(t);
  }
  ts.sort((a, b) => a - b);

  // Deduplicate near-coincident intersections
  const deduped = ts.filter((t, i) => i === 0 || t - ts[i - 1] > 1e-8);

  let inside = pip(start, poly);
  const segs = [];
  let prev = 0;
  for (const t of deduped) {
    if (inside && t > prev) {
      const s = lerp2(start, end, prev);
      const e = lerp2(start, end, t);
      if (Math.hypot(e[0] - s[0], e[1] - s[1]) > 0.01) segs.push([s, e]);
    }
    inside = !inside;
    prev = t;
  }
  if (inside) {
    const s = lerp2(start, end, prev);
    if (Math.hypot(end[0] - s[0], end[1] - s[1]) > 0.01) segs.push([s, end]);
  }
  return segs;
}

// Decimal degrees → DMS string
function toDMS(deg, isLat) {
  const dir = deg >= 0 ? (isLat ? 'N' : 'E') : (isLat ? 'S' : 'W');
  const abs = Math.abs(deg);
  const d   = Math.floor(abs);
  const mf  = (abs - d) * 60;
  const m   = Math.floor(mf);
  const s   = ((mf - m) * 60).toFixed(3);
  return `${d}°${String(m).padStart(2,'0')}'${s.padStart(6,'0')}"${dir}`;
}

function setStartCoords(lat, lng) {
  document.getElementById('r_slat').textContent = lat.toFixed(8);
  document.getElementById('r_slng').textContent = lng.toFixed(8);
  document.getElementById('r_sdms').innerHTML =
    toDMS(lat, true) + '<br>' + toDMS(lng, false);
  document.getElementById('btnCopyStart').disabled = false;
}

function clearStartCoords() {
  ['r_slat', 'r_slng', 'r_sdms'].forEach(id => {
    document.getElementById(id).textContent = '—';
  });
  document.getElementById('btnCopyStart').disabled = true;
}

function copyStartCoords() {
  const d = window._transectData;
  if (!d || !d.triggerPoints.length) return;
  const [lat, lng] = d.triggerPoints[0];
  navigator.clipboard.writeText(`${lat.toFixed(8)}, ${lng.toFixed(8)}`).then(() => {
    const btn = document.getElementById('btnCopyStart');
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = orig; }, 1500);
  });
}

// Shoelace area in m²
function polyArea(poly) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++)
    a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  return Math.abs(a / 2);
}

// Haversine distance in metres (for display only)
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR, dLng = (lng2 - lng1) * toR;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Transect generation ──────────────────────────────────────────────────────

function redrawTransects() {
  if (!window._surveyPolygon) return;
  const c = calcPhotogrammetry();
  if (!c) return;
  clearOverlays();

  const poly = window._surveyPolygon;
  const origin = [Math.min(...poly.map(p => p[0])), Math.min(...poly.map(p => p[1]))];
  const polyM  = poly.map(p => toMeters(p, origin));

  // ── Choose transect bearing ──────────────────────────────────────
  // alphaDeg: CCW rotation (degrees) so that the along-track direction aligns with Y-axis.
  // alphaDeg = bearing (CW from North) achieves this for arbitrary headings.
  const dir = document.getElementById('transectDir').value;
  let alphaDeg;
  if (dir === 'ns') {
    alphaDeg = 0;
  } else if (dir === 'ew') {
    alphaDeg = 90;
  } else if (dir === 'custom') {
    alphaDeg = parseFloat(document.getElementById('bearing').value) || 0;
  } else {
    // Auto: longer axis of bounding box determines along-track direction
    const xs = polyM.map(p => p[0]), ys = polyM.map(p => p[1]);
    const wM = Math.max(...xs) - Math.min(...xs);
    const hM = Math.max(...ys) - Math.min(...ys);
    alphaDeg = hM >= wM ? 0 : 90;
  }
  const alpha = alphaDeg * Math.PI / 180;

  // Rotate polygon so transects become vertical lines (constant X)
  const polyR = polyM.map(p => rotateCCW(p, alpha));
  const rxs = polyR.map(p => p[0]), rys = polyR.map(p => p[1]);
  const [minX, maxX] = [Math.min(...rxs), Math.max(...rxs)];
  const [minY, maxY] = [Math.min(...rys), Math.max(...rys)];

  const nCols = Math.ceil((maxX - minX) / c.transectSpacing) + 1;

  const transectLines = [];
  const triggerPoints = [];
  const triggerMeta   = [];
  const transectMeta  = [];
  let totalPhotos = 0, totalLengthM = 0;

  for (let t = 0; t < nCols; t++) {
    const xR = minX + t * c.transectSpacing;
    if (xR > maxX + c.transectSpacing * 0.5) break;

    const startR = [xR, minY - 1];
    const endR   = [xR, maxY + 1];
    const segs   = clipToPoly(startR, endR, polyR);
    if (!segs.length) continue;

    segs.forEach(([sR, eR]) => {
      // Unrotate back to metric space, then to lat/lng
      const sM = rotateCCW(sR, -alpha), eM = rotateCCW(eR, -alpha);
      const p1 = fromMeters(sM, origin), p2 = fromMeters(eM, origin);
      const lineIdx = transectLines.length + 1;

      transectLines.push([p1, p2]);
      transectMeta.push({ start: p1, end: p2, index: lineIdx });

      const segLenM = Math.hypot(eR[0] - sR[0], eR[1] - sR[1]);
      totalLengthM += segLenM;
      const nPts    = Math.floor(segLenM / c.frameSpacing) + 1;
      const forward = lineIdx % 2 === 1;
      let ptNo = 0;

      for (let f = 0; f < nPts; f++) {
        const frac = forward ? f / Math.max(nPts - 1, 1) : 1 - f / Math.max(nPts - 1, 1);
        const pmR = lerp2(sR, eR, frac);
        if (pip(pmR, polyR)) {
          triggerPoints.push(fromMeters(rotateCCW(pmR, -alpha), origin));
          triggerMeta.push({ transectNo: lineIdx, pointNo: ++ptNo });
        }
      }
      totalPhotos += nPts;
    });
  }

  // ── Render transects ──────────────────────────────────────────────
  transectLayer = L.layerGroup();
  transectLines.forEach(pts => {
    L.polyline(pts, { color: '#5580B8', weight: 1.5, opacity: 0.9 }).addTo(transectLayer);
  });
  transectLayer.addTo(map);

  // ── Render trigger points (cap rendered count for performance) ────
  triggerLayer = L.layerGroup();
  const step = Math.ceil(triggerPoints.length / 2000);
  for (let i = 0; i < triggerPoints.length; i += step) {
    L.circleMarker(triggerPoints[i], {
      radius: 2, color: '#D4820C', fillColor: '#D4820C',
      fillOpacity: 0.8, weight: 0
    }).addTo(triggerLayer);
  }

  // ── Start point marker + coords ──────────────────────────────────
  if (triggerPoints.length) {
    const sp = triggerPoints[0];
    L.circleMarker(sp, {
      radius: 7, color: '#00ff88', fillColor: '#00ff88',
      fillOpacity: 1, weight: 2
    }).bindTooltip('DVL start', { permanent: true, direction: 'right', className: 'start-tooltip' })
      .addTo(triggerLayer);
    setStartCoords(sp[0], sp[1]);
  } else {
    clearStartCoords();
  }

  triggerLayer.addTo(map);

  // ── Update result panel ───────────────────────────────────────────
  const areaM2 = polyArea(polyM);
  const surveyTimeSec = totalLengthM / c.spd;
  const hrs = Math.floor(surveyTimeSec / 3600);
  const min = Math.floor((surveyTimeSec % 3600) / 60);

  document.getElementById('r_tc').textContent = transectLines.length;
  document.getElementById('r_ph').textContent = totalPhotos.toLocaleString();
  document.getElementById('r_st').textContent = hrs + 'h ' + min + 'm';
  document.getElementById('r_ca').textContent = areaM2.toFixed(0) + ' m² (' + (areaM2 / 10000).toFixed(3) + ' ha)';

  window._transectData = {
    transectLines, triggerPoints, triggerMeta, transectMeta,
    nTransects: transectLines.length,
    calc: c
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clearOverlays() {
  if (transectLayer) { map.removeLayer(transectLayer); transectLayer = null; }
  if (triggerLayer)  { map.removeLayer(triggerLayer);  triggerLayer  = null; }
}

function enableExports(on) {
  ['btnPlan', 'btnKML', 'btnCSV'].forEach(id => {
    document.getElementById(id).disabled = !on;
  });
}

function startDrawing() {
  new L.Draw.Polygon(map, drawControl.options.draw.polygon).enable();
  document.getElementById('mapInfo').textContent =
    'Click to place vertices — double-click to close the polygon.';
  document.getElementById('mapInfo').style.display = 'block';
}

function clearAll() {
  drawnItems.clearLayers();
  clearOverlays();
  window._surveyPolygon = null;
  window._surveyBounds  = null;
  window._transectData  = null;
  ['r_tc', 'r_ph', 'r_st', 'r_ca'].forEach(id => {
    document.getElementById(id).textContent = '—';
  });
  clearStartCoords();
  enableExports(false);
  document.getElementById('mapInfo').textContent =
    'Click "Draw Survey Area" to place polygon vertices, or use the toolbar rectangle tool.';
  document.getElementById('mapInfo').style.display = 'block';
}

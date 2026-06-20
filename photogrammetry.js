// Core photogrammetry calculations

const CAMERA_PRESETS = {
  gopro_hero12:     { name: 'GoPro Hero 12 (wide)',      focalLength: 2.92, sensorW: 6.17, sensorH: 4.55, imgW: 5568, imgH: 4176 },
  sony_rx100:       { name: 'Sony RX100 VII',             focalLength: 8.8,  sensorW: 13.2, sensorH: 8.8,  imgW: 5472, imgH: 3648 },
  sony_ilx_lr1:     { name: 'Sony ILX-LR1 + 20mm',       focalLength: 20,   sensorW: 35.9, sensorH: 24.0, imgW: 9504, imgH: 6336 },
  olympus_tg6:      { name: 'Olympus TG-6',               focalLength: 4.5,  sensorW: 6.17, sensorH: 4.55, imgW: 4000, imgH: 3000 },
  bluerobotics_lpe: { name: 'BlueRobotics LPE Cam',       focalLength: 3.6,  sensorW: 6.4,  sensorH: 4.8,  imgW: 4608, imgH: 3456 }
};

function applyPreset() {
  const key = document.getElementById('cameraPreset').value;
  if (key === 'custom') return;
  const p = CAMERA_PRESETS[key];
  document.getElementById('focalLength').value = p.focalLength;
  document.getElementById('sensorW').value     = p.sensorW;
  document.getElementById('sensorH').value     = p.sensorH;
  document.getElementById('imgW').value        = p.imgW;
  document.getElementById('imgH').value        = p.imgH;
  recalculate();
}

function syncSlider(sliderId, valId) {
  document.getElementById(valId).textContent = document.getElementById(sliderId).value + '%';
}

function getSpeedMs() {
  const v = parseFloat(document.getElementById('speed').value);
  return document.getElementById('speedUnit').value === 'knots' ? v * 0.514444 : v;
}

// Frame spacing depends only on camera geometry + overlap, not speed
function computeFrameSpacing() {
  const fl  = parseFloat(document.getElementById('focalLength').value);
  const sh  = parseFloat(document.getElementById('sensorH').value);
  const alt = parseFloat(document.getElementById('altitude').value);
  const fo  = parseFloat(document.getElementById('fwdOverlap').value) / 100;
  if (!fl || !sh || !alt) return null;
  const fpH = (sh * alt) / fl;
  return fpH * (1 - fo);
}

// Called when the user edits the trigger interval input directly
function onTriggerIntervalInput() {
  const raw = document.getElementById('triggerInterval').value;
  if (raw === '' || raw.endsWith('.')) return; // mid-typing
  const ti = parseFloat(raw);
  if (!ti || ti <= 0) return;
  const fs = computeFrameSpacing();
  if (!fs) return;
  const speedMs = fs / ti;
  const unit = document.getElementById('speedUnit').value;
  document.getElementById('speed').value = (unit === 'knots' ? speedMs / 0.514444 : speedMs).toFixed(4);
  recalculate();
}

function calcPhotogrammetry() {
  const fl  = parseFloat(document.getElementById('focalLength').value);
  const sw  = parseFloat(document.getElementById('sensorW').value);
  const sh  = parseFloat(document.getElementById('sensorH').value);
  const iw  = parseFloat(document.getElementById('imgW').value);
  const ih  = parseFloat(document.getElementById('imgH').value);
  const alt = parseFloat(document.getElementById('altitude').value);
  const spd = getSpeedMs();
  const fo  = parseFloat(document.getElementById('fwdOverlap').value) / 100;
  const sl  = parseFloat(document.getElementById('sidelap').value) / 100;

  if (!fl || !sw || !sh || !iw || !ih || !alt || !spd) return null;

  const gsd              = (sw * alt) / (fl * iw) * 1000;     // mm/px
  const fpW              = (sw * alt) / fl;                    // m
  const fpH              = (sh * alt) / fl;                    // m
  const frameSpacing     = fpH * (1 - fo);                     // m
  const triggerRateHz    = spd / frameSpacing;
  const triggerIntervalS = 1 / triggerRateHz;
  const transectSpacing  = fpW * (1 - sl);                     // m

  return { gsd, fpW, fpH, frameSpacing, triggerRateHz, triggerIntervalS, transectSpacing, alt, spd, fo, sl };
}

function recalculate() {
  const dir = document.getElementById('transectDir').value;
  document.getElementById('bearingWheelWrap').style.display = dir === 'custom' ? 'flex' : 'none';

  const c = calcPhotogrammetry();
  if (!c) return;

  // Sync trigger interval from speed — but don't overwrite while the user is typing into it
  const tiEl = document.getElementById('triggerInterval');
  if (document.activeElement !== tiEl) {
    tiEl.value = c.triggerIntervalS.toFixed(3);
  }

  document.getElementById('r_gsd').textContent = c.gsd.toFixed(2) + ' mm/px';
  document.getElementById('r_fp').textContent  = c.fpW.toFixed(2) + ' m × ' + c.fpH.toFixed(2) + ' m';
  document.getElementById('r_fs').textContent  = c.frameSpacing.toFixed(3) + ' m';
  document.getElementById('r_tr').textContent  = c.triggerRateHz.toFixed(3) + ' Hz (' + (c.triggerRateHz * 60).toFixed(1) + '/min)';
  document.getElementById('r_ts').textContent  = c.transectSpacing.toFixed(2) + ' m';

  if (window._surveyPolygon) redrawTransects();
}

// ── Bearing wheel ─────────────────────────────────────────────────────────────

(function initBearingWheel() {
  const svg     = document.getElementById('wheelSvg');
  const pointer = document.getElementById('wheelPointer');
  const display = document.getElementById('bearingDisplay');
  const input   = document.getElementById('bearing');

  // Generate tick marks dynamically
  const ns = 'http://www.w3.org/2000/svg';
  for (let deg = 0; deg < 360; deg += 10) {
    if (deg % 90 === 0) continue; // cardinals are hardcoded in SVG
    const rad  = deg * Math.PI / 180;
    const isMajor = deg % 45 === 0;
    const r1 = isMajor ? 56 : 59, r2 = 63;
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', (Math.sin(rad) * r1).toFixed(2));
    line.setAttribute('y1', (-Math.cos(rad) * r1).toFixed(2));
    line.setAttribute('x2', (Math.sin(rad) * r2).toFixed(2));
    line.setAttribute('y2', (-Math.cos(rad) * r2).toFixed(2));
    line.setAttribute('stroke', isMajor ? '#3D6499' : '#1E3354');
    line.setAttribute('stroke-width', '1');
    svg.insertBefore(line, pointer);
  }

  let dragging = false;

  function bearing(cx, cy) {
    const r   = svg.getBoundingClientRect();
    const dx  = cx - (r.left + r.width  / 2);
    const dy  = cy - (r.top  + r.height / 2);
    return (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
  }

  function apply(b) {
    b = Math.round(b);
    pointer.setAttribute('transform', `rotate(${b})`);
    display.textContent = b + '°';
    input.value = b;
    if (window._surveyPolygon) redrawTransects();
  }

  svg.addEventListener('mousedown', e => {
    dragging = true; apply(bearing(e.clientX, e.clientY)); e.preventDefault();
  });
  window.addEventListener('mousemove', e => { if (dragging) apply(bearing(e.clientX, e.clientY)); });
  window.addEventListener('mouseup',   () => { dragging = false; });

  svg.addEventListener('touchstart', e => {
    dragging = true; apply(bearing(e.touches[0].clientX, e.touches[0].clientY)); e.preventDefault();
  }, { passive: false });
  svg.addEventListener('touchmove', e => {
    if (dragging) { apply(bearing(e.touches[0].clientX, e.touches[0].clientY)); e.preventDefault(); }
  }, { passive: false });
  svg.addEventListener('touchend', () => { dragging = false; });
})();

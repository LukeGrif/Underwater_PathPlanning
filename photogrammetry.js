// Core photogrammetry calculations

const CAMERA_PRESETS = {
  gopro_hero12: { name: 'GoPro Hero 12 (wide)', focalLength: 2.92, sensorW: 6.17, sensorH: 4.55, imgW: 5568, imgH: 4176 },
  sony_rx100:   { name: 'Sony RX100 VII',        focalLength: 8.8,  sensorW: 13.2, sensorH: 8.8,  imgW: 5472, imgH: 3648 },
  olympus_tg6:  { name: 'Olympus TG-6',          focalLength: 4.5,  sensorW: 6.17, sensorH: 4.55, imgW: 4000, imgH: 3000 },
  bluerobotics_lpe: { name: 'BlueRobotics LPE Cam', focalLength: 3.6, sensorW: 6.4, sensorH: 4.8, imgW: 4608, imgH: 3456 }
};

function applyPreset() {
  const key = document.getElementById('cameraPreset').value;
  if (key === 'custom') return;
  const p = CAMERA_PRESETS[key];
  document.getElementById('focalLength').value = p.focalLength;
  document.getElementById('sensorW').value = p.sensorW;
  document.getElementById('sensorH').value = p.sensorH;
  document.getElementById('imgW').value = p.imgW;
  document.getElementById('imgH').value = p.imgH;
  recalculate();
}

function syncSlider(sliderId, valId) {
  document.getElementById(valId).textContent = document.getElementById(sliderId).value + '%';
}

function getSpeedMs() {
  const v = parseFloat(document.getElementById('speed').value);
  const unit = document.getElementById('speedUnit').value;
  return unit === 'knots' ? v * 0.514444 : v;
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

  // GSD in mm/px
  const gsd = (sw * alt) / (fl * iw) * 1000;

  // Ground footprint in metres
  const fpW = (sw * alt) / fl;
  const fpH = (sh * alt) / fl;

  // Along-track (forward)
  const frameSpacing  = fpH * (1 - fo);   // m between trigger events
  const triggerRateHz = spd / frameSpacing; // Hz
  const triggerIntervalS = 1 / triggerRateHz;

  // Cross-track
  const transectSpacing = fpW * (1 - sl);  // m between transect centrelines

  return { gsd, fpW, fpH, frameSpacing, triggerRateHz, triggerIntervalS, transectSpacing, alt, spd, fo, sl };
}

function recalculate() {
  // Show/hide custom bearing row
  const dir = document.getElementById('transectDir').value;
  document.getElementById('bearingLabel').style.display = dir === 'custom' ? '' : 'none';
  document.getElementById('bearing').style.display      = dir === 'custom' ? '' : 'none';

  const c = calcPhotogrammetry();
  if (!c) return;

  document.getElementById('r_gsd').textContent = c.gsd.toFixed(2) + ' mm/px';
  document.getElementById('r_fp').textContent  = c.fpW.toFixed(2) + ' m × ' + c.fpH.toFixed(2) + ' m';
  document.getElementById('r_fs').textContent  = c.frameSpacing.toFixed(3) + ' m';
  document.getElementById('r_tr').textContent  = c.triggerRateHz.toFixed(3) + ' Hz (' + (c.triggerRateHz * 60).toFixed(1) + '/min)';
  document.getElementById('r_ti').textContent  = c.triggerIntervalS.toFixed(2) + ' s';
  document.getElementById('r_ts').textContent  = c.transectSpacing.toFixed(2) + ' m';

  // Area-dependent results updated by redrawTransects
  if (window._surveyBounds) redrawTransects();
}

// KML, CSV and QGroundControl .plan export

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportKML() {
  const d = window._transectData;
  if (!d) return;
  const c = d.calc;

  let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>Underwater Photogrammetry Survey</name>
  <description>
    GSD: ${c.gsd.toFixed(2)} mm/px
    Footprint: ${c.fpW.toFixed(2)} m x ${c.fpH.toFixed(2)} m
    Frame spacing: ${c.frameSpacing.toFixed(3)} m
    Trigger rate: ${c.triggerRateHz.toFixed(3)} Hz
    Transect spacing: ${c.transectSpacing.toFixed(2)} m
    Transects: ${d.nTransects}
    Estimated photos: ${(d.nTransects * d.nTriggers).toLocaleString()}
  </description>
  <Style id="transect">
    <LineStyle><color>ffff8800</color><width>2</width></LineStyle>
  </Style>
  <Style id="trigger">
    <IconStyle>
      <color>ff00ccff</color>
      <scale>0.4</scale>
      <Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon>
    </IconStyle>
    <LabelStyle><scale>0</scale></LabelStyle>
  </Style>
`;

  // Transect lines
  d.transectLines.forEach((pts, i) => {
    const coords = pts.map(p => `${p[1]},${p[0]},0`).join('\n        ');
    kml += `  <Placemark>
    <name>Transect ${i+1}</name>
    <styleUrl>#transect</styleUrl>
    <LineString>
      <altitudeMode>clampToGround</altitudeMode>
      <coordinates>
        ${coords}
      </coordinates>
    </LineString>
  </Placemark>\n`;
  });

  // Trigger waypoints as a single folder
  kml += `  <Folder><name>Trigger Points</name>\n`;
  d.triggerPoints.forEach((p, i) => {
    kml += `  <Placemark>
    <name>T${i+1}</name>
    <styleUrl>#trigger</styleUrl>
    <Point><coordinates>${p[1]},${p[0]},0</coordinates></Point>
  </Placemark>\n`;
  });
  kml += `  </Folder>\n</Document>\n</kml>`;

  downloadBlob(kml, 'photogrammetry_survey.kml', 'application/vnd.google-earth.kml+xml');
}

function exportCSV() {
  const d = window._transectData;
  if (!d) return;
  const c = d.calc;

  let csv = 'Type,Latitude,Longitude,TransectNo,PointNo,Notes\n';

  // Transect start/end
  d.transectMeta.forEach(t => {
    csv += `TransectStart,${t.start[0].toFixed(8)},${t.start[1].toFixed(8)},${t.index},0,""\n`;
    csv += `TransectEnd,${t.end[0].toFixed(8)},${t.end[1].toFixed(8)},${t.index},0,""\n`;
  });

  // Trigger points — transect and point numbers come from triggerMeta
  d.triggerPoints.forEach((p, i) => {
    const { transectNo, pointNo } = d.triggerMeta[i];
    csv += `Trigger,${p[0].toFixed(8)},${p[1].toFixed(8)},${transectNo},${pointNo},"${c.triggerIntervalS.toFixed(2)}s interval"\n`;
  });

  // Summary block
  csv += `\n# Survey Summary\n`;
  csv += `# GSD,${c.gsd.toFixed(2)} mm/px\n`;
  csv += `# Footprint,${c.fpW.toFixed(2)}m x ${c.fpH.toFixed(2)}m\n`;
  csv += `# Frame spacing,${c.frameSpacing.toFixed(3)} m\n`;
  csv += `# Trigger rate,${c.triggerRateHz.toFixed(3)} Hz\n`;
  csv += `# Transect spacing,${c.transectSpacing.toFixed(2)} m\n`;
  csv += `# Transects,${d.nTransects}\n`;
  csv += `# Est. photos,${(d.nTransects * d.nTriggers).toLocaleString()}\n`;

  downloadBlob(csv, 'photogrammetry_waypoints.csv', 'text/csv');
}

function exportPlan() {
  const d = window._transectData;
  if (!d) return;
  const c = d.calc;

  // ArduSub: depth = negative altitude in MAV_FRAME_GLOBAL_RELATIVE_ALT (frame 3).
  // e.g. 2 m above seabed → Altitude: -2.  Home is at the surface (alt 0).
  const depthM    = -Math.abs(c.alt);
  const spdMs     = parseFloat(c.spd.toFixed(4));
  const firmware  = parseInt(document.getElementById('qgcFirmware').value);
  const vehicle   = parseInt(document.getElementById('qgcVehicle').value);
  const hoverSpd  = parseFloat(document.getElementById('qgcHoverSpeed').value) || 5;

  // MAV_CMD_NAV_WAYPOINT (16), frame 3 = MAV_FRAME_GLOBAL_RELATIVE_ALT.
  // params[3] must be 0 (not null) — QGC renders null yaw as NaN heading.
  const items = d.triggerPoints.map((p, i) => ({
    AMSLAltAboveTerrain: null,
    Altitude: depthM,
    AltitudeMode: 1,             // 1 = Above Home (relative) — matches frame 3
    autoContinue: true,
    command: 16,
    doJumpId: i + 1,
    frame: 3,                    // MAV_FRAME_GLOBAL_RELATIVE_ALT
    params: [0, 0, 0, 0, p[0], p[1], depthM],
    type: "SimpleItem"
  }));

  // Home position: sea surface (altitude 0) above first waypoint
  const firstPt = d.triggerPoints[0];
  const home = firstPt
    ? [parseFloat(firstPt[0].toFixed(14)), parseFloat(firstPt[1].toFixed(14)), 0]
    : [0, 0, 0];

  const plan = {
    fileType: "Plan",
    geoFence: { circles: [], polygons: [], version: 2 },
    groundStation: "QGroundControl",
    mission: {
      cruiseSpeed: spdMs,
      firmwareType: firmware,
      globalPlanAltitudeMode: 1,  // 1 = Above Home (relative to surface)
      hoverSpeed: hoverSpd,
      items,
      plannedHomePosition: home,
      vehicleType: vehicle,
      version: 2
    },
    rallyPoints: { points: [], version: 2 },
    version: 1
  };

  downloadBlob(JSON.stringify(plan, null, 4), 'photogrammetry_survey.plan', 'application/json');
}

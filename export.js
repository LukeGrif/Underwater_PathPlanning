// KML and CSV export

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

  // Trigger points — include transect index
  const nTrig = d.nTriggers;
  d.triggerPoints.forEach((p, i) => {
    const transectNo = Math.floor(i / nTrig) + 1;
    const pointNo    = (i % nTrig) + 1;
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

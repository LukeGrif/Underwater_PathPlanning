# Underwater Photogrammetry Planner

An interactive browser-based tool for planning underwater photogrammetry surveys. Draw a survey area over satellite imagery, set your camera and vehicle parameters, and instantly compute trigger rates, frame spacing, and overlap — then export directly to QGroundControl, Google Earth, or CSV.

---

## Features

- **Draw survey areas** — polygon or rectangle directly on satellite imagery
- **Camera presets** — GoPro Hero 12, Sony RX100 VII, Sony ILX-LR1 (61 MP), Olympus TG-6, BlueRobotics LPE Cam, or fully custom
- **Real-time overlap calculation** — GSD, footprint, frame spacing, trigger rate, sidelap and forward overlap update as you type
- **Bidirectional speed ↔ trigger interval** — edit either field and the other updates automatically
- **Transect generation** — boustrophedon (lawnmower) pattern clipped to polygon boundary, including concave shapes
- **Custom heading** — interactive compass wheel to set any survey bearing
- **DVL start position** — first waypoint coordinates in decimal degrees and DMS with one-click copy
- **Export formats**
  - `.plan` — QGroundControl / ArduPilot (submarine vehicle type, ArduPilot firmware)
  - `.kml` — opens directly in Google Earth Pro with transect lines and trigger waypoints
  - `.csv` — all waypoints with transect and point numbers

---

## Quick Start

No build step or server required. Clone the repo and open `index.html` in any modern browser.

```bash
git clone https://github.com/LukeGrif/Underwater_PathPlanning.git
cd Underwater_PathPlanning
open index.html        # Mac
start index.html       # Windows
xdg-open index.html    # Linux
```

---

## Usage

1. **Set camera parameters** — pick a preset or enter focal length, sensor dimensions, and image resolution manually
2. **Set survey parameters** — altitude above the canal bed, travel speed (m/s or knots), forward overlap %, and sidelap %
3. **Draw your survey area** — click **Draw Survey Area** to place polygon vertices (double-click to close), or use the rectangle tool in the map toolbar
4. **Review results** — GSD, footprint, trigger rate, transect count, estimated photos, survey time, and coverage area update instantly
5. **Note the DVL start position** — latitude and longitude of the first waypoint is shown in decimal degrees and DMS; click **Copy decimal** to copy to clipboard
6. **Export** — choose `.plan` for QGroundControl, `.kml` for Google Earth, or `.csv` for custom processing

---

## Photogrammetry Calculations

| Parameter | Formula |
|---|---|
| GSD | `(sensor_width × altitude) / (focal_length × image_width_px)` |
| Footprint width | `(sensor_width × altitude) / focal_length` |
| Footprint height | `(sensor_height × altitude) / focal_length` |
| Frame spacing | `footprint_height × (1 − forward_overlap)` |
| Trigger rate | `speed / frame_spacing` |
| Transect spacing | `footprint_width × (1 − sidelap)` |

---

## File Structure

```
index.html          Main app layout and UI
style.css           Dark-theme styling
photogrammetry.js   Camera presets, overlap calculations, bearing wheel
map.js              Leaflet map, polygon drawing, transect generation and clipping
export.js           QGroundControl .plan, KML, and CSV export
logo.png            Research group logo (add your own)
```

---

## Export Formats

### QGroundControl `.plan`
Produces a valid ArduPilot mission file with:
- `vehicleType: 12` (submarine)
- `firmwareType: 3` (ArduPilot)
- One `MAV_CMD_NAV_WAYPOINT` (command 16, frame 3) per trigger point
- `cruiseSpeed` set from the travel speed input
- Configurable firmware type, vehicle type, and hover speed in the QGC Export panel

### Google Earth KML
Transect lines and trigger point placemarks, grouped into a folder. Open with Google Earth Pro for visual verification.

### CSV
One row per waypoint with columns: `Type`, `Latitude`, `Longitude`, `TransectNo`, `PointNo`, `Notes`. A summary block appended at the end lists all key survey parameters.

---

## Camera Presets

| Preset | Sensor (mm) | Resolution | Default FL |
|---|---|---|---|
| GoPro Hero 12 (wide) | 6.17 × 4.55 | 5568 × 4176 | 2.92 mm |
| Sony RX100 VII | 13.2 × 8.8 | 5472 × 3648 | 8.8 mm |
| Sony ILX-LR1 + 20mm | 35.9 × 24.0 | 9504 × 6336 | 20 mm |
| Olympus TG-6 | 6.17 × 4.55 | 4000 × 3000 | 4.5 mm |
| BlueRobotics LPE Cam | 6.4 × 4.8 | 4608 × 3456 | 3.6 mm |

The Sony ILX-LR1 preset assumes a 20 mm E-mount lens. Change the focal length field for other lenses.

---

## Adding Your Logo

Place your logo image in the repo root as `logo.png`. It will appear automatically above the app title in the sidebar. Any format works (PNG, SVG, WebP); it is scaled to a maximum height of 52 px.

---

## Dependencies (CDN — no install needed)

- [Leaflet 1.9.4](https://leafletjs.com/) — interactive map
- [Leaflet.draw 1.0.4](https://github.com/Leaflet/Leaflet.draw) — polygon and rectangle drawing tools
- Esri World Imagery — satellite basemap tiles (no API key required)

---

## Author

**Luke Griffin** — [github.com/LukeGrif](https://github.com/LukeGrif)

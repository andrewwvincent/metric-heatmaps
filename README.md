# Score Visualizer

An interactive map visualization tool for analyzing enrollment and wealth scores across different counties.

## Features

- **Multiple Visualizations**: View absolute thresholds, individual score quartiles, or combined metrics
- **Enrollment Modes**: Toggle between Private Only and Private + Public enrollment data
- **Absolute Filter**: Filter block groups to only those meeting ES ≥ 2500 AND WS ≥ 2500 thresholds
- **Display Controls**: Adjust boundaries and opacity for optimal viewing
- **Multi-County Support**: Pre-loaded data for counties across multiple states

## Available Counties

- **Arizona**: Maricopa County
- **California**: Alameda, Los Angeles, Orange, San Diego, Santa Clara
- **Illinois**: Cook County
- **Massachusetts**: Middlesex, Suffolk
- **New York**: Nassau County
- **Texas**: Harris County
- **Washington**: King County

## How to Use

1. **Select County**: Choose a state and county from the dropdowns
2. **Absolute Filter**: Toggle to filter block groups by threshold (ES ≥ 2500 & WS ≥ 2500)
3. **Select Visualization**: Choose from:
   - Absolute Check (red if meets threshold)
   - Enrollment Score Quartiles
   - Wealth Score Quartiles
   - Combined ES + WS Quartiles
4. **Enrollment Type**: Switch between Private Only or Private + Public data
5. **Display Options**: Toggle boundaries and adjust fill opacity

## Color Legend

### Quartile Visualizations
- **Red (#ef4444)**: Top 25% (highest scores)
- **Orange (#f97316)**: 50-75%
- **Yellow (#eab308)**: 25-50%
- **Blue (#3b82f6)**: Bottom 25% (lowest scores)

### Combined Quartiles Logic
- **Red**: If either ES or WS is red
- **Blue**: If either ES or WS is blue
- **Orange**: If both are orange
- **Yellow**: If both are yellow, or one yellow + one orange

## Technical Details

All visualizations are **pre-computed** during data processing, ensuring instant loading and switching between views. The tool uses Leaflet.js for mapping and loads data from pre-processed JSON files.

## Data Structure

Each county has a unified JSON file containing:
- Block group GEOIDs
- Enrollment Score (Private)
- Enrollment Score Plus (Private + Public)
- Wealth Score
- Pre-computed colors for all 12 visualization combinations

## GitHub Pages Deployment

This tool is designed to run on GitHub Pages. Simply upload the entire `score-visualizer` directory to your repository and enable GitHub Pages.

### Required Files
- `index.html` - Main application
- `app.js` - Application logic
- `data/` - Directory containing:
  - `counties.json` - County manifest
  - `*.json` - Individual county unified score files

## License

This project is part of the Map Coloring Generator toolkit.

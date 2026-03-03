// --- Supabase Config ---
const SUPABASE_URL = 'https://mnxgkozrutvylzeogphh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ueGdrb3pydXR2eWx6ZW9ncGhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkxNTM3MjUsImV4cCI6MjA2NDcyOTcyNX0.SAxTY42F5W_XdA6p7g5fnlunu0yGzNacoBXWTmNj4is';
const SUPABASE_HEADERS = { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` };

// --- State ---
let map;
let currentLayer;
let countyBoundaryLayers = [];
let scoreData = {};
let currentMetric = 'es_ws_avg';
let availableCounties = [];
let boundariesVisible = true;
let fillOpacity = 0.6;
let isMultiCountyMode = false;
let searchMarkers = [];
let countyBoundariesVisible = true;
let customLocationsLayer = null;
let customLocationsVisible = false;
let customLocationsData = null;
let currentStateCode = null;
let loadedCounties = [];

const STATE_NAMES = {
    '01': 'Alabama', '02': 'Alaska', '04': 'Arizona', '05': 'Arkansas', '06': 'California',
    '08': 'Colorado', '09': 'Connecticut', '10': 'Delaware', '11': 'District of Columbia',
    '12': 'Florida', '13': 'Georgia', '15': 'Hawaii', '16': 'Idaho', '17': 'Illinois',
    '18': 'Indiana', '19': 'Iowa', '20': 'Kansas', '21': 'Kentucky', '22': 'Louisiana',
    '23': 'Maine', '24': 'Maryland', '25': 'Massachusetts', '26': 'Michigan', '27': 'Minnesota',
    '28': 'Mississippi', '29': 'Missouri', '30': 'Montana', '31': 'Nebraska', '32': 'Nevada',
    '33': 'New Hampshire', '34': 'New Jersey', '35': 'New Mexico', '36': 'New York',
    '37': 'North Carolina', '38': 'North Dakota', '39': 'Ohio', '40': 'Oklahoma', '41': 'Oregon',
    '42': 'Pennsylvania', '44': 'Rhode Island', '45': 'South Carolina', '46': 'South Dakota',
    '47': 'Tennessee', '48': 'Texas', '49': 'Utah', '50': 'Vermont', '51': 'Virginia',
    '53': 'Washington', '54': 'West Virginia', '55': 'Wisconsin', '56': 'Wyoming'
};

// --- Map Init ---
function initMap() {
    map = L.map('map', {
        zoomSnap: 0.25,
        zoomDelta: 0.25,
        wheelPxPerZoomLevel: 120
    }).setView([37.7749, -122.4194], 10);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 18
    }).addTo(map);
}

// --- Color Logic ---
function getScoreColor(score) {
    if (score == null || score < 0.10) return null;
    if (score >= 0.75) return '#ef4444'; // Red
    if (score >= 0.50) return '#f97316'; // Orange
    if (score >= 0.25) return '#eab308'; // Yellow
    return '#3b82f6'; // Blue (0.10 - 0.25)
}

function getFeatureStyle(feature) {
    const geoid = feature.properties.GEOID;
    const data = scoreData[geoid];

    if (!data) {
        return { fillColor: '#9ca3af', weight: 0, opacity: 0, color: '#fff', fillOpacity: 0 };
    }

    const score = data[currentMetric];
    const fillColor = getScoreColor(score);

    if (!fillColor) {
        return { fillColor: '#9ca3af', weight: 0, opacity: 0, color: '#fff', fillOpacity: 0 };
    }

    return {
        fillColor: fillColor,
        weight: boundariesVisible ? 1 : 0,
        opacity: boundariesVisible ? 1 : 0,
        color: '#fff',
        fillOpacity: fillOpacity
    };
}

// --- Legend ---
function updateLegend() {
    const content = document.getElementById('legend-content');
    const metricLabels = {
        es_ws_avg: 'ES-WS-Avg', esplus_ws_avg: 'ES+-WS-Avg',
        es_ws_weighted: 'ES-WS-Weighted', esplus_ws_weighted: 'ES+-WS-Weighted'
    };
    const label = metricLabels[currentMetric] || currentMetric;

    content.innerHTML = `
        <p style="font-size: 0.8rem; color: #64748b; margin-bottom: 10px;">${label}</p>
        <div class="legend-item"><div class="legend-color" style="background-color: #ef4444;"></div><span class="legend-label">0.75+ (High)</span></div>
        <div class="legend-item"><div class="legend-color" style="background-color: #f97316;"></div><span class="legend-label">0.50 - 0.75</span></div>
        <div class="legend-item"><div class="legend-color" style="background-color: #eab308;"></div><span class="legend-label">0.25 - 0.50</span></div>
        <div class="legend-item"><div class="legend-color" style="background-color: #3b82f6;"></div><span class="legend-label">0.10 - 0.25 (Low)</span></div>
        <div class="legend-item"><div class="legend-color" style="background-color: #f8f9fa;"></div><span class="legend-label">&lt; 0.10 (Hidden)</span></div>
    `;
}

// --- URL State ---
function updateURL() {
    const params = new URLSearchParams();

    const center = map.getCenter();
    params.set('lat', center.lat.toFixed(6));
    params.set('lng', center.lng.toFixed(6));
    params.set('zoom', map.getZoom().toFixed(2));
    params.set('metric', currentMetric);
    params.set('borders', boundariesVisible ? '1' : '0');
    params.set('opacity', Math.round(fillOpacity * 100));
    params.set('pins', customLocationsVisible ? '1' : '0');

    if (isMultiCountyMode) {
        params.set('countyBorders', countyBoundariesVisible ? '1' : '0');
    }

    if (currentStateCode && loadedCounties.length > 0) {
        params.set('state', currentStateCode);
        params.set('counties', loadedCounties.join(','));
    }

    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
}

function loadFromURL() {
    const params = new URLSearchParams(window.location.search);

    // Viewport
    const lat = params.get('lat');
    const lng = params.get('lng');
    const zoom = params.get('zoom');
    if (lat && lng && zoom) {
        map.setView([parseFloat(lat), parseFloat(lng)], parseFloat(zoom));
    }

    // Metric (map legacy names to new names)
    const metricAliases = {
        esTrad: 'es_ws_avg', esTradPlus: 'esplus_ws_avg',
        esWeighted: 'es_ws_weighted', esWeightedPlus: 'esplus_ws_weighted'
    };
    let metric = params.get('metric');
    if (metric) {
        metric = metricAliases[metric] || metric;
        currentMetric = metric;
        document.querySelectorAll('.radio-option').forEach(opt => {
            if (opt.dataset.metric === metric) {
                opt.classList.add('selected');
                opt.querySelector('input').checked = true;
            } else {
                opt.classList.remove('selected');
            }
        });
    }

    // Borders
    const borders = params.get('borders');
    if (borders !== null) boundariesVisible = (borders === '1');

    // Opacity
    const opacity = params.get('opacity');
    if (opacity) {
        fillOpacity = parseInt(opacity) / 100;
        const slider = document.getElementById('opacity-slider');
        const val = document.getElementById('opacity-value');
        if (slider) slider.value = opacity;
        if (val) val.textContent = `${opacity}%`;
    }

    // County borders
    const countyBorders = params.get('countyBorders');
    if (countyBorders !== null) countyBoundariesVisible = (countyBorders === '1');

    // Custom locations
    const pins = params.get('pins');
    if (pins !== null) {
        customLocationsVisible = (pins === '1');
        const toggleBtn = document.getElementById('toggle-custom-locations-btn');
        if (toggleBtn) toggleBtn.textContent = customLocationsVisible ? 'Hide Custom Locations' : 'Show Custom Locations';
        if (customLocationsVisible && customLocationsData) displayCustomLocations();
    }

    // Load counties
    const state = params.get('state');
    const counties = params.get('counties');
    if (state && counties) {
        const stateSelect = document.getElementById('state-select');
        stateSelect.value = state;
        populateCountyList(state);

        const countyCodes = counties.split(',');
        // Check the appropriate checkboxes
        countyCodes.forEach(code => {
            const cb = document.querySelector(`#county-list input[value="${code}"]`);
            if (cb) cb.checked = true;
        });
        updateLoadButton();

        setTimeout(() => loadSelectedCounties(), 300);
    }
}

// --- Supabase Score Fetching ---
async function fetchStateScores(stateCode) {
    const allScores = {};
    const pageSize = 1000;
    let offset = 0;

    while (true) {
        const url = `${SUPABASE_URL}/rest/v1/heatmap_scores?state_fips=eq.${stateCode}` +
            `&select=geoid,es_ws_avg,esplus_ws_avg,es_ws_weighted,esplus_ws_weighted` +
            `&limit=${pageSize}&offset=${offset}`;
        const resp = await fetch(url, { headers: SUPABASE_HEADERS });
        if (!resp.ok) { console.error('Supabase fetch error:', resp.status); break; }
        const rows = await resp.json();
        rows.forEach(row => { allScores[row.geoid] = row; });
        if (rows.length < pageSize) break;
        offset += pageSize;
    }
    return allScores;
}

// --- Data Loading ---
async function loadAvailableCounties() {
    const response = await fetch('data/counties.json');
    availableCounties = await response.json();
    populateStateDropdown();
}

function populateStateDropdown() {
    const stateSelect = document.getElementById('state-select');
    const states = [...new Set(availableCounties.map(c => c.stateCode))].sort();

    states.forEach(code => {
        const name = STATE_NAMES[code] || code;
        const count = availableCounties.filter(c => c.stateCode === code).length;
        const option = document.createElement('option');
        option.value = code;
        option.textContent = `${name} (${count} counties)`;
        stateSelect.appendChild(option);
    });
}

function populateCountyList(stateCode) {
    const list = document.getElementById('county-list');
    const btns = document.getElementById('county-btns');
    const counties = availableCounties.filter(c => c.stateCode === stateCode).sort((a, b) => a.name.localeCompare(b.name));

    list.innerHTML = '';
    counties.forEach(county => {
        const label = document.createElement('label');
        label.innerHTML = `<input type="checkbox" value="${county.countyCode}" data-state="${county.stateCode}"> ${county.name}`;
        list.appendChild(label);
    });

    list.style.display = counties.length > 0 ? 'block' : 'none';
    btns.style.display = counties.length > 0 ? 'flex' : 'none';

    // Listen for checkbox changes
    list.querySelectorAll('input').forEach(cb => {
        cb.addEventListener('change', updateLoadButton);
    });

    updateLoadButton();
}

function updateLoadButton() {
    const checked = document.querySelectorAll('#county-list input:checked');
    const btn = document.getElementById('load-counties-btn');
    btn.disabled = checked.length === 0;
    btn.textContent = checked.length === 0 ? 'Load Selected Counties' : `Load ${checked.length} Counties`;
}

async function loadSelectedCounties() {
    const checked = document.querySelectorAll('#county-list input:checked');
    if (checked.length === 0) return;

    const stateCode = checked[0].dataset.state;
    const countyCodes = Array.from(checked).map(cb => cb.value);

    // Clear existing
    if (currentLayer) map.removeLayer(currentLayer);
    clearCountyBoundaries();
    scoreData = {};
    loadedCounties = [];
    currentStateCode = stateCode;
    isMultiCountyMode = countyCodes.length > 1;

    // Show progress
    const progressDiv = document.getElementById('loading-progress');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    progressDiv.style.display = 'block';

    let allFeatures = [];
    let totalLoaded = 0;

    // Fetch all scores for this state from Supabase upfront (one query)
    progressText.textContent = 'Fetching scores...';
    scoreData = await fetchStateScores(stateCode);

    // Load in batches of 8
    const batchSize = 8;
    for (let i = 0; i < countyCodes.length; i += batchSize) {
        const batch = countyCodes.slice(i, i + batchSize);
        const promises = batch.map(async (countyCode) => {
            const county = availableCounties.find(c => c.stateCode === stateCode && c.countyCode === countyCode);
            if (!county) return null;

            try {
                // Load geometry (TopoJSON or GeoJSON)
                const geoResp = await fetch(`data/${county.geojsonFile}`);
                if (!geoResp.ok) return null;
                const geoData = await geoResp.json();

                let features;
                if (geoData.type === 'Topology') {
                    // TopoJSON: convert to GeoJSON
                    const objectName = Object.keys(geoData.objects)[0];
                    const geo = topojson.feature(geoData, geoData.objects[objectName]);
                    features = geo.features || [];

                    // Derive county boundary from TopoJSON mesh (for multi-county)
                    if (isMultiCountyMode) {
                        try {
                            const merged = topojson.merge(geoData, geoData.objects[objectName].geometries);
                            const bndGeo = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: merged }] };
                            const bndLayer = L.geoJSON(bndGeo, {
                                style: { color: '#1e40af', weight: 2, fill: false, opacity: countyBoundariesVisible ? 0.8 : 0 }
                            }).addTo(map);
                            countyBoundaryLayers.push(bndLayer);
                        } catch (e) { /* boundary optional */ }
                    }
                } else {
                    // Plain GeoJSON fallback
                    features = geoData.features || [];
                }

                loadedCounties.push(countyCode);
                return features;
            } catch (e) {
                console.error(`Error loading county ${countyCode}:`, e);
                return null;
            }
        });

        const results = await Promise.all(promises);
        results.forEach(features => {
            if (features) allFeatures = allFeatures.concat(features);
        });

        totalLoaded += batch.length;
        const pct = Math.round((totalLoaded / countyCodes.length) * 100);
        progressBar.style.width = `${pct}%`;
        progressText.textContent = `Loading ${totalLoaded} of ${countyCodes.length} counties...`;
    }

    // Create layer
    const geojson = { type: 'FeatureCollection', features: allFeatures };
    currentLayer = L.geoJSON(geojson, {
        style: getFeatureStyle,
        onEachFeature: (feature, layer) => {
            layer.on('click', () => showBlockInfo(feature));
        }
    }).addTo(map);

    map.fitBounds(currentLayer.getBounds());
    updateLegend();
    updateURL();

    // Update status
    progressDiv.style.display = 'none';
    const status = document.getElementById('data-status');
    status.style.display = 'block';
    status.textContent = `Loaded ${loadedCounties.length} counties (${Object.keys(scoreData).length} block groups)`;
    status.style.backgroundColor = '#dcfce7';
    status.style.color = '#166534';
}

function showBlockInfo(feature) {
    const geoid = feature.properties.GEOID;
    const data = scoreData[geoid];
    if (!data) return;

    const lines = [
        `GEOID: ${geoid}`,
        `ES-WS-Avg:       ${(data.es_ws_avg || 0).toFixed(3)}`,
        `ES+-WS-Avg:      ${(data.esplus_ws_avg || 0).toFixed(3)}`,
        `ES-WS-Weighted:  ${(data.es_ws_weighted || 0).toFixed(3)}`,
        `ES+-WS-Weighted: ${(data.esplus_ws_weighted || 0).toFixed(3)}`
    ];
    alert(lines.join('\n'));
}

// --- County Boundaries ---
function clearCountyBoundaries() {
    countyBoundaryLayers.forEach(layer => map.removeLayer(layer));
    countyBoundaryLayers = [];
}

function toggleCountyBoundaries() {
    countyBoundariesVisible = !countyBoundariesVisible;
    countyBoundaryLayers.forEach(layer => {
        layer.setStyle({ opacity: countyBoundariesVisible ? 0.8 : 0 });
    });
    document.getElementById('toggle-county-boundaries-btn').textContent =
        countyBoundariesVisible ? 'Hide County Boundaries' : 'Show County Boundaries';
    updateURL();
}

// --- Custom Locations ---
async function loadCustomLocations() {
    try {
        const response = await fetch('data/custom-locations.geojson');
        if (!response.ok) return;
        customLocationsData = await response.json();
        console.log(`Loaded ${customLocationsData.features.length} custom locations`);
        if (customLocationsVisible) displayCustomLocations();
    } catch (e) {
        console.error('Error loading custom locations:', e);
    }
}

function displayCustomLocations() {
    if (customLocationsLayer) {
        map.removeLayer(customLocationsLayer);
        customLocationsLayer = null;
    }
    if (!customLocationsVisible || !customLocationsData) return;

    const markers = customLocationsData.features.map(feature => {
        const coords = feature.geometry.coordinates;
        const props = feature.properties;
        const color = props.esType === 'great' ? 'green' : props.esType === 'minimal' ? 'orange' : 'red';

        const marker = L.marker([coords[1], coords[0]], {
            icon: L.icon({
                iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
                iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
            })
        });

        marker.bindPopup(`
            <div style="min-width: 200px;">
                <h3 style="margin: 0 0 8px 0; font-size: 1rem;">${props.name}</h3>
                <p style="margin: 4px 0; font-size: 0.875rem; color: #666;">${props.address}</p>
            </div>
        `);
        return marker;
    });

    customLocationsLayer = L.layerGroup(markers).addTo(map);
}

function toggleCustomLocations() {
    customLocationsVisible = !customLocationsVisible;
    displayCustomLocations();
    document.getElementById('toggle-custom-locations-btn').textContent =
        customLocationsVisible ? 'Hide Custom Locations' : 'Show Custom Locations';
    updateURL();
}

// --- Screenshot ---
async function takeScreenshot() {
    try {
        const mapElement = document.getElementById('map');
        const dataUrl = await domtoimage.toPng(mapElement, {
            quality: 1.0, bgcolor: '#ffffff', cacheBust: true,
            width: mapElement.offsetWidth, height: mapElement.offsetHeight,
            style: { margin: '0', padding: '0' }
        });
        document.getElementById('screenshot-preview').src = dataUrl;
        document.getElementById('screenshot-modal').classList.add('active');
        window.screenshotDataUrl = dataUrl;
    } catch (error) {
        console.error('Error taking screenshot:', error);
        alert('Error capturing screenshot: ' + error.message);
    }
}

function downloadScreenshot() {
    if (!window.screenshotDataUrl) return;
    const link = document.createElement('a');
    link.download = `map-screenshot-${new Date().getTime()}.png`;
    link.href = window.screenshotDataUrl;
    link.click();
    document.getElementById('screenshot-modal').classList.remove('active');
    window.screenshotDataUrl = null;
}

// --- Address Search ---
async function searchAddress() {
    const input = document.getElementById('address-search');
    const address = input.value.trim();
    if (!address) return;

    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`);
        const results = await response.json();
        if (results.length === 0) { alert('Address not found.'); return; }

        const result = results[0];
        const lat = parseFloat(result.lat);
        const lon = parseFloat(result.lon);

        const marker = L.marker([lat, lon]).addTo(map);
        marker.bindPopup(`<b>${result.display_name}</b>`).openPopup();
        searchMarkers.push(marker);
        map.setView([lat, lon], 14);

        document.getElementById('pin-count').textContent = `${searchMarkers.length} pins`;
        input.value = '';
        updateURL();
    } catch (error) {
        alert('Error searching address: ' + error.message);
    }
}

function clearPins() {
    searchMarkers.forEach(m => map.removeLayer(m));
    searchMarkers = [];
    document.getElementById('pin-count').textContent = '0 pins';
    updateURL();
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', async () => {
    initMap();

    // Load data
    await loadAvailableCounties();
    await loadCustomLocations();
    setTimeout(loadFromURL, 300);

    // Map events
    map.on('moveend', updateURL);

    // State dropdown
    document.getElementById('state-select').addEventListener('change', (e) => {
        currentStateCode = e.target.value;
        if (e.target.value) {
            populateCountyList(e.target.value);
        } else {
            document.getElementById('county-list').style.display = 'none';
            document.getElementById('county-btns').style.display = 'none';
            updateLoadButton();
        }
    });

    // Select all / deselect all
    document.getElementById('select-all-btn').addEventListener('click', () => {
        document.querySelectorAll('#county-list input').forEach(cb => cb.checked = true);
        updateLoadButton();
    });
    document.getElementById('deselect-all-btn').addEventListener('click', () => {
        document.querySelectorAll('#county-list input').forEach(cb => cb.checked = false);
        updateLoadButton();
    });

    // Load button
    document.getElementById('load-counties-btn').addEventListener('click', loadSelectedCounties);

    // Metric radio buttons
    document.querySelectorAll('.radio-option').forEach(option => {
        option.addEventListener('click', () => {
            document.querySelectorAll('.radio-option').forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');
            option.querySelector('input').checked = true;
            currentMetric = option.dataset.metric;

            if (currentLayer) currentLayer.setStyle(getFeatureStyle);
            updateLegend();
            updateURL();
        });
    });

    // Boundaries toggle
    document.getElementById('toggle-boundaries-btn').addEventListener('click', () => {
        boundariesVisible = !boundariesVisible;
        document.getElementById('toggle-boundaries-btn').textContent =
            boundariesVisible ? 'Hide Boundaries' : 'Show Boundaries';
        if (currentLayer) currentLayer.setStyle(getFeatureStyle);
        updateURL();
    });

    // County boundaries toggle
    document.getElementById('toggle-county-boundaries-btn').addEventListener('click', toggleCountyBoundaries);

    // Custom locations toggle
    document.getElementById('toggle-custom-locations-btn').addEventListener('click', toggleCustomLocations);

    // Opacity slider
    document.getElementById('opacity-slider').addEventListener('input', (e) => {
        fillOpacity = parseInt(e.target.value) / 100;
        document.getElementById('opacity-value').textContent = `${e.target.value}%`;
        if (currentLayer) currentLayer.setStyle(getFeatureStyle);
        updateURL();
    });

    // Screenshot
    document.getElementById('screenshot-btn').addEventListener('click', takeScreenshot);
    document.getElementById('screenshot-download').addEventListener('click', downloadScreenshot);
    document.getElementById('screenshot-cancel').addEventListener('click', () => {
        document.getElementById('screenshot-modal').classList.remove('active');
        window.screenshotDataUrl = null;
    });

    // Address search
    document.getElementById('search-button').addEventListener('click', searchAddress);
    document.getElementById('address-search').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchAddress();
    });
    document.getElementById('clear-pins-btn').addEventListener('click', clearPins);
});

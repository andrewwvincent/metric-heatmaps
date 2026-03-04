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
let boundariesVisible = false;
let fillOpacity = 0.6;
let isMultiCountyMode = false;
let searchMarkers = [];
let countyBoundariesVisible = true;
let customLocationsLayer = null;
let customLocationsVisible = false;
let customLocationsData = null;
let currentStateCode = null;
let loadedCounties = [];
let schoolClosuresLayer = null;
let schoolClosuresVisible = false;
let schoolClosuresData = [];
let schoolClosuresFetchedState = null;

let moodysVisible = false;
let moodysLayer = null;
let moodysProperties = [];
let moodysListings = {};
let moodysContacts = {};
let moodysFetchedKey = null;

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
    const exportStateSelect = document.getElementById('export-state-select');
    const states = [...new Set(availableCounties.map(c => c.stateCode))].sort();

    states.forEach(code => {
        const name = STATE_NAMES[code] || code;
        const count = availableCounties.filter(c => c.stateCode === code).length;

        const option = document.createElement('option');
        option.value = code;
        option.textContent = `${name} (${count} counties)`;
        stateSelect.appendChild(option);

        const exportOption = document.createElement('option');
        exportOption.value = code;
        exportOption.textContent = name;
        exportStateSelect.appendChild(exportOption);
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

    // Refresh school closures overlay if visible (re-filter for newly loaded counties)
    if (schoolClosuresVisible) {
        if (schoolClosuresFetchedState !== stateCode) {
            schoolClosuresData = await fetchSchoolClosures(stateCode);
            schoolClosuresFetchedState = stateCode;
        }
        displaySchoolClosures();
    }

    // Refresh Moody's overlay if visible
    if (moodysVisible) {
        const fetchKey = currentStateCode + [...loadedCounties].sort().join(',');
        if (moodysFetchedKey !== fetchKey) {
            const { properties, listings, contacts } = await fetchMoodysData(currentStateCode, loadedCounties);
            moodysProperties = properties;
            moodysListings = listings;
            moodysContacts = contacts;
            moodysFetchedKey = fetchKey;
        }
        displayMoodysMarkers();
    }
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

// --- School Closures ---
const schoolClosureIcon = L.divIcon({
    className: '',
    html: '<div style="width:12px;height:12px;background:#7c3aed;border:2px solid #fff;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.4);"></div>',
    iconSize: [12, 12],
    iconAnchor: [6, 6],
    popupAnchor: [0, -8]
});

async function fetchSchoolClosures(stateCode) {
    const url = `${SUPABASE_URL}/rest/v1/school_closure_schools` +
        `?block_group_geoid=like.${stateCode}%25` +
        `&select=school_name,address,district_name,status,closure_date,lat,lon,block_group_geoid`;
    const resp = await fetch(url, { headers: SUPABASE_HEADERS });
    if (!resp.ok) { console.error('School closures fetch error:', resp.status); return []; }
    return await resp.json();
}

function displaySchoolClosures() {
    if (schoolClosuresLayer) { map.removeLayer(schoolClosuresLayer); schoolClosuresLayer = null; }
    if (!schoolClosuresVisible || schoolClosuresData.length === 0 || loadedCounties.length === 0) return;

    // Only show schools whose county is currently loaded (first 5 chars of geoid = state+county FIPS)
    const loadedPrefixes = new Set(loadedCounties.map(cc => currentStateCode + cc));

    const markers = schoolClosuresData
        .filter(s => s.block_group_geoid && loadedPrefixes.has(s.block_group_geoid.substring(0, 5)))
        .map(s => {
            if (!s.lat || !s.lon) return null;
            const marker = L.marker([s.lat, s.lon], { icon: schoolClosureIcon });
            marker.bindPopup(`
                <div style="min-width: 200px;">
                    <h3 style="margin: 0 0 8px 0; font-size: 1rem;">${s.school_name || 'Unknown School'}</h3>
                    ${s.address ? `<p style="margin: 4px 0; font-size: 0.875rem; color: #444;">${s.address}</p>` : ''}
                    ${s.district_name ? `<p style="margin: 4px 0; font-size: 0.875rem; color: #666;">${s.district_name}</p>` : ''}
                    ${s.status ? `<p style="margin: 4px 0; font-size: 0.875rem;"><strong>Status:</strong> ${s.status}</p>` : ''}
                    ${s.closure_date ? `<p style="margin: 4px 0; font-size: 0.875rem;"><strong>Closed:</strong> ${s.closure_date}</p>` : ''}
                </div>
            `);
            return marker;
        })
        .filter(Boolean);

    schoolClosuresLayer = L.layerGroup(markers).addTo(map);
}

async function toggleSchoolClosures() {
    schoolClosuresVisible = !schoolClosuresVisible;
    const btn = document.getElementById('toggle-school-closures-btn');
    btn.textContent = schoolClosuresVisible ? 'Hide School Closures' : 'Show School Closures';

    if (schoolClosuresVisible && currentStateCode) {
        if (schoolClosuresFetchedState !== currentStateCode) {
            btn.textContent = 'Loading...';
            btn.disabled = true;
            schoolClosuresData = await fetchSchoolClosures(currentStateCode);
            schoolClosuresFetchedState = currentStateCode;
            btn.disabled = false;
            btn.textContent = 'Hide School Closures';
        }
    }

    displaySchoolClosures();
}

// --- Moody's Listings ---
const moodysIcon = L.divIcon({
    className: '',
    html: '<div style="width:18px;height:18px;background:#0ea5e9;border:3px solid #fff;border-radius:50%;box-shadow:0 1px 5px rgba(0,0,0,0.5);"></div>',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -11]
});

async function fetchMoodysData(stateCode, countyCodes) {
    const btn = document.getElementById('toggle-moodys-btn');

    // Build OR filter: bg_geoid.like.12086%25,bg_geoid.like.12011%25
    const orParts = countyCodes.map(cc => `bg_geoid.like.${stateCode + cc}%25`).join(',');

    // Fetch properties with pagination (include park fields)
    const properties = [];
    const pageSize = 2000;
    let offset = 0;
    while (true) {
        const url = `${SUPABASE_URL}/rest/v1/moodys_property` +
            `?or=(${orParts})` +
            `&select=property_source_key,property_name,property_standardized_address,` +
            `location_geopoint_latitude,location_geopoint_longitude,bg_geoid,category,` +
            `nearest_park_name,nearest_park_meters,nearest_playground_name,nearest_playground_meters` +
            `&limit=${pageSize}&offset=${offset}`;
        const resp = await fetch(url, { headers: SUPABASE_HEADERS });
        if (!resp.ok) { console.error('Moodys properties error:', resp.status); break; }
        const rows = await resp.json();
        properties.push(...rows);
        if (rows.length < pageSize) break;
        offset += pageSize;
    }

    if (btn) btn.textContent = `Loading listings for ${properties.length} properties...`;

    // Batch-fetch AVAILABLE listings (include listed_space_id for contacts join)
    const listings = {};
    const keys = properties.map(p => p.property_source_key);
    const batchSize = 100;
    const listingPromises = [];

    for (let i = 0; i < keys.length; i += batchSize) {
        const batch = keys.slice(i, i + batchSize);
        listingPromises.push(
            fetch(
                `${SUPABASE_URL}/rest/v1/moodys_listings` +
                `?property_source_key=in.(${batch.join(',')})` +
                `&listed_space_availability_status=eq.AVAILABLE` +
                `&select=property_source_key,listed_space_id,space_size_available,space_category,` +
                `space_suite,listed_space_type,lease_asking_rent_general_price_average_amount,` +
                `lease_asking_rent_general_price_period,lease_asking_rent_general_price_size` +
                `&limit=1000`,
                { headers: SUPABASE_HEADERS }
            ).then(r => r.ok ? r.json() : []).then(rows => {
                rows.forEach(row => {
                    if (!listings[row.property_source_key]) listings[row.property_source_key] = [];
                    listings[row.property_source_key].push(row);
                });
            })
        );
    }
    await Promise.all(listingPromises);

    // Collect all listed_space_ids and batch-fetch broker contacts
    if (btn) btn.textContent = 'Loading broker contacts...';
    const contacts = {};
    const listingIds = [...new Set(
        Object.values(listings).flat().map(l => l.listed_space_id).filter(Boolean)
    )];
    const contactPromises = [];
    for (let i = 0; i < listingIds.length; i += batchSize) {
        const batch = listingIds.slice(i, i + batchSize);
        contactPromises.push(
            fetch(
                `${SUPABASE_URL}/rest/v1/moodys_property_contacts` +
                `?listed_space_id=in.(${batch.join(',')})` +
                `&select=listed_space_id,contact_name,contact_role,contact_company_name` +
                `&limit=1000`,
                { headers: SUPABASE_HEADERS }
            ).then(r => r.ok ? r.json() : []).then(rows => {
                rows.forEach(row => {
                    if (!contacts[row.listed_space_id]) contacts[row.listed_space_id] = [];
                    contacts[row.listed_space_id].push(row);
                });
            })
        );
    }
    await Promise.all(contactPromises);

    return { properties, listings, contacts };
}

function displayMoodysMarkers() {
    if (moodysLayer) { map.removeLayer(moodysLayer); moodysLayer = null; }
    if (!moodysVisible || moodysProperties.length === 0 || loadedCounties.length === 0) return;

    const loadedPrefixes = new Set(loadedCounties.map(cc => currentStateCode + cc));
    const minVal = document.getElementById('moodys-min-sqft').value;
    const maxVal = document.getElementById('moodys-max-sqft').value;
    const minSqFt = minVal !== '' ? parseFloat(minVal) : null;
    const maxSqFt = maxVal !== '' ? parseFloat(maxVal) : null;

    const clusterGroup = L.markerClusterGroup({ maxClusterRadius: 40, disableClusteringAtZoom: 16 });

    moodysProperties.forEach(prop => {
        if (!prop.bg_geoid || !loadedPrefixes.has(prop.bg_geoid.substring(0, 5))) return;
        const lat = prop.location_geopoint_latitude;
        const lon = prop.location_geopoint_longitude;
        if (!lat || !lon) return;

        const listings = (moodysListings[prop.property_source_key] || []).filter(l => {
            const sz = l.space_size_available;
            if (minSqFt !== null && (sz == null || sz < minSqFt)) return false;
            if (maxSqFt !== null && (sz == null || sz > maxSqFt)) return false;
            return true;
        });
        if (listings.length === 0) return;

        const marker = L.marker([lat, lon], { icon: moodysIcon });
        marker.on('click', () => showListingsPanel(prop, listings));
        clusterGroup.addLayer(marker);
    });

    moodysLayer = clusterGroup;
    map.addLayer(moodysLayer);
}

async function toggleMoodys() {
    moodysVisible = !moodysVisible;
    const btn = document.getElementById('toggle-moodys-btn');
    btn.textContent = moodysVisible ? "Hide Moody's Listings" : "Show Moody's Listings";

    if (moodysVisible && currentStateCode && loadedCounties.length > 0) {
        const fetchKey = currentStateCode + [...loadedCounties].sort().join(',');
        if (moodysFetchedKey !== fetchKey) {
            btn.textContent = 'Loading properties...';
            btn.disabled = true;
            const { properties, listings, contacts } = await fetchMoodysData(currentStateCode, loadedCounties);
            moodysProperties = properties;
            moodysListings = listings;
            moodysContacts = contacts;
            moodysFetchedKey = fetchKey;
            btn.disabled = false;
            btn.textContent = "Hide Moody's Listings";
        }
    }

    displayMoodysMarkers();
}

function showListingsPanel(property, listings) {
    document.getElementById('listings-panel-title').textContent = property.property_name || 'Property';
    document.getElementById('listings-panel-address').textContent = property.property_standardized_address || '';
    document.getElementById('listings-panel-count').textContent =
        `${listings.length} available listing${listings.length !== 1 ? 's' : ''}`;

    // --- Scores section ---
    const scores = scoreData[property.bg_geoid];
    const metricLabels = {
        es_ws_avg: 'ES-WS-Avg', esplus_ws_avg: 'ES+-WS-Avg',
        es_ws_weighted: 'ES-WS-Weighted', esplus_ws_weighted: 'ES+-WS-Weighted'
    };
    const scoreRows = Object.entries(metricLabels).map(([key, label]) => {
        const val = scores ? scores[key] : null;
        const color = val != null ? getScoreColor(val) : null;
        const badge = color
            ? `<span class="score-badge" style="background:${color}">${val.toFixed(2)}</span>`
            : `<span class="score-badge score-na">N/A</span>`;
        return `<div class="score-row"><span class="score-label">${label}</span>${badge}</div>`;
    }).join('');

    const neighborhoodScoreRow = `<div class="score-row">
        <span class="score-label">Neighborhood Score</span>
        <span class="score-badge score-na">N/A</span>
    </div>`;

    // --- Park section ---
    const metersToMin = m => m != null ? `${Math.round(m / 80)} min walk` : null;
    const parkLine = property.nearest_park_name
        ? `<div class="park-row">🌳 ${property.nearest_park_name}${metersToMin(property.nearest_park_meters) ? ` · ${metersToMin(property.nearest_park_meters)}` : ''}</div>`
        : `<div class="park-row park-na">🌳 No nearby park data</div>`;
    const playLine = property.nearest_playground_name
        ? `<div class="park-row">🛝 ${property.nearest_playground_name}${metersToMin(property.nearest_playground_meters) ? ` · ${metersToMin(property.nearest_playground_meters)}` : ''}</div>`
        : `<div class="park-row park-na">🛝 No nearby playground data</div>`;

    // --- Listings section ---
    const listingCards = listings.map(l => {
        const sqft = l.space_size_available != null
            ? `${Number(l.space_size_available).toLocaleString()} sq ft`
            : 'Size N/A';
        const rent = l.lease_asking_rent_general_price_average_amount != null
            ? `$${l.lease_asking_rent_general_price_average_amount} / SF / ${l.lease_asking_rent_general_price_period || 'yr'}`
            : null;
        const listingContacts = l.listed_space_id ? (moodysContacts[l.listed_space_id] || []) : [];
        const contactHtml = listingContacts.length > 0
            ? listingContacts.map(c => `
                <div class="contact-row">
                    <span class="contact-name">${c.contact_name || ''}</span>
                    ${c.contact_role ? `<span class="contact-role">${c.contact_role.replace('_', ' ')}</span>` : ''}
                    ${c.contact_company_name ? `<span class="contact-company">${c.contact_company_name}</span>` : ''}
                </div>`).join('')
            : '';

        return `<div class="listing-card">
            <div class="listing-card-header">
                <span class="listing-type-badge">${l.listed_space_type || 'LEASE'}</span>
                ${l.space_suite ? `<span class="listing-suite">Suite ${l.space_suite}</span>` : ''}
            </div>
            ${l.space_category ? `<p class="listing-meta">${l.space_category}</p>` : ''}
            <p class="listing-size">${sqft}</p>
            ${rent ? `<p class="listing-rent">${rent}</p>` : ''}
            ${contactHtml ? `<div class="listing-contacts">${contactHtml}</div>` : ''}
        </div>`;
    }).join('');

    document.getElementById('listings-panel-body').innerHTML = `
        <div class="panel-section">
            <div class="panel-section-title">Demographics Scores</div>
            ${scoreRows}
            ${neighborhoodScoreRow}
        </div>
        <div class="panel-section">
            <div class="panel-section-title">Nearby Outdoor Space</div>
            ${parkLine}${playLine}
        </div>
        <div class="panel-section">
            <div class="panel-section-title">${listings.length} Available Listing${listings.length !== 1 ? 's' : ''}</div>
            ${listingCards}
        </div>
    `;

    document.getElementById('listings-panel').classList.add('active');
}

function closeListingsPanel() {
    document.getElementById('listings-panel').classList.remove('active');
}

// --- County Export Screenshot ---
let exportMap = null;
let exportLayer = null;

let exportTileLayer = null;

function initExportMap() {
    if (exportMap) return;
    exportMap = L.map('export-map', {
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
    }).setView([37.7, -96], 4);
    exportTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18
    }).addTo(exportMap);
}

function populateExportCountySelect(stateCode) {
    const select = document.getElementById('export-county-select');
    const counties = availableCounties.filter(c => c.stateCode === stateCode)
        .sort((a, b) => a.name.localeCompare(b.name));
    select.innerHTML = '<option value="">Select County...</option>';
    counties.forEach(county => {
        const opt = document.createElement('option');
        opt.value = county.countyCode;
        opt.textContent = county.name;
        select.appendChild(opt);
    });
    select.style.display = 'block';
    document.getElementById('export-county-btn').disabled = true;
}

async function generateCountyExport() {
    const stateCode  = document.getElementById('export-state-select').value;
    const countyCode = document.getElementById('export-county-select').value;
    if (!stateCode || !countyCode) return;

    const county = availableCounties.find(c => c.stateCode === stateCode && c.countyCode === countyCode);
    if (!county) return;

    const btn = document.getElementById('export-county-btn');
    const status = document.getElementById('export-status');
    btn.disabled = true;
    btn.textContent = 'Generating...';
    status.style.display = 'block';

    try {
        initExportMap();

        // Reuse already-loaded scores if same state, otherwise fetch from Supabase
        let scores;
        if (currentStateCode === stateCode && Object.keys(scoreData).length > 0) {
            scores = scoreData;
            status.textContent = 'Using cached scores...';
        } else {
            status.textContent = 'Fetching scores from Supabase...';
            scores = await fetchStateScores(stateCode);
        }

        // Fetch county geometry
        status.textContent = 'Loading geometry...';
        const geoResp = await fetch(`data/${county.geojsonFile}`);
        if (!geoResp.ok) throw new Error('Failed to load geometry');
        const geoData = await geoResp.json();

        let features;
        if (geoData.type === 'Topology') {
            const objectName = Object.keys(geoData.objects)[0];
            features = topojson.feature(geoData, geoData.objects[objectName]).features || [];
        } else {
            features = geoData.features || [];
        }

        // Clear previous export layer
        if (exportLayer) exportMap.removeLayer(exportLayer);

        // Style using current metric
        exportLayer = L.geoJSON({ type: 'FeatureCollection', features }, {
            style: (feature) => {
                const geoid = feature.properties.GEOID;
                const data = scores[geoid];
                const score = data ? data[currentMetric] : null;
                const fillColor = getScoreColor(score);
                if (!fillColor) return { fillColor: '#f1f5f9', weight: 0, opacity: 0, fillOpacity: 0.3 };
                return { fillColor, weight: 0, opacity: 0, fillOpacity: 0.85 };
            }
        }).addTo(exportMap);

        // Bring map on-screen (Leaflet needs to be in the viewport to render SVG correctly)
        const exportDiv = document.getElementById('export-map');
        const overlay = document.getElementById('export-rendering-overlay');
        const overlayText = document.getElementById('export-overlay-text');
        overlayText.textContent = 'Rendering county map...';
        overlay.classList.add('active');
        exportDiv.classList.add('rendering');

        // Let Leaflet recalculate its size and fit bounds now that it's visible
        exportMap.invalidateSize();
        exportMap.fitBounds(exportLayer.getBounds(), { padding: [20, 20] });

        // Wait for tiles to finish loading (3s max fallback)
        overlayText.textContent = 'Loading map tiles...';
        await new Promise(resolve => {
            const onLoad = () => { exportTileLayer.off('load', onLoad); resolve(); };
            exportTileLayer.on('load', onLoad);
            setTimeout(resolve, 3000);
        });
        // Small extra buffer for SVG polygon rendering
        await new Promise(resolve => setTimeout(resolve, 300));

        // Capture
        overlayText.textContent = 'Capturing image...';
        const dataUrl = await domtoimage.toPng(exportDiv, {
            quality: 1.0,
            bgcolor: '#ffffff',
            width: exportDiv.offsetWidth,
            height: exportDiv.offsetHeight,
        });

        // Return map off-screen and hide overlay
        exportDiv.classList.remove('rendering');
        overlay.classList.remove('active');

        // Show in modal
        document.getElementById('screenshot-preview').src = dataUrl;
        document.getElementById('screenshot-modal').classList.add('active');
        window.screenshotDataUrl = dataUrl;
        window.screenshotFilename = `${county.name.replace(/\s+/g, '-')}-${currentMetric}.png`;

        status.textContent = '';
        status.style.display = 'none';
    } catch (e) {
        console.error('Export error:', e);
        status.textContent = 'Error: ' + e.message;
        document.getElementById('export-map').classList.remove('rendering');
        document.getElementById('export-rendering-overlay').classList.remove('active');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Generate Screenshot';
    }
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
    link.download = window.screenshotFilename || `map-screenshot-${new Date().getTime()}.png`;
    link.href = window.screenshotDataUrl;
    link.click();
    document.getElementById('screenshot-modal').classList.remove('active');
    window.screenshotDataUrl = null;
    window.screenshotFilename = null;
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

    // School closures toggle
    document.getElementById('toggle-school-closures-btn').addEventListener('click', toggleSchoolClosures);

    // Moody's listings toggle + sqft filter
    document.getElementById('toggle-moodys-btn').addEventListener('click', toggleMoodys);
    document.getElementById('moodys-min-sqft').addEventListener('input', displayMoodysMarkers);
    document.getElementById('moodys-max-sqft').addEventListener('input', displayMoodysMarkers);
    document.getElementById('listings-panel-close').addEventListener('click', closeListingsPanel);

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

    // County export
    document.getElementById('export-state-select').addEventListener('change', (e) => {
        if (e.target.value) {
            populateExportCountySelect(e.target.value);
        } else {
            document.getElementById('export-county-select').style.display = 'none';
            document.getElementById('export-county-btn').disabled = true;
        }
    });
    document.getElementById('export-county-select').addEventListener('change', (e) => {
        document.getElementById('export-county-btn').disabled = !e.target.value;
    });
    document.getElementById('export-county-btn').addEventListener('click', generateCountyExport);

    // Address search
    document.getElementById('search-button').addEventListener('click', searchAddress);
    document.getElementById('address-search').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') searchAddress();
    });
    document.getElementById('clear-pins-btn').addEventListener('click', clearPins);
});

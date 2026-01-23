let map;
let geojsonData;
let currentLayer;
let countyBoundaryLayers = []; // Array to store county boundary layers
let scoreData = {};
let enrollmentMode = 'private'; // 'private' or 'public'
let currentVisualization = 'absolute';
let availableCounties = []; // List of counties with unified files
let absoluteFilterEnabled = true; // Filter to ES>=2500 & WS>=2500
let boundariesVisible = true;
let fillOpacity = 0.6;
let isMultiCountyMode = false; // Track if we're showing multiple counties
let searchMarkers = []; // Array of markers for address searches
let countyBoundariesVisible = true; // Toggle for county boundaries in multi-county mode
let customLocationsLayer = null; // Layer for custom location pins
let customLocationsVisible = false; // Toggle for custom locations
let customLocationsData = null; // Store custom locations GeoJSON data
let currentStateCode = null; // Track current state
let currentCountyCode = null; // Track current county
let loadedCounties = []; // Track all loaded counties in multi-county mode
let isNationalMode = false; // Track if we're showing all counties nationally
let loadingProgress = { loaded: 0, total: 0, inProgress: false }; // Track loading progress

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
    '53': 'Washington', '54': 'West Virginia', '55': 'Wisconsin', '56': 'Wyoming', '72': 'Puerto Rico'
};

// Initialize map
function initMap() {
    map = L.map('map', {
        zoomSnap: 0.25,  // Allow zoom levels in 0.25 increments
        zoomDelta: 0.25,  // Zoom in/out by 0.25 levels per click
        wheelPxPerZoomLevel: 120  // Smoother mouse wheel zooming
    }).setView([37.7749, -122.4194], 10);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18
    }).addTo(map);
}

// Take screenshot with preview
async function takeScreenshot() {
    try {
        const mapElement = document.getElementById('map');
        
        // Get exact dimensions
        const width = mapElement.offsetWidth;
        const height = mapElement.offsetHeight;
        
        // Use dom-to-image to capture the map with all layers (handles SVG/Canvas better)
        const dataUrl = await domtoimage.toPng(mapElement, {
            quality: 1.0,
            bgcolor: '#ffffff',
            cacheBust: true,
            width: width,
            height: height,
            style: {
                margin: '0',
                padding: '0'
            }
        });
        
        // Show preview modal
        const modal = document.getElementById('screenshot-modal');
        const preview = document.getElementById('screenshot-preview');
        preview.src = dataUrl;
        modal.classList.add('active');
        
        // Store data URL for download
        window.screenshotDataUrl = dataUrl;
        
    } catch (error) {
        console.error('Error taking screenshot:', error);
        alert('Error capturing screenshot: ' + error.message);
    }
}

// Download screenshot
function downloadScreenshot() {
    if (!window.screenshotDataUrl) {
        return;
    }
    
    // Create download link
    const link = document.createElement('a');
    link.download = `map-screenshot-${new Date().getTime()}.png`;
    link.href = window.screenshotDataUrl;
    link.click();
    
    // Close modal
    closeScreenshotModal();
}

// Close screenshot modal
function closeScreenshotModal() {
    const modal = document.getElementById('screenshot-modal');
    modal.classList.remove('active');
    window.screenshotDataUrl = null;
}

// URL Query String Functions
function updateURL() {
    const params = new URLSearchParams();
    
    // Save viewport (center and zoom)
    const center = map.getCenter();
    const zoom = map.getZoom();
    params.set('lat', center.lat.toFixed(6));
    params.set('lng', center.lng.toFixed(6));
    params.set('zoom', zoom.toFixed(2));
    
    // Save visualization settings
    params.set('viz', currentVisualization);
    params.set('mode', enrollmentMode);
    params.set('filter', absoluteFilterEnabled ? '1' : '0');
    params.set('borders', boundariesVisible ? '1' : '0');
    params.set('opacity', Math.round(fillOpacity * 100));
    
    // Save county boundaries visibility in multi-county mode
    if (isMultiCountyMode) {
        params.set('countyBorders', countyBoundariesVisible ? '1' : '0');
    }

    // Save custom locations visibility
    params.set('pins', customLocationsVisible ? '1' : '0');

    // Save loaded counties
    if (isNationalMode) {
        // For national mode (all counties)
        params.set('mode_type', 'national');
    } else if (isMultiCountyMode && loadedCounties.length > 0) {
        // For multi-county mode (all counties in state)
        params.set('state', currentStateCode);
        params.set('mode_type', 'all');
    } else if (currentStateCode && currentCountyCode) {
        // For single county mode
        params.set('state', currentStateCode);
        params.set('county', currentCountyCode);
    }
    
    // Update URL without reloading page
    const newURL = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, '', newURL);
}

function loadFromURL() {
    const params = new URLSearchParams(window.location.search);
    
    // Restore viewport if present
    const lat = params.get('lat');
    const lng = params.get('lng');
    const zoom = params.get('zoom');
    
    if (lat && lng && zoom) {
        map.setView([parseFloat(lat), parseFloat(lng)], parseFloat(zoom));
    }
    
    // Restore visualization settings
    const viz = params.get('viz');
    if (viz) {
        currentVisualization = viz;
        // Update UI
        document.querySelectorAll('.radio-option').forEach(option => {
            if (option.dataset.layer === viz) {
                option.classList.add('selected');
                option.querySelector('input').checked = true;
            } else {
                option.classList.remove('selected');
            }
        });
    }
    
    const mode = params.get('mode');
    if (mode) {
        enrollmentMode = mode;
        // Update UI
        const privateBtn = document.getElementById('enrollment-private');
        const publicBtn = document.getElementById('enrollment-public');
        if (privateBtn) privateBtn.checked = (mode === 'private');
        if (publicBtn) publicBtn.checked = (mode === 'public');
        
        // Update toggle buttons
        const privateToggle = document.getElementById('toggle-private');
        const publicToggle = document.getElementById('toggle-public');
        if (mode === 'private') {
            if (privateToggle) privateToggle.classList.add('active');
            if (publicToggle) publicToggle.classList.remove('active');
        } else {
            if (publicToggle) publicToggle.classList.add('active');
            if (privateToggle) privateToggle.classList.remove('active');
        }
    }
    
    const filter = params.get('filter');
    if (filter !== null) {
        absoluteFilterEnabled = (filter === '1');
        const filterCheckbox = document.getElementById('absolute-filter');
        if (filterCheckbox) filterCheckbox.checked = absoluteFilterEnabled;
        
        // Update toggle buttons
        const filterOnBtn = document.getElementById('toggle-filter-on');
        const filterOffBtn = document.getElementById('toggle-filter-off');
        if (absoluteFilterEnabled) {
            if (filterOnBtn) filterOnBtn.classList.add('active');
            if (filterOffBtn) filterOffBtn.classList.remove('active');
        } else {
            if (filterOffBtn) filterOffBtn.classList.add('active');
            if (filterOnBtn) filterOnBtn.classList.remove('active');
        }
    }
    
    const borders = params.get('borders');
    if (borders !== null) {
        boundariesVisible = (borders === '1');
    }
    
    const opacity = params.get('opacity');
    if (opacity) {
        fillOpacity = parseInt(opacity) / 100;
        const opacitySlider = document.getElementById('opacity-slider');
        const opacityValue = document.getElementById('opacity-value');
        if (opacitySlider) opacitySlider.value = opacity;
        if (opacityValue) opacityValue.textContent = `${opacity}%`;
    }
    
    const countyBorders = params.get('countyBorders');
    if (countyBorders !== null) {
        countyBoundariesVisible = (countyBorders === '1');
    }

    // Restore custom locations visibility
    const pins = params.get('pins');
    if (pins !== null) {
        customLocationsVisible = (pins === '1');
        const toggleBtn = document.getElementById('toggle-custom-locations-btn');
        if (toggleBtn) {
            toggleBtn.textContent = customLocationsVisible ? 'Hide Custom Locations' : 'Show Custom Locations';
        }
        // Display if data already loaded (loadFromURL runs after loadCustomLocations)
        if (customLocationsVisible && customLocationsData) {
            displayCustomLocations();
        }
    }

    // Load counties if specified
    const state = params.get('state');
    const county = params.get('county');
    const modeType = params.get('mode_type');

    if (modeType === 'national') {
        // Load all counties nationally
        setTimeout(() => loadAllCountiesNational(), 500);
    } else if (state) {
        // Set state dropdown
        const stateSelect = document.getElementById('state-select');
        stateSelect.value = state;
        populateCountyDropdown(state);

        if (modeType === 'all') {
            // Load all counties in state
            setTimeout(() => loadAllCountiesInState(state), 500);
        } else if (county) {
            // Load specific county
            const countySelect = document.getElementById('county-select');
            countySelect.value = county;
            setTimeout(() => loadScoreDataForCounty(state, county), 500);
        }
    }
}

// Load available counties (no longer loading full GeoJSON upfront)
async function loadGeoJSON() {
    try {
        await loadAvailableCounties();
        await loadCustomLocations();
    } catch (error) {
        console.error('Error loading counties:', error);
        alert('Error loading county data.');
    }
}

// Load custom locations from GeoJSON file
async function loadCustomLocations() {
    try {
        const response = await fetch('data/custom-locations.geojson');
        if (!response.ok) {
            console.log('No custom locations file found');
            return;
        }
        customLocationsData = await response.json();
        console.log(`Loaded ${customLocationsData.features.length} custom locations`);

        // Display if visibility was set from URL
        if (customLocationsVisible) {
            displayCustomLocations();
        }
    } catch (error) {
        console.error('Error loading custom locations:', error);
    }
}

// Get marker color based on location type and enrollment mode
function getCustomLocationColor(properties) {
    const locationType = enrollmentMode === 'private' ? properties.esType : properties.esPlusType;
    
    switch(locationType) {
        case 'great':
            return 'green';
        case 'minimal':
            return 'orange';
        case 'unacceptable':
            return 'red';
        default:
            return 'blue'; // fallback
    }
}

// Display custom locations on map
function displayCustomLocations() {
    // Remove existing layer if any
    if (customLocationsLayer) {
        map.removeLayer(customLocationsLayer);
        customLocationsLayer = null;
    }
    
    if (!customLocationsVisible || !customLocationsData) {
        return;
    }
    
    // Create markers for each location
    const markers = customLocationsData.features.map(feature => {
        const coords = feature.geometry.coordinates;
        const props = feature.properties;
        const color = getCustomLocationColor(props);
        
        const marker = L.marker([coords[1], coords[0]], {
            icon: L.icon({
                iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowSize: [41, 41]
            })
        });
        
        // Create popup content
        const locationType = enrollmentMode === 'private' ? props.esType : props.esPlusType;
        const typeLabel = locationType === 'great' ? 'Great Location' : 
                         locationType === 'minimal' ? 'Minimally Acceptable' : 
                         'Unacceptable';
        const modeLabel = enrollmentMode === 'private' ? 'Private Only' : 'Private + Public';
        
        marker.bindPopup(`
            <div style="min-width: 200px;">
                <h3 style="margin: 0 0 8px 0; font-size: 1rem;">${props.name}</h3>
                <p style="margin: 4px 0; font-size: 0.875rem; color: #666;">${props.address}</p>
                <p style="margin: 8px 0 0 0; font-size: 0.875rem;">
                    <strong>${modeLabel}:</strong> <span style="color: ${color};">${typeLabel}</span>
                </p>
            </div>
        `);
        
        return marker;
    });
    
    // Create layer group
    customLocationsLayer = L.layerGroup(markers).addTo(map);
}

// Toggle custom locations visibility
function toggleCustomLocations() {
    customLocationsVisible = !customLocationsVisible;
    displayCustomLocations();
    updateURL();
}

// Load available counties from manifest file
async function loadAvailableCounties() {
    try {
        const response = await fetch('data/counties.json');
        availableCounties = await response.json();
        
        console.log('Available counties:', availableCounties);
        populateStateDropdown();
    } catch (error) {
        console.error('Error loading available counties:', error);
        alert('Error loading counties.json. Make sure the file exists in data folder.');
    }
}

// Populate state dropdown (only states with available counties)
function populateStateDropdown() {
    const stateSelect = document.getElementById('state-select');
    const states = new Set();
    
    // Get unique states from available counties
    availableCounties.forEach(county => {
        states.add(county.stateCode);
    });
    
    Array.from(states).sort().forEach(stateCode => {
        const option = document.createElement('option');
        option.value = stateCode;
        option.textContent = `${STATE_NAMES[stateCode] || stateCode} (${stateCode})`;
        stateSelect.appendChild(option);
    });
}

// Populate county dropdown (only counties with unified files)
function populateCountyDropdown(stateCode) {
    const countySelect = document.getElementById('county-select');
    countySelect.innerHTML = '<option value="">Select County...</option>';
    countySelect.disabled = false;
    
    // Filter available counties by state
    const countiesInState = availableCounties.filter(c => c.stateCode === stateCode);
    
    countiesInState.sort((a, b) => a.name.localeCompare(b.name)).forEach(county => {
        const option = document.createElement('option');
        option.value = county.countyCode;
        option.textContent = `${county.name} (${county.countyCode})`;
        option.dataset.filename = county.filename;
        option.dataset.geojsonFile = county.geojsonFile;
        countySelect.appendChild(option);
    });
}

// Note: Quartile calculations and color assignments are now pre-computed in the unified files
// The visualization simply looks up the pre-computed colors based on the current mode

// Get feature style based on current visualization (using pre-computed colors)
function getFeatureStyle(feature) {
    const geoid = feature.properties.GEOID;
    const data = scoreData[geoid];
    
    if (!data || !data.colors) {
        return {
            fillColor: '#9ca3af',
            weight: 0,
            opacity: 0,
            color: '#fff',
            fillOpacity: 0
        };
    }
    
    let fillColor = null;
    
    // Select the appropriate pre-computed color based on visualization mode
    const isPrivate = enrollmentMode === 'private';
    const isFiltered = absoluteFilterEnabled;
    
    if (currentVisualization === 'absolute') {
        fillColor = isPrivate ? data.colors.absolute : data.colors.absolutePlus;
    } else if (currentVisualization === 'esAbsolute') {
        fillColor = isPrivate ? data.colors.esAbsolute : data.colors.esPlusAbsolute;
    } else if (currentVisualization === 'wsAbsolute') {
        fillColor = data.colors.wsAbsolute;
    } else if (currentVisualization === 'esRelative') {
        if (isFiltered) {
            fillColor = isPrivate ? data.colors.esRelativeFiltered : data.colors.esPlusRelativeFiltered;
        } else {
            fillColor = isPrivate ? data.colors.esRelative : data.colors.esPlusRelative;
        }
    } else if (currentVisualization === 'wsRelative') {
        if (isFiltered) {
            fillColor = data.colors.wsRelativeFiltered;
        } else {
            fillColor = data.colors.wsRelative;
        }
    } else if (currentVisualization === 'es') {
        if (isFiltered) {
            fillColor = isPrivate ? data.colors.esFiltered : data.colors.esPlusFiltered;
        } else {
            fillColor = isPrivate ? data.colors.es : data.colors.esPlus;
        }
    } else if (currentVisualization === 'ws') {
        if (isFiltered) {
            fillColor = isPrivate ? data.colors.wsFiltered : data.colors.wsPlusFiltered;
        } else {
            fillColor = data.colors.ws;
        }
    } else if (currentVisualization === 'combo') {
        if (isFiltered) {
            fillColor = isPrivate ? data.colors.comboFiltered : data.colors.comboPlusFiltered;
        } else {
            fillColor = isPrivate ? data.colors.combo : data.colors.comboPlus;
        }
    } else if (currentVisualization === 'comboRelative') {
        if (isFiltered) {
            fillColor = isPrivate ? data.colors.comboRelativeFiltered : data.colors.comboPlusRelativeFiltered;
        } else {
            fillColor = isPrivate ? data.colors.comboRelative : data.colors.comboPlusRelative;
        }
    }
    
    // If no color (null or undefined), make transparent with no border
    if (!fillColor) {
        return {
            fillColor: '#9ca3af',
            weight: 0,
            opacity: 0,
            color: '#fff',
            fillOpacity: 0
        };
    }
    
    return {
        fillColor: fillColor,
        weight: boundariesVisible ? 1 : 0,
        opacity: boundariesVisible ? 1 : 0,
        color: '#fff',
        fillOpacity: fillOpacity
    };
}

// Load map data for a specific county
async function loadMapData(stateCode, countyCode) {
    // Clear existing layers
    if (currentLayer) {
        map.removeLayer(currentLayer);
    }
    clearCountyBoundaries();
    isMultiCountyMode = false;
    isNationalMode = false;
    
    // Find the county's GeoJSON file from the manifest
    const county = availableCounties.find(c => 
        c.stateCode === stateCode && c.countyCode === countyCode
    );
    
    if (!county || !county.geojsonFile) {
        console.error('No GeoJSON file found for this county');
        alert('GeoJSON data not available for this county');
        return;
    }
    
    try {
        // Load county-specific GeoJSON
        console.log(`Fetching GeoJSON: data/${county.geojsonFile}`);
        const response = await fetch(`data/${county.geojsonFile}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const countyGeoJSON = await response.json();
        
        console.log(`Loaded GeoJSON for ${county.name}: ${countyGeoJSON.features.length} block groups`);
        
        currentLayer = L.geoJSON(countyGeoJSON, {
            style: getFeatureStyle,
            onEachFeature: (feature, layer) => {
                layer.on('click', () => {
                    const geoid = feature.properties.GEOID;
                    const data = scoreData[geoid];
                    if (data) {
                        const esScore = enrollmentMode === 'private' ? data.enrollmentScore : data.enrollmentScorePlus;
                        alert(`GEOID: ${geoid}\nEnrollment Score: ${esScore?.toFixed(2) || 'N/A'}\nWealth Score: ${data.wealthScore?.toFixed(2) || 'N/A'}`);
                    }
                });
            }
        }).addTo(map);
        
        // Add county boundary if in multi-county mode
        if (isMultiCountyMode) {
            await addCountyBoundary(county);
        }
        
        map.fitBounds(currentLayer.getBounds());
        updateLegend();
        
        // Track current state/county and update URL
        currentStateCode = stateCode;
        currentCountyCode = countyCode;
        loadedCounties = [];
        setTimeout(updateURL, 500); // Delay to ensure map bounds are set
    } catch (error) {
        console.error('Error loading county GeoJSON:', error);
        alert('Error loading map data for this county');
    }
}

// Clear county boundary layers
function clearCountyBoundaries() {
    countyBoundaryLayers.forEach(layer => map.removeLayer(layer));
    countyBoundaryLayers = [];
}

// Toggle county boundaries visibility
function toggleCountyBoundaries() {
    countyBoundariesVisible = !countyBoundariesVisible;
    countyBoundaryLayers.forEach(layer => {
        if (countyBoundariesVisible) {
            layer.addTo(map);
        } else {
            map.removeLayer(layer);
        }
    });
}

// Add black boundary around a county (load pre-generated boundary file)
async function addCountyBoundary(county) {
    try {
        // Load pre-generated boundary GeoJSON file
        const response = await fetch(`data/${county.boundaryFile}`);
        if (!response.ok) {
            console.error(`Failed to load boundary for ${county.name}`);
            return;
        }
        const boundaryGeoJSON = await response.json();
        
        // Add the boundary as a layer
        const boundaryLayer = L.geoJSON(boundaryGeoJSON, {
            style: {
                fillColor: 'transparent',
                fillOpacity: 0,
                color: '#000000',
                weight: 3,
                opacity: 1
            },
            interactive: false
        });
        
        // Only add to map if boundaries are visible
        if (countyBoundariesVisible) {
            boundaryLayer.addTo(map);
        }
        
        countyBoundaryLayers.push(boundaryLayer);
    } catch (error) {
        console.error('Error loading county boundary:', error);
    }
}

// Load all counties for a state
async function loadAllCountiesInState(stateCode) {
    // Clear existing layers
    if (currentLayer) {
        map.removeLayer(currentLayer);
    }
    clearCountyBoundaries();
    isMultiCountyMode = true;
    isNationalMode = false;
    
    // Get all counties for this state
    const countiesInState = availableCounties.filter(c => c.stateCode === stateCode);
    
    if (countiesInState.length === 0) {
        alert('No counties found for this state');
        return;
    }
    
    console.log(`Loading ${countiesInState.length} counties for state ${stateCode}`);
    
    // Reset score data
    scoreData = {};
    
    // Create a combined layer group
    const allFeatures = [];
    
    try {
        // Load all county data
        for (const county of countiesInState) {
            // Load unified scores
            const scoresResponse = await fetch(`data/${county.filename}`);
            if (!scoresResponse.ok) {
                console.error(`Failed to load scores for ${county.name}`);
                continue;
            }
            const scoresData = await scoresResponse.json();
            
            // Merge into scoreData
            scoresData.forEach(item => {
                scoreData[item.geoid] = {
                    enrollmentScore: item.enrollmentScore,
                    enrollmentScorePlus: item.enrollmentScorePlus,
                    wealthScore: item.wealthScore,
                    colors: item.colors
                };
            });
            
            // Load GeoJSON
            const geojsonResponse = await fetch(`data/${county.geojsonFile}`);
            if (!geojsonResponse.ok) {
                console.error(`Failed to load GeoJSON for ${county.name}`);
                continue;
            }
            const countyGeoJSON = await geojsonResponse.json();
            
            // Add features to combined array
            allFeatures.push(...countyGeoJSON.features);
            
            // Add county boundary (load pre-generated boundary file)
            await addCountyBoundary(county);
            
            console.log(`Loaded ${county.name}: ${countyGeoJSON.features.length} block groups`);
        }
        
        // Create combined GeoJSON
        const combinedGeoJSON = {
            type: 'FeatureCollection',
            features: allFeatures
        };
        
        // Add all features to map
        currentLayer = L.geoJSON(combinedGeoJSON, {
            style: getFeatureStyle,
            onEachFeature: (feature, layer) => {
                layer.on('click', () => {
                    const geoid = feature.properties.GEOID;
                    const data = scoreData[geoid];
                    if (data) {
                        const esScore = enrollmentMode === 'private' ? data.enrollmentScore : data.enrollmentScorePlus;
                        alert(`GEOID: ${geoid}\nEnrollment Score: ${esScore?.toFixed(2) || 'N/A'}\nWealth Score: ${data.wealthScore?.toFixed(2) || 'N/A'}`);
                    }
                });
            }
        }).addTo(map);
        
        // Fit bounds to show all counties
        map.fitBounds(currentLayer.getBounds());
        updateLegend();
        
        // Update status
        const status = document.getElementById('data-status');
        status.style.display = 'block';
        status.textContent = `✓ Loaded ${countiesInState.length} counties (${Object.keys(scoreData).length} block groups)`;
        status.style.backgroundColor = '#dcfce7';
        status.style.color = '#166534';
        
        console.log(`Total loaded: ${Object.keys(scoreData).length} block groups across ${countiesInState.length} counties`);
        
        // Track loaded counties and update URL
        currentStateCode = stateCode;
        currentCountyCode = null;
        loadedCounties = countiesInState.map(c => c.countyCode);
        setTimeout(updateURL, 500); // Delay to ensure map bounds are set

    } catch (error) {
        console.error('Error loading counties:', error);
        alert('Error loading county data: ' + error.message);
    }
}

// Calculate distance between two points (Haversine formula)
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Update loading progress display
function updateLoadingProgress() {
    const progressContainer = document.getElementById('loading-progress');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');

    if (!progressContainer) return;

    if (loadingProgress.inProgress) {
        progressContainer.style.display = 'block';
        const percent = Math.round((loadingProgress.loaded / loadingProgress.total) * 100);
        progressBar.style.width = `${percent}%`;
        progressText.textContent = `Loading ${loadingProgress.loaded} of ${loadingProgress.total} counties...`;
    } else {
        progressContainer.style.display = 'none';
    }
}

// Load all counties nationally with viewport-based batching
async function loadAllCountiesNational() {
    // Clear existing layers
    if (currentLayer) {
        map.removeLayer(currentLayer);
    }
    clearCountyBoundaries();
    isMultiCountyMode = true;
    isNationalMode = true;

    // Get viewport center for distance sorting
    const center = map.getCenter();
    const viewportLat = center.lat;
    const viewportLng = center.lng;

    // Sort counties by distance from viewport center
    const countiesWithDistance = availableCounties
        .filter(c => c.center) // Only counties with center coordinates
        .map(county => ({
            ...county,
            distance: calculateDistance(viewportLat, viewportLng, county.center[0], county.center[1])
        }))
        .sort((a, b) => a.distance - b.distance);

    console.log(`Loading ${countiesWithDistance.length} counties, starting from closest to viewport`);

    // Initialize progress tracking
    loadingProgress = { loaded: 0, total: countiesWithDistance.length, inProgress: true };
    updateLoadingProgress();

    // Reset data
    scoreData = {};
    const allFeatures = [];
    const BATCH_SIZE = 8;

    try {
        // Process in batches
        for (let i = 0; i < countiesWithDistance.length; i += BATCH_SIZE) {
            const batch = countiesWithDistance.slice(i, i + BATCH_SIZE);

            // Load batch in parallel
            const batchPromises = batch.map(async (county) => {
                try {
                    // Load unified scores
                    const scoresResponse = await fetch(`data/${county.filename}`);
                    if (!scoresResponse.ok) {
                        console.error(`Failed to load scores for ${county.name}`);
                        return null;
                    }
                    const scoresData = await scoresResponse.json();

                    // Load GeoJSON
                    const geojsonResponse = await fetch(`data/${county.geojsonFile}`);
                    if (!geojsonResponse.ok) {
                        console.error(`Failed to load GeoJSON for ${county.name}`);
                        return null;
                    }
                    const countyGeoJSON = await geojsonResponse.json();

                    return { county, scoresData, countyGeoJSON };
                } catch (error) {
                    console.error(`Error loading ${county.name}:`, error);
                    return null;
                }
            });

            const batchResults = await Promise.all(batchPromises);

            // Process batch results
            for (const result of batchResults) {
                if (!result) continue;

                const { county, scoresData: scores, countyGeoJSON } = result;

                // Merge scores
                scores.forEach(item => {
                    scoreData[item.geoid] = {
                        enrollmentScore: item.enrollmentScore,
                        enrollmentScorePlus: item.enrollmentScorePlus,
                        wealthScore: item.wealthScore,
                        colors: item.colors
                    };
                });

                // Add features
                allFeatures.push(...countyGeoJSON.features);

                // Add county boundary
                await addCountyBoundary(county);

                loadingProgress.loaded++;
                updateLoadingProgress();

                console.log(`Loaded ${county.name} (${loadingProgress.loaded}/${loadingProgress.total})`);
            }

            // Render current progress after each batch (allows UI to update)
            if (currentLayer) {
                map.removeLayer(currentLayer);
            }

            const currentGeoJSON = {
                type: 'FeatureCollection',
                features: allFeatures
            };

            currentLayer = L.geoJSON(currentGeoJSON, {
                style: getFeatureStyle,
                onEachFeature: (feature, layer) => {
                    layer.on('click', () => {
                        const geoid = feature.properties.GEOID;
                        const data = scoreData[geoid];
                        if (data) {
                            const esScore = enrollmentMode === 'private' ? data.enrollmentScore : data.enrollmentScorePlus;
                            alert(`GEOID: ${geoid}\nEnrollment Score: ${esScore?.toFixed(2) || 'N/A'}\nWealth Score: ${data.wealthScore?.toFixed(2) || 'N/A'}`);
                        }
                    });
                }
            }).addTo(map);

            // Small delay to let UI breathe
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        // Final status update
        loadingProgress.inProgress = false;
        updateLoadingProgress();

        const status = document.getElementById('data-status');
        status.style.display = 'block';
        status.textContent = `✓ Loaded ${countiesWithDistance.length} counties (${Object.keys(scoreData).length.toLocaleString()} block groups)`;
        status.style.backgroundColor = '#dcfce7';
        status.style.color = '#166534';

        updateLegend();

        // Track state and update URL
        currentStateCode = null;
        currentCountyCode = null;
        loadedCounties = countiesWithDistance.map(c => `${c.stateCode}-${c.countyCode}`);
        setTimeout(updateURL, 500);

        console.log(`National load complete: ${Object.keys(scoreData).length.toLocaleString()} block groups`);

    } catch (error) {
        console.error('Error loading counties:', error);
        loadingProgress.inProgress = false;
        updateLoadingProgress();
        alert('Error loading county data: ' + error.message);
    }
}

// Update legend
function updateLegend() {
    const legendContent = document.getElementById('legend-content');
    
    if (currentVisualization === 'absolute') {
        legendContent.innerHTML = `
            <div class="legend-item">
                <div class="legend-color" style="background-color: #ef4444;"></div>
                <div class="legend-label">ES ≥ 2500 & WS ≥ 2500</div>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background-color: #9ca3af;"></div>
                <div class="legend-label">Does not meet criteria</div>
            </div>
        `;
    } else if (currentVisualization === 'esAbsolute' || currentVisualization === 'wsAbsolute') {
        legendContent.innerHTML = `
            <div class="legend-item">
                <div class="legend-color" style="background-color: #ef4444;"></div>
                <div class="legend-label">Red - 3750+</div>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background-color: #f97316;"></div>
                <div class="legend-label">Orange - 2501-3750</div>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background-color: #eab308;"></div>
                <div class="legend-label">Yellow - 1251-2500</div>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background-color: #3b82f6;"></div>
                <div class="legend-label">Blue - 0-1250</div>
            </div>
        `;
    } else if (currentVisualization === 'esRelative' || currentVisualization === 'wsRelative' || currentVisualization === 'comboRelative') {
        legendContent.innerHTML = `
            <div class="legend-item">
                <div class="legend-color" style="background-color: #ef4444;"></div>
                <div class="legend-label">Red - 75-100% of max</div>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background-color: #f97316;"></div>
                <div class="legend-label">Orange - 50-75% of max</div>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background-color: #eab308;"></div>
                <div class="legend-label">Yellow - 25-50% of max</div>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background-color: #3b82f6;"></div>
                <div class="legend-label">Blue - 0-25% of max</div>
            </div>
        `;
    } else {
        legendContent.innerHTML = `
            <div class="legend-item">
                <div class="legend-color" style="background-color: #ef4444;"></div>
                <div class="legend-label">Red - Top 25% (Best)</div>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background-color: #f97316;"></div>
                <div class="legend-label">Orange - 50-75%</div>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background-color: #eab308;"></div>
                <div class="legend-label">Yellow - 25-50%</div>
            </div>
            <div class="legend-item">
                <div class="legend-color" style="background-color: #3b82f6;"></div>
                <div class="legend-label">Blue - Bottom 25%</div>
            </div>
        `;
    }
}

// Refresh map visualization
function refreshVisualization() {
    if (currentLayer) {
        currentLayer.setStyle(getFeatureStyle);
        updateLegend();
    }
}

// Geocode address and place marker
async function searchAddress(address) {
    if (!address || address.trim() === '') {
        return;
    }
    
    try {
        // Use Nominatim (OpenStreetMap) geocoding service
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`
        );
        
        if (!response.ok) {
            throw new Error('Geocoding service unavailable');
        }
        
        const results = await response.json();
        
        if (results.length === 0) {
            alert('Address not found. Please try a different search.');
            return;
        }
        
        const result = results[0];
        const lat = parseFloat(result.lat);
        const lon = parseFloat(result.lon);
        
        // Create new marker (don't remove existing ones)
        const newMarker = L.marker([lat, lon], {
            icon: L.icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowSize: [41, 41]
            })
        }).addTo(map);
        
        // Add popup with address and close button
        newMarker.bindPopup(`
            <b>${result.display_name}</b><br>
            <button onclick="removeMarker(${searchMarkers.length})" style="margin-top: 5px;">Remove Pin</button>
        `).openPopup();
        
        // Add to markers array
        searchMarkers.push(newMarker);
        
        // Update pin count display
        updatePinCount();
        
        // Pan to location
        map.setView([lat, lon], 13);
        
    } catch (error) {
        console.error('Error geocoding address:', error);
        alert('Error searching for address: ' + error.message);
    }
}

// Remove a specific marker
function removeMarker(index) {
    if (searchMarkers[index]) {
        map.removeLayer(searchMarkers[index]);
        searchMarkers[index] = null;
        updatePinCount();
    }
}

// Clear all search markers
function clearAllMarkers() {
    searchMarkers.forEach(marker => {
        if (marker) {
            map.removeLayer(marker);
        }
    });
    searchMarkers = [];
    updatePinCount();
}

// Update pin count display
function updatePinCount() {
    const activeMarkers = searchMarkers.filter(m => m !== null).length;
    const countElement = document.getElementById('pin-count');
    if (countElement) {
        countElement.textContent = `${activeMarkers} pin${activeMarkers !== 1 ? 's' : ''}`;
    }
}

// Auto-load score data when county is selected
async function loadScoreDataForCounty(stateCode, countyCode) {
    const countySelect = document.getElementById('county-select');
    const selectedOption = countySelect.options[countySelect.selectedIndex];
    const filename = selectedOption.dataset.filename;
    
    if (!filename) {
        console.error('No filename found for selected county');
        return;
    }
    
    try {
        const response = await fetch(`data/${filename}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        
        // Convert array format to object format (keep pre-computed colors!)
        scoreData = {};
        data.forEach(item => {
            scoreData[item.geoid] = {
                enrollmentScore: item.enrollmentScore,
                enrollmentScorePlus: item.enrollmentScorePlus,
                wealthScore: item.wealthScore,
                colors: item.colors
            };
        });
        
        const status = document.getElementById('data-status');
        status.style.display = 'block';
        status.textContent = `✓ Loaded ${Object.keys(scoreData).length} block groups`;
        status.style.backgroundColor = '#dcfce7';
        status.style.color = '#166534';
        
        console.log('Score data loaded:', Object.keys(scoreData).length, 'entries');
        
        // Load the map
        loadMapData(stateCode, countyCode);
    } catch (error) {
        console.error('Error loading score data:', error);
        alert('Error loading score data: ' + error.message);
    }
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    loadGeoJSON();
    
    // Add map moveend listener to update URL when viewport changes
    map.on('moveend', () => {
        if (currentStateCode) { // Only update if we have data loaded
            updateURL();
        }
    });
    
    // Enrollment mode toggle
    document.getElementById('toggle-private').addEventListener('click', () => {
        enrollmentMode = 'private';
        document.getElementById('toggle-private').classList.add('active');
        document.getElementById('toggle-public').classList.remove('active');
        refreshVisualization();
        displayCustomLocations(); // Refresh custom locations with new mode
        updateURL();
    });
    
    document.getElementById('toggle-public').addEventListener('click', () => {
        enrollmentMode = 'public';
        document.getElementById('toggle-public').classList.add('active');
        document.getElementById('toggle-private').classList.remove('active');
        refreshVisualization();
        displayCustomLocations(); // Refresh custom locations with new mode
        updateURL();
    });
    
    // Absolute filter toggle
    document.getElementById('toggle-filter-off').addEventListener('click', () => {
        absoluteFilterEnabled = false;
        document.getElementById('toggle-filter-off').classList.add('active');
        document.getElementById('toggle-filter-on').classList.remove('active');
        refreshVisualization();
        updateURL();
    });
    
    document.getElementById('toggle-filter-on').addEventListener('click', () => {
        absoluteFilterEnabled = true;
        document.getElementById('toggle-filter-on').classList.add('active');
        document.getElementById('toggle-filter-off').classList.remove('active');
        refreshVisualization();
        updateURL();
    });
    
    // Boundary toggle
    document.getElementById('toggle-boundaries-btn').addEventListener('click', () => {
        boundariesVisible = !boundariesVisible;
        const btn = document.getElementById('toggle-boundaries-btn');
        btn.textContent = boundariesVisible ? 'Hide Boundaries' : 'Show Boundaries';
        refreshVisualization();
        updateURL();
    });
    
    // Address search
    const searchInput = document.getElementById('address-search');
    const searchButton = document.getElementById('search-button');
    
    searchButton.addEventListener('click', () => {
        const address = searchInput.value;
        searchAddress(address);
    });
    
    // Clear all pins button
    const clearPinsButton = document.getElementById('clear-pins-btn');
    if (clearPinsButton) {
        clearPinsButton.addEventListener('click', clearAllMarkers);
    }
    
    // County boundaries toggle (for multi-county mode)
    const toggleCountyBoundariesBtn = document.getElementById('toggle-county-boundaries-btn');
    if (toggleCountyBoundariesBtn) {
        toggleCountyBoundariesBtn.addEventListener('click', () => {
            toggleCountyBoundaries();
            toggleCountyBoundariesBtn.textContent = countyBoundariesVisible ? 'Hide County Boundaries' : 'Show County Boundaries';
            updateURL();
        });
    }
    
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const address = searchInput.value;
            searchAddress(address);
        }
    });
    
    // Custom locations toggle
    const toggleCustomLocationsBtn = document.getElementById('toggle-custom-locations-btn');
    if (toggleCustomLocationsBtn) {
        toggleCustomLocationsBtn.addEventListener('click', () => {
            toggleCustomLocations();
            toggleCustomLocationsBtn.textContent = customLocationsVisible ? 'Hide Custom Locations' : 'Show Custom Locations';
        });
    }
    
    // Screenshot button
    const screenshotBtn = document.getElementById('screenshot-btn');
    if (screenshotBtn) {
        screenshotBtn.addEventListener('click', takeScreenshot);
    }
    
    // Screenshot modal controls
    const screenshotDownloadBtn = document.getElementById('screenshot-download');
    const screenshotCancelBtn = document.getElementById('screenshot-cancel');
    const screenshotModal = document.getElementById('screenshot-modal');
    
    if (screenshotDownloadBtn) {
        screenshotDownloadBtn.addEventListener('click', downloadScreenshot);
    }
    
    if (screenshotCancelBtn) {
        screenshotCancelBtn.addEventListener('click', closeScreenshotModal);
    }
    
    // Close modal when clicking outside
    if (screenshotModal) {
        screenshotModal.addEventListener('click', (e) => {
            if (e.target === screenshotModal) {
                closeScreenshotModal();
            }
        });
    }
    
    // Opacity slider
    document.getElementById('opacity-slider').addEventListener('input', (e) => {
        const value = e.target.value;
        fillOpacity = value / 100;
        document.getElementById('opacity-value').textContent = `${value}%`;
        refreshVisualization();
        updateURL();
    });
    
    // Visualization layer selection
    document.querySelectorAll('.radio-option').forEach(option => {
        option.addEventListener('click', () => {
            document.querySelectorAll('.radio-option').forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');
            option.querySelector('input').checked = true;
            currentVisualization = option.dataset.layer;
            refreshVisualization();
            updateURL();
        });
    });
    
    // State selection
    document.getElementById('state-select').addEventListener('change', (e) => {
        const stateCode = e.target.value;
        const loadAllBtn = document.getElementById('load-all-counties-btn');
        
        if (stateCode) {
            populateCountyDropdown(stateCode);
            // Show "Load All Counties" button
            loadAllBtn.style.display = 'block';
        } else {
            document.getElementById('county-select').disabled = true;
            loadAllBtn.style.display = 'none';
        }
    });
    
    // Load all counties in state button
    document.getElementById('load-all-counties-btn').addEventListener('click', () => {
        const stateCode = document.getElementById('state-select').value;
        if (stateCode) {
            loadAllCountiesInState(stateCode);
        }
    });

    // Load all counties nationally button
    const loadNationalBtn = document.getElementById('load-national-btn');
    if (loadNationalBtn) {
        loadNationalBtn.addEventListener('click', () => {
            loadAllCountiesNational();
        });
    }
    
    // County selection - auto-load when county is selected
    document.getElementById('county-select').addEventListener('change', (e) => {
        const countyCode = e.target.value;
        const stateCode = document.getElementById('state-select').value;
        
        if (countyCode && stateCode) {
            loadScoreDataForCounty(stateCode, countyCode);
        }
    });
    
    // Load state from URL if present - call after all DOM elements and event listeners are ready
    setTimeout(() => {
        loadFromURL();
    }, 300);
});

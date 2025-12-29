let map;
let geojsonData;
let currentLayer;
let scoreData = {};
let enrollmentMode = 'private'; // 'private' or 'public'
let currentVisualization = 'absolute';
let availableCounties = []; // List of counties with unified files
let absoluteFilterEnabled = true; // Filter to ES>=2500 & WS>=2500
let boundariesVisible = true;
let fillOpacity = 0.6;

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
    map = L.map('map').setView([37.7749, -122.4194], 10);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18
    }).addTo(map);
}

// Load available counties (no longer loading full GeoJSON upfront)
async function loadGeoJSON() {
    try {
        await loadAvailableCounties();
    } catch (error) {
        console.error('Error loading counties:', error);
        alert('Error loading county data.');
    }
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
        alert('Error loading counties.json. Make sure the file exists in Maps - Unified folder.');
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
    if (currentLayer) {
        map.removeLayer(currentLayer);
    }
    
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
        const response = await fetch(`data/${county.geojsonFile}`);
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
        
        map.fitBounds(currentLayer.getBounds());
        updateLegend();
    } catch (error) {
        console.error('Error loading county GeoJSON:', error);
        alert('Error loading map data for this county');
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

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    loadGeoJSON();
    
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
    
    // Enrollment mode toggle
    document.getElementById('toggle-private').addEventListener('click', () => {
        enrollmentMode = 'private';
        document.getElementById('toggle-private').classList.add('active');
        document.getElementById('toggle-public').classList.remove('active');
        refreshVisualization();
    });
    
    document.getElementById('toggle-public').addEventListener('click', () => {
        enrollmentMode = 'public';
        document.getElementById('toggle-public').classList.add('active');
        document.getElementById('toggle-private').classList.remove('active');
        refreshVisualization();
    });
    
    // Absolute filter toggle
    document.getElementById('toggle-filter-off').addEventListener('click', () => {
        absoluteFilterEnabled = false;
        document.getElementById('toggle-filter-off').classList.add('active');
        document.getElementById('toggle-filter-on').classList.remove('active');
        refreshVisualization();
    });
    
    document.getElementById('toggle-filter-on').addEventListener('click', () => {
        absoluteFilterEnabled = true;
        document.getElementById('toggle-filter-on').classList.add('active');
        document.getElementById('toggle-filter-off').classList.remove('active');
        refreshVisualization();
    });
    
    // Boundary toggle
    document.getElementById('toggle-boundaries-btn').addEventListener('click', () => {
        boundariesVisible = !boundariesVisible;
        const btn = document.getElementById('toggle-boundaries-btn');
        btn.textContent = boundariesVisible ? 'Hide Boundaries' : 'Show Boundaries';
        refreshVisualization();
    });
    
    // Opacity slider
    document.getElementById('opacity-slider').addEventListener('input', (e) => {
        const value = e.target.value;
        fillOpacity = value / 100;
        document.getElementById('opacity-value').textContent = `${value}%`;
        refreshVisualization();
    });
    
    // Visualization layer selection
    document.querySelectorAll('.radio-option').forEach(option => {
        option.addEventListener('click', () => {
            document.querySelectorAll('.radio-option').forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');
            option.querySelector('input').checked = true;
            currentVisualization = option.dataset.layer;
            refreshVisualization();
        });
    });
    
    // State selection
    document.getElementById('state-select').addEventListener('change', (e) => {
        const stateCode = e.target.value;
        if (stateCode) {
            populateCountyDropdown(stateCode);
        } else {
            document.getElementById('county-select').disabled = true;
            document.getElementById('load-map-btn').disabled = true;
        }
    });
    
    // County selection - auto-load when county is selected
    document.getElementById('county-select').addEventListener('change', (e) => {
        const countyCode = e.target.value;
        const stateCode = document.getElementById('state-select').value;
        
        if (countyCode && stateCode) {
            loadScoreDataForCounty(stateCode, countyCode);
        }
    });
});

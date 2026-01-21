# Custom Locations GeoJSON Format

This file documents the format for `custom-locations.geojson` which allows you to add custom location pins to the map.

## GeoJSON Structure

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [longitude, latitude]
      },
      "properties": {
        "name": "Location Name",
        "address": "Full Address",
        "esType": "great|minimal|unacceptable",
        "esPlusType": "great|minimal|unacceptable"
      }
    }
  ]
}
```

## Field Descriptions

### Required Fields

- **name** (string): The name/title of the location
- **address** (string): Full address of the location
- **esType** (string): Classification for Private Enrollment Score mode
  - `"great"` - Green pin (excellent location)
  - `"minimal"` - Orange pin (minimally acceptable location)
  - `"unacceptable"` - Red pin (unacceptable location)
- **esPlusType** (string): Classification for Private + Public Enrollment Score mode
  - `"great"` - Green pin (excellent location)
  - `"minimal"` - Orange pin (minimally acceptable location)
  - `"unacceptable"` - Red pin (unacceptable location)

### Geometry

- **coordinates**: `[longitude, latitude]` - Note: longitude comes first!
  - Example: `[-122.4194, 37.7749]` for San Francisco

## Pin Colors

The pin color displayed depends on the current enrollment mode:

- **Private Only mode**: Uses `esType` field
- **Private + Public mode**: Uses `esPlusType` field

### Color Mapping

- 🟢 **Green** (`great`): Excellent location, highly desirable
- 🟠 **Orange** (`minimal`): Minimally acceptable location
- 🔴 **Red** (`unacceptable`): Unacceptable location

## Example

```json
{
  "type": "Feature",
  "geometry": {
    "type": "Point",
    "coordinates": [-122.4194, 37.7749]
  },
  "properties": {
    "name": "Downtown School District",
    "address": "123 Main St, San Francisco, CA 94102",
    "esType": "great",
    "esPlusType": "minimal"
  }
}
```

This location would show:
- Green pin when in "Private Only" mode
- Orange pin when in "Private + Public" mode

## Usage

1. Edit `custom-locations.geojson` to add your locations
2. Use a geocoding service or map tool to get accurate coordinates
3. Classify each location for both ES and ES+ modes
4. Save the file
5. Refresh the map visualizer
6. Toggle "Show Custom Locations" in the UI to display pins

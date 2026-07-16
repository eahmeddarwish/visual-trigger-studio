// weather.js
// Live weather data via Open-Meteo — free, no API key, no signup, CORS-enabled,
// so it can be called directly from a static site's client-side JS.
// This replaces the original project's physical DHT11/ESP32 sensor: instead of
// an on-site hardware reading, the "weather" action type reports a real,
// live, city-level reading fetched from the internet at the moment of match.
//
// IMPORTANT HONESTY NOTE (surfaced in the UI too, not just here):
// this is the weather for the *named location*, not a physical sensor reading
// at the exact spot the camera is pointed at. Label it accordingly.

const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

/**
 * Resolves a free-text place name to coordinates. Callers should cache the
 * result on the trigger (lat/lon/resolvedName) so repeated matches don't
 * re-geocode every time.
 */
export async function geocodeLocation(name) {
  const url = `${GEOCODE_URL}?name=${encodeURIComponent(name)}&count=1&language=ar&format=json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`فشل البحث عن الموقع "${name}" (geocoding HTTP ${res.status}).`);
  }
  const data = await res.json();
  const first = data && data.results && data.results[0];
  if (!first) {
    throw new Error(`محدش لقى موقع باسم "${name}". جرّب اسم مدينة أوضح (e.g. "Kuwait City").`);
  }
  return {
    resolvedName: [first.name, first.admin1, first.country].filter(Boolean).join(", "),
    lat: first.latitude,
    lon: first.longitude,
  };
}

/**
 * Fetches current temperature + relative humidity for given coordinates.
 */
export async function getCurrentWeather(lat, lon) {
  const url =
    `${FORECAST_URL}?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m` +
    `&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`فشل جلب بيانات الطقس (forecast HTTP ${res.status}).`);
  }
  const data = await res.json();
  const current = data.current;
  if (!current) {
    throw new Error("رد الطقس مفيهوش بيانات current (unexpected Open-Meteo response shape).");
  }
  return {
    temperatureC: current.temperature_2m,
    humidityPct: current.relative_humidity_2m,
    windKmh: current.wind_speed_10m,
    weatherCode: current.weather_code,
    observedAt: current.time,
    timezone: data.timezone,
  };
}

/**
 * Convenience: geocode (if not already resolved) then fetch current weather.
 * @param {{locationName: string, lat?: number, lon?: number, resolvedName?: string}} payload
 */
export async function resolveWeatherForTrigger(payload) {
  let { lat, lon, resolvedName } = payload;
  if (typeof lat !== "number" || typeof lon !== "number") {
    const geo = await geocodeLocation(payload.locationName);
    lat = geo.lat;
    lon = geo.lon;
    resolvedName = geo.resolvedName;
  }
  const weather = await getCurrentWeather(lat, lon);
  return { ...weather, lat, lon, resolvedName };
}

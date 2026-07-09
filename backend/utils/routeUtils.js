// backend/routeUtils.js
const axios = require("axios");

const OSRM_BASE_URL = process.env.OSRM_BASE_URL || "https://router.project-osrm.org";
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const CACHE_TTL_MS = Number(process.env.DRIVING_DISTANCE_CACHE_TTL_MS || DEFAULT_TTL_MS);

// key -> { expiresAt:number, value?:object, promise?:Promise<object|null> }
const cache = new Map();

function roundCoord(value, decimals = 4) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const p = Math.pow(10, decimals);
  return Math.round(n * p) / p;
}

function cacheKey(fromLat, fromLng, toLat, toLng) {
  const aLat = roundCoord(fromLat);
  const aLng = roundCoord(fromLng);
  const bLat = roundCoord(toLat);
  const bLng = roundCoord(toLng);
  if (aLat === null || aLng === null || bLat === null || bLng === null) return null;
  return `${aLat},${aLng}|${bLat},${bLng}`;
}

async function fetchOsrmRoute(fromLat, fromLng, toLat, toLng) {
  const url = `${OSRM_BASE_URL.replace(/\/+$/, "")}/route/v1/driving/${fromLng},${fromLat};${toLng},${toLat}`;

  const response = await axios.get(url, {
    timeout: 7000,
    params: {
      overview: "false",
      alternatives: "false",
      steps: "false",
    },
    headers: {
      // OSRM public endpoints can be picky; keep it simple but explicit
      "User-Agent": "UzmanaGel/1.0",
    },
    validateStatus: () => true,
  });

  if (response.status !== 200) return null;

  const route = Array.isArray(response.data?.routes) ? response.data.routes[0] : null;
  const distanceMeters = Number(route?.distance);
  const durationSeconds = Number(route?.duration);

  if (!Number.isFinite(distanceMeters) || !Number.isFinite(durationSeconds)) return null;

  return {
    distanceKm: Math.round((distanceMeters / 1000) * 10) / 10,
    durationMin: Math.round(durationSeconds / 60),
    source: "osrm",
  };
}

async function getDrivingRouteInfo(fromLat, fromLng, toLat, toLng) {
  const key = cacheKey(fromLat, fromLng, toLat, toLng);
  if (!key) return null;

  const now = Date.now();
  const existing = cache.get(key);
  if (existing && existing.expiresAt > now) {
    if (existing.value) return existing.value;
    if (existing.promise) return existing.promise;
  }

  const expiresAt = now + (Number.isFinite(CACHE_TTL_MS) ? CACHE_TTL_MS : DEFAULT_TTL_MS);
  const promise = (async () => {
    try {
      const value = await fetchOsrmRoute(fromLat, fromLng, toLat, toLng);
      const entry = cache.get(key);
      if (entry) {
        entry.value = value;
        delete entry.promise;
      } else {
        cache.set(key, { expiresAt, value });
      }
      return value;
    } catch {
      cache.delete(key);
      return null;
    }
  })();

  cache.set(key, { expiresAt, promise });
  return promise;
}

module.exports = {
  getDrivingRouteInfo,
};


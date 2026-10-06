// Geo helpers: Haversine distance + geohash (for radius pre-filtering).
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

export function geohash(lat: number, lng: number, precision = 7): string {
  let idx = 0, bit = 0, even = true;
  let latMin = -90, latMax = 90, lngMin = -180, lngMax = 180;
  let hash = '';
  while (hash.length < precision) {
    if (even) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) { idx = idx * 2 + 1; lngMin = mid; } else { idx = idx * 2; lngMax = mid; }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) { idx = idx * 2 + 1; latMin = mid; } else { idx = idx * 2; latMax = mid; }
    }
    even = !even;
    if (++bit === 5) { hash += BASE32[idx]; bit = 0; idx = 0; }
  }
  return hash;
}

// 8 neighbours of a geohash cell (for radius queries without PostGIS).
export function geohashNeighbors(hash: string): string[] {
  const decode = (h: string) => {
    let latMin = -90, latMax = 90, lngMin = -180, lngMax = 180, even = true;
    for (const c of h) {
      const cd = BASE32.indexOf(c);
      for (let mask = 16; mask > 0; mask >>= 1) {
        if (even) { const mid = (lngMin + lngMax) / 2; if (cd & mask) lngMin = mid; else lngMax = mid; }
        else { const mid = (latMin + latMax) / 2; if (cd & mask) latMin = mid; else latMax = mid; }
        even = !even;
      }
    }
    return { lat: (latMin + latMax) / 2, lng: (lngMin + lngMax) / 2, latErr: (latMax - latMin) / 2, lngErr: (lngMax - lngMin) / 2 };
  };
  const { lat, lng, latErr, lngErr } = decode(hash);
  const out: string[] = [];
  for (const dLat of [-1, 0, 1]) for (const dLng of [-1, 0, 1]) {
    if (dLat === 0 && dLng === 0) continue;
    out.push(geohash(lat + dLat * latErr * 2, lng + dLng * lngErr * 2, hash.length));
  }
  return out;
}

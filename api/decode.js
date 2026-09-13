// api/decode.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { url } = req.body || {};
  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required.' });
  }

  // Validate URL format
  if (!isValidMapUrl(url)) {
    return res.status(400).json({ error: 'Invalid Google Maps URL format.' });
  }

  try {
    // 1. Follow redirects with multiple retry attempts
    const targetUrl = await resolveGoogleMapUrl(url);
    console.log(`[DECODE] Final targetUrl: ${targetUrl}`);

    // 2. Extract coordinates using resilient parsing
    const { lat, lng } = await extractCoordinates(targetUrl);
    console.log(`[DECODE] Extracted coordinates: lat=${lat}, lng=${lng}`);

    if (!lat || !lng) {
      return res.status(422).json({
        error: 'Could not resolve coordinates. Make sure the pin link is valid.',
        targetUrl,
        debug: 'No coordinates found in any extraction pattern'
      });
    }

    // 3. Reverse Geocode via OSM Nominatim with fallback
    const address = await reverseGeocode(lat, lng);
    console.log(`[DECODE] Resolved address: ${address}`);

    return res.status(200).json({
      success: true,
      latitude: lat,
      longitude: lng,
      address,
      targetUrl
    });

  } catch (err) {
    console.error('[DECODE] Error:', err.message, err.stack);
    return res.status(500).json({ 
      error: err.message || 'Internal server error while decoding URL.',
      debug: err.stack
    });
  }
}

// Validate that URL is a Google Maps link
function isValidMapUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.includes('maps') || 
           urlObj.hostname.includes('goo.gl') ||
           url.includes('maps.app.goo.gl');
  } catch {
    return false;
  }
}

// Resolve Google Maps short URL with retries
async function resolveGoogleMapUrl(url, retries = 3) {
  const userAgents = [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  ];

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const userAgent = userAgents[attempt % userAgents.length];
      console.log(`[RESOLVE] Attempt ${attempt + 1}/${retries} with UA: ${userAgent.substring(0, 50)}...`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'User-Agent': userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const finalUrl = response.url;
      console.log(`[RESOLVE] Response URL: ${finalUrl}, Status: ${response.status}`);
      
      const htmlBody = await response.text();
      console.log(`[RESOLVE] HTML body length: ${htmlBody.length} chars`);

      // Try to extract from meta redirect
      const metaRedirect = htmlBody.match(/content="0;\s*url=([^"]+)"/i);
      if (metaRedirect && metaRedirect[1]) {
        console.log(`[RESOLVE] Found meta redirect: ${metaRedirect[1].substring(0, 100)}...`);
        return decodeHtmlEntities(metaRedirect[1]);
      }

      // Try to extract from anchor href
      const linkMatch = htmlBody.match(/href="([^"]*(?:google\.com\/maps|maps\.app\.goo\.gl)[^"]*)"/i);
      if (linkMatch && linkMatch[1]) {
        console.log(`[RESOLVE] Found link href: ${linkMatch[1].substring(0, 100)}...`);
        return decodeHtmlEntities(linkMatch[1]);
      }

      // Try to extract from location.href or navigation
      const hrefMatch = htmlBody.match(/location\.href\s*=\s*["']([^"']*maps[^"']*)["']/i);
      if (hrefMatch && hrefMatch[1]) {
        console.log(`[RESOLVE] Found location.href: ${hrefMatch[1].substring(0, 100)}...`);
        return decodeHtmlEntities(hrefMatch[1]);
      }

      // Return final URL if no redirect found
      if (finalUrl && finalUrl !== url) {
        console.log(`[RESOLVE] Returning final redirect URL`);
        return finalUrl;
      }

      // If we got here and it's a maps URL, return as-is
      if (finalUrl.includes('google.com/maps') || finalUrl.includes('maps.app.goo.gl')) {
        console.log(`[RESOLVE] URL is valid maps URL, returning as-is`);
        return finalUrl;
      }

      // If successful response but nothing found, try next attempt
      if (response.ok) {
        console.log(`[RESOLVE] Response OK but no extraction found, trying next attempt`);
        continue;
      }

    } catch (err) {
      console.warn(`[RESOLVE] Attempt ${attempt + 1} failed: ${err.message}`);
      if (attempt === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 500));
    }
  }

  throw new Error('Could not resolve Google Maps URL after multiple attempts.');
}

// Extract coordinates using multiple parsing strategies
async function extractCoordinates(targetUrl) {
  let lat = null, lng = null;

  console.log(`[EXTRACT] Attempting to extract coordinates from: ${targetUrl.substring(0, 150)}...`);

  // Strategy 1: /@latitude,longitude pattern
  const atMatch = targetUrl.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (atMatch) {
    lat = parseFloat(atMatch[1]);
    lng = parseFloat(atMatch[2]);
    console.log(`[EXTRACT] Strategy 1 (@lat,lng): MATCH - lat=${lat}, lng=${lng}`);
    if (isValidLatLng(lat, lng)) {
      console.log(`[EXTRACT] Coordinates valid, returning`);
      return { lat, lng };
    }
  }

  // Strategy 2: !3d latitude !4d longitude pattern
  const lat3d = targetUrl.match(/!3d(-?\d+\.?\d*)/);
  const lng4d = targetUrl.match(/!4d(-?\d+\.?\d*)/);
  if (lat3d && lng4d) {
    lat = parseFloat(lat3d[1]);
    lng = parseFloat(lng4d[1]);
    console.log(`[EXTRACT] Strategy 2 (!3d!4d): MATCH - lat=${lat}, lng=${lng}`);
    if (isValidLatLng(lat, lng)) return { lat, lng };
  }

  // Strategy 3: ?q=latitude,longitude pattern
  const qMatch = targetUrl.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (qMatch) {
    lat = parseFloat(qMatch[1]);
    lng = parseFloat(qMatch[2]);
    console.log(`[EXTRACT] Strategy 3 (?q=lat,lng): MATCH - lat=${lat}, lng=${lng}`);
    if (isValidLatLng(lat, lng)) return { lat, lng };
  }

  // Strategy 4: place/coordinates in path
  const placeMatch = targetUrl.match(/place\/(@?-?\d+\.?\d*,-?\d+\.?\d*)/);
  if (placeMatch) {
    const coords = placeMatch[1].replace('@', '').split(',');
    if (coords.length === 2) {
      lat = parseFloat(coords[0]);
      lng = parseFloat(coords[1]);
      console.log(`[EXTRACT] Strategy 4 (/place/@lat,lng): MATCH - lat=${lat}, lng=${lng}`);
      if (isValidLatLng(lat, lng)) return { lat, lng };
    }
  }

  // Strategy 5: ll (latitude,longitude) parameter
  const llMatch = targetUrl.match(/[?&]ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (llMatch) {
    lat = parseFloat(llMatch[1]);
    lng = parseFloat(llMatch[2]);
    console.log(`[EXTRACT] Strategy 5 (?ll=lat,lng): MATCH - lat=${lat}, lng=${lng}`);
    if (isValidLatLng(lat, lng)) return { lat, lng };
  }

  console.log(`[EXTRACT] No extraction patterns matched`);
  return { lat: null, lng: null };
}

// Validate latitude and longitude ranges
function isValidLatLng(lat, lng) {
  const valid = !isNaN(lat) && !isNaN(lng) && 
         lat >= -90 && lat <= 90 && 
         lng >= -180 && lng <= 180;
  console.log(`[VALIDATE] lat=${lat}, lng=${lng} -> valid=${valid}`);
  return valid;
}

// Reverse geocode coordinates to address
async function reverseGeocode(lat, lng, retries = 2) {
  const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
  console.log(`[GEOCODE] Calling Nominatim: ${nominatimUrl}`);

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(nominatimUrl, {
        headers: {
          'User-Agent': 'VercelMapsDecoder/1.0',
          'Accept': 'application/json'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.warn(`[GEOCODE] Nominatim returned ${response.status}`);
        if (attempt < retries - 1) {
          await new Promise(r => setTimeout(r, 500));
          continue;
        }
        throw new Error(`Nominatim returned ${response.status}`);
      }

      const data = await response.json();
      console.log(`[GEOCODE] Success: ${data.display_name}`);
      return data.display_name || formatAddressFromComponents(data) || 'Address could not be determined.';

    } catch (err) {
      console.warn(`[GEOCODE] Attempt ${attempt + 1} failed: ${err.message}`);
      if (attempt === retries - 1) {
        return `Coordinates: ${lat}, ${lng} (Address lookup failed)`;
      }
    }
  }
}

// Fallback address formatting from Nominatim components
function formatAddressFromComponents(data) {
  if (!data.address) return null;
  
  const parts = [];
  const keys = ['name', 'house_number', 'road', 'suburb', 'city', 'state', 'country'];
  
  for (const key of keys) {
    if (data.address[key]) parts.push(data.address[key]);
  }
  
  return parts.length > 0 ? parts.join(', ') : null;
}

// Decode HTML entities
function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9A-Fa-f]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

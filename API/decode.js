// api/decode.js
export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.body || {};
  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required.' });
  }

  try {
    // 1. Follow HTTP 301/302 redirects natively on Vercel's backend
    const headResponse = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const expandedUrl = headResponse.url;

    // 2. Extract Lat/Lng using regex patterns from the final URL
    let lat = null;
    let lng = null;

    // Matches /@27.700769,85.300140
    const atMatch = expandedUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (atMatch) {
      lat = atMatch[1];
      lng = atMatch[2];
    }

    // Matches protobuf params !3d27.700769!4d85.300140
    if (!lat || !lng) {
      const latMatch = expandedUrl.match(/!3d(-?\d+\.\d+)/);
      const lngMatch = expandedUrl.match(/!4d(-?\d+\.\d+)/);
      if (latMatch && lngMatch) {
        lat = latMatch[1];
        lng = lngMatch[2];
      }
    }

    // Matches ?q=27.700769,85.300140
    if (!lat || !lng) {
      const qMatch = expandedUrl.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (qMatch) {
        lat = qMatch[1];
        lng = qMatch[2];
      }
    }

    if (!lat || !lng) {
      return res.status(422).json({
        error: 'Unable to extract coordinates from the resolved link.',
        expandedUrl
      });
    }

    // 3. Reverse Geocode the coordinates into a readable address
    let formattedAddress = '';
    const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;

    if (googleApiKey) {
      const gRes = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${googleApiKey}`
      );
      const gData = await gRes.json();
      if (gData.results && gData.results.length > 0) {
        formattedAddress = gData.results[0].formatted_address;
      }
    } else {
      // Free fallback: OpenStreetMap Nominatim
      const osmRes = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
        {
          headers: { 'User-Agent': 'VercelAddressResolver/1.0' }
        }
      );
      const osmData = await osmRes.json();
      formattedAddress = osmData.display_name;
    }

    return res.status(200).json({
      success: true,
      latitude: lat,
      longitude: lng,
      address: formattedAddress,
      expandedUrl
    });

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}

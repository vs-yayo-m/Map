// api/decode.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { url } = req.body || {};
  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required.' });
  }

  try {
    // 1. Follow redirects with a mobile browser user-agent
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
      }
    });

    let targetUrl = response.url;

    // 2. If Google trapped it inside an HTML redirection splash page, parse the meta/anchor tags
    const htmlBody = await response.text();
    const metaRedirect = htmlBody.match(/content="0;\s*url=([^"]+)"/i);
    const linkMatch = htmlBody.match(/href="([^"]*google\.com\/maps[^"]*)"/i);

    if (metaRedirect && metaRedirect[1]) {
      targetUrl = metaRedirect[1].replace(/&amp;/g, '&');
    } else if (linkMatch && linkMatch[1]) {
      targetUrl = linkMatch[1].replace(/&amp;/g, '&');
    }

    // 3. Extract coordinates
    let lat = null, lng = null;

    // Pattern 1: /@27.700769,85.300140
    const atMatch = targetUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (atMatch) {
      lat = atMatch[1];
      lng = atMatch[2];
    }

    // Pattern 2: !3d27.700769!4d85.300140
    if (!lat || !lng) {
      const latMatch = targetUrl.match(/!3d(-?\d+\.\d+)/) || htmlBody.match(/!3d(-?\d+\.\d+)/);
      const lngMatch = targetUrl.match(/!4d(-?\d+\.\d+)/) || htmlBody.match(/!4d(-?\d+\.\d+)/);
      if (latMatch && lngMatch) {
        lat = latMatch[1];
        lng = lngMatch[2];
      }
    }

    // Pattern 3: Query coordinates ?q=lat,lng
    if (!lat || !lng) {
      const qMatch = targetUrl.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (qMatch) {
        lat = qMatch[1];
        lng = qMatch[2];
      }
    }

    if (!lat || !lng) {
      return res.status(422).json({
        error: 'Could not resolve coordinates. Make sure the pin link is valid.',
        targetUrl
      });
    }

    // 4. Reverse Geocode via OSM Nominatim
    const osmRes = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
      { headers: { 'User-Agent': 'VercelMapsDecoder/1.0' } }
    );
    const osmData = await osmRes.json();

    return res.status(200).json({
      success: true,
      latitude: lat,
      longitude: lng,
      address: osmData.display_name || 'Address could not be determined.',
      targetUrl
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

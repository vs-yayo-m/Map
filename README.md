# 🗺️ Google Maps Short Link Decoder & Address Autofill Service

A **production-ready** service that decodes shortened Google Maps links (e.g., `https://maps.app.goo.gl/...`) into raw coordinates and full human-readable addresses.

## 🎯 Features

- ✅ **Resilient URL Resolution**: Handles Google's interstitial pages, redirects, and JavaScript-based navigation
- ✅ **Multi-Strategy Coordinate Extraction**: 5+ parsing patterns to extract lat/lng from various Google Maps URL formats
- ✅ **Automatic Reverse Geocoding**: Converts coordinates to human-readable addresses via OpenStreetMap Nominatim
- ✅ **Production-Ready**: Retry logic, timeout handling, error recovery
- ✅ **Beautiful Web UI**: Paste-to-decode autofill with live feedback
- ✅ **CORS-Enabled**: Works seamlessly from any domain
- ✅ **Deployed on Vercel**: Serverless, globally distributed, auto-scaling

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Locally
```bash
npm run dev
```
Vercel CLI will start the development server at `http://localhost:3000`

### 3. Deploy to Production
```bash
npm run deploy
```

## 📁 Project Structure

```
├── api/
│   └── decode.js          # Serverless function for URL resolution & geocoding
├── public/
│   └── index.html         # Frontend UI with autofill capability
├── vercel.json            # Vercel routing & headers configuration
├── package.json           # Node.js project metadata
├── .gitignore             # Git ignore rules
└── README.md              # This file
```

## 🔧 API Reference

### `POST /api/decode`

Decodes a Google Maps short link and returns coordinates + address.

#### Request
```json
{
  "url": "https://maps.app.goo.gl/AerB754MkbHk4ijU9"
}
```

#### Success Response (200)
```json
{
  "success": true,
  "latitude": "27.700769",
  "longitude": "85.300140",
  "address": "Kathmandu, Nepal",
  "targetUrl": "https://www.google.com/maps/place/..."
}
```

#### Error Response (4xx/5xx)
```json
{
  "error": "Could not resolve coordinates. Make sure the pin link is valid.",
  "targetUrl": "..."
}
```

## 🛠️ Architecture & Resilience Strategies

### URL Resolution (3-Retry Loop)
1. Follows HTTP redirects with mobile user-agent
2. Parses HTML for meta-refresh redirects
3. Extracts coordinates from multiple sources:
   - Meta tags (`<meta content="...;url=...">`)
   - Anchor links (`<a href="...">`)
   - JavaScript navigation (`location.href`)

### Coordinate Extraction (5 Strategies)
1. **`/@lat,lng`** pattern (most common)
2. **`!3d` & `!4d`** pattern (3D/4D parameters)
3. **`?q=lat,lng`** query parameter
4. **`/place/@lat,lng`** path pattern
5. **`?ll=lat,lng`** latitude-longitude parameter

### Reverse Geocoding
- Uses OpenStreetMap **Nominatim API** (free, no API key required)
- Includes fallback address formatting from API components
- Retry logic for transient failures

## 🌐 Usage Examples

### Via cURL
```bash
curl -X POST https://your-vercel-app.vercel.app/api/decode \
  -H "Content-Type: application/json" \
  -d '{"url":"https://maps.app.goo.gl/example"}'
```

### Via JavaScript/Fetch
```javascript
const response = await fetch('/api/decode', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: 'https://maps.app.goo.gl/...' })
});
const data = await response.json();
console.log(`${data.latitude}, ${data.longitude} - ${data.address}`);
```

### Via Frontend UI
1. Open the web interface
2. Paste a Google Maps short link
3. Click "Decode Address" or let it auto-decode on paste
4. Coordinates and address auto-populate

## 🔐 Security & Rate Limiting

- **No Authentication Required**: Service is open for public use
- **Input Validation**: URLs are validated before processing
- **Timeout Protection**: 8-second timeout for URL resolution, 5-second for geocoding
- **Error Sanitization**: No sensitive data in error messages

For production scale, consider adding:
- Rate limiting (e.g., 100 requests/minute per IP)
- Request signing/authentication
- Cached responses with Redis/Memcached

## 📊 Monitoring & Debugging

### View Logs
```bash
vercel logs
```

### Check API Health
```bash
curl https://your-app.vercel.app/api/decode -X OPTIONS -v
```

### Debug Frontend Issues
Check browser console (F12) for detailed error messages and API responses.

## 🐛 Troubleshooting

### "Could not resolve coordinates"
- Verify the Google Maps link is valid
- Try a different Maps link (some old short links may have expired)
- Check that the coordinate extraction patterns haven't changed on Google's end

### CORS Errors in Browser
- Verify `vercel.json` CORS headers are applied
- Re-deploy: `npm run deploy`
- Check browser console for exact CORS error

### API Returns HTML Instead of JSON
- Check that the request Content-Type is `application/json`
- Verify the API route `/api/decode` is correctly deployed

## 🤝 Contributing

Issues and pull requests welcome! Areas for improvement:
- [ ] Add Google Geocoding API as fallback (requires API key)
- [ ] Implement Redis caching for frequently decoded URLs
- [ ] Add rate limiting middleware
- [ ] Support for other map providers (Apple Maps, Bing Maps)
- [ ] CLI tool for batch decoding

## 📝 License

MIT License - Feel free to use for personal or commercial projects.

## 📧 Support

For issues, questions, or feature requests, open an issue on GitHub.

---

**Deploy Status**: [![Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/vs-yayo-m/Map)

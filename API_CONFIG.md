# API Configuration Guide

## Setup

1. **Copy the environment template:**
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env` and add your API key:**
   ```
   EXPO_PUBLIC_API_URL=https://api.ybilgin.com
   EXPO_PUBLIC_API_KEY=your-actual-api-key-here
   ```

3. **Get your API key:**
   - Contact the server administrator
   - Or generate one on the server:
     ```bash
     openssl rand -hex 32
     ```

## Usage

The API service is automatically configured using environment variables.

### Example: Make a Prediction

```typescript
import apiService from './src/services/apiService';

// Sensor data (100-150 samples recommended)
const sensorData = {
  flex_sensors: [
    [512, 678, 345, 890, 234],
    [510, 680, 344, 891, 235],
    // ... more samples
  ],
  device_id: 'mobile-app'
};

try {
  const result = await apiService.predict(sensorData);
  console.log(`Predicted: ${result.letter}`);
  console.log(`Confidence: ${(result.confidence * 100).toFixed(1)}%`);
} catch (error) {
  console.error('Prediction failed:', error.message);
}
```

### Check API Health

```typescript
const health = await apiService.checkHealth();
console.log('API Status:', health.status);
console.log('Authentication:', health.authentication_enabled);
```

### Check Configuration

```typescript
if (!apiService.isConfigured()) {
  console.warn('API key not configured!');
}
```

## Error Handling

The API service throws descriptive errors:

- **"Missing API Key"** - Configure `EXPO_PUBLIC_API_KEY` in `.env`
- **"Invalid API Key"** - Check your API key is correct
- **"Rate limit exceeded"** - Wait 60 seconds and try again
- **"Network error"** - Check internet connection

## Security

- ✅ Never commit `.env` to Git (it's in `.gitignore`)
- ✅ Keep your API key secret
- ✅ Use `.env.example` for sharing configuration template

## Rate Limits

- **100 requests per minute** per IP address
- Check `X-RateLimit-Remaining` header in responses

## Support

For API keys or issues, contact: support@ybilgin.com

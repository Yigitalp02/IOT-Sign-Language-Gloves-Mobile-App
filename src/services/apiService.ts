import axios from 'axios';

// Load from environment variables
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://api.ybilgin.com';
const API_KEY = process.env.EXPO_PUBLIC_API_KEY || '';

// Debug: Log API key status on load
console.log('[apiService] API_BASE_URL:', API_BASE_URL);
console.log('[apiService] API_KEY configured:', !!API_KEY && API_KEY !== 'your-api-key-here');
if (!API_KEY || API_KEY === 'your-api-key-here') {
  console.warn('[apiService] ⚠️ API_KEY not configured!');
}

export interface SensorData {
  flex_sensors: number[][];
  device_id?: string;
}

export interface PredictionResponse {
  letter: string;
  confidence: number;
  all_probabilities: Record<string, number>;
  processing_time_ms: number;
  model_name: string;
  timestamp: number;
}

export interface HealthResponse {
  status: string;
  model_loaded: boolean;
  model_name: string;
  database_connected: boolean;
  uptime_seconds: number;
  authentication_enabled?: boolean;
}

class ApiService {
  async predict(sensorData: SensorData): Promise<PredictionResponse> {
    try {
      console.log(`Sending ${sensorData.flex_sensors.length} samples to API`);
      console.log('First sample:', JSON.stringify(sensorData.flex_sensors[0]));
      console.log('Last sample:', JSON.stringify(sensorData.flex_sensors[sensorData.flex_sensors.length - 1]));
      console.log('Device ID:', sensorData.device_id);
      
      // Log sample statistics
      const allValues = sensorData.flex_sensors.flat();
      const avgCh0 = sensorData.flex_sensors.reduce((sum, s) => sum + s[0], 0) / sensorData.flex_sensors.length;
      const avgCh1 = sensorData.flex_sensors.reduce((sum, s) => sum + s[1], 0) / sensorData.flex_sensors.length;
      console.log('Avg CH0:', Math.round(avgCh0), 'Avg CH1:', Math.round(avgCh1));
      
      const response = await axios.post<PredictionResponse>(
        `${API_BASE_URL}/predict`,
        sensorData,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': API_KEY,
          },
          timeout: 5000, // 5 second timeout
        }
      );
      
      console.log('API Response:', response.data.letter, 'Confidence:', response.data.confidence);
      console.log('All probabilities:', JSON.stringify(response.data.all_probabilities));
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        // Handle specific error codes
        if (error.response?.status === 401) {
          throw new Error('Missing API Key. Configure EXPO_PUBLIC_API_KEY in .env');
        }
        if (error.response?.status === 403) {
          throw new Error('Invalid API Key. Check your .env configuration');
        }
        if (error.response?.status === 429) {
          throw new Error('Rate limit exceeded. Please wait a moment');
        }
        
        throw new Error(
          error.response?.data?.detail || 
          error.message || 
          'Prediction failed'
        );
      }
      throw error;
    }
  }

  async checkHealth(): Promise<HealthResponse> {
    try {
      const response = await axios.get<HealthResponse>(`${API_BASE_URL}/health`, {
        timeout: 3000,
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error('API health check failed');
      }
      throw error;
    }
  }

  /**
   * Check if API is configured with a valid key
   */
  isConfigured(): boolean {
    return !!API_KEY && API_KEY !== 'your-api-key-here';
  }

  /**
   * Get current API base URL
   */
  getBaseUrl(): string {
    return API_BASE_URL;
  }
}

export default new ApiService();


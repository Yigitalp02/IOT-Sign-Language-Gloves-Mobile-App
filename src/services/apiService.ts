import axios from 'axios';

const API_BASE_URL = 'https://api.ybilgin.com';

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
          },
          timeout: 5000, // 5 second timeout
        }
      );
      
      console.log('API Response:', response.data.letter, 'Confidence:', response.data.confidence);
      console.log('All probabilities:', JSON.stringify(response.data.all_probabilities));
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
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
}

export default new ApiService();


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


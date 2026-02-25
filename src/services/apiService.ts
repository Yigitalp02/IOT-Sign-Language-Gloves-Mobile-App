/**
 * API service for ASL ML Inference API.
 * Sends normalized 0-1 sensor data to the cloud API.
 */

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'https://api.ybilgin.com';
const API_KEY = process.env.EXPO_PUBLIC_API_KEY || '';

export interface PredictionRequest {
  flex_sensors: number[][] | number[];
  device_id?: string;
  timestamp?: number;
}

export interface PredictionResponse {
  letter: string;
  confidence: number;
  all_probabilities: Record<string, number>;
  processing_time_ms: number;
  model_name: string;
  timestamp: number;
}

const apiService = {
  async predict(data: PredictionRequest): Promise<PredictionResponse> {
    const response = await fetch(`${API_URL}/predict`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(API_KEY ? { 'X-API-Key': API_KEY } : {}),
      },
      body: JSON.stringify({
        flex_sensors: data.flex_sensors,
        device_id: data.device_id ?? 'mobile-app',
        timestamp: data.timestamp ?? Date.now() / 1000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error ${response.status}: ${errorText}`);
    }

    return response.json();
  },

  async health(): Promise<{ status: string; model_name: string }> {
    const response = await fetch(`${API_URL}/health`, {
      headers: API_KEY ? { 'X-API-Key': API_KEY } : {},
    });
    return response.json();
  },
};

export default apiService;

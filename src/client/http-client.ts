import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from "axios";
import { RGBHTTPClientParams } from "../types/rgb-model";
import { NetworkError } from "../errors";
import { logger } from "../utils/logger";
import { validateRequired, validateString } from "../utils/validation";
import { DEFAULT_API_TIMEOUT } from "../constants";

/**
 * Create HTTP client for RGB Node API
 */
export const createClient = (params: RGBHTTPClientParams): AxiosInstance => {
  const { xpub_van, xpub_col, rgbEndpoint, master_fingerprint } = params;

  // Validate required parameters
  validateRequired(rgbEndpoint, 'rgbEndpoint');
  validateString(xpub_van, 'xpub_van');
  validateString(xpub_col, 'xpub_col');
  validateString(master_fingerprint, 'master_fingerprint');

  const client = axios.create({
    baseURL: rgbEndpoint,
    headers: {
      "xpub-van": xpub_van,
      "xpub-col": xpub_col,
      "master-fingerprint": master_fingerprint
    },
  });

  // Request interceptor
  client.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
      logger.debug('Request:', {
        method: config.method?.toUpperCase(),
        url: config.url,
        baseURL: config.baseURL,
      });
      return config;
    },
    (error) => {
      logger.error('Request failed:', error);
      return Promise.reject(new NetworkError('Request configuration failed', undefined, error));
    }
  );

  // Response interceptor
  client.interceptors.response.use(
    (response) => {
      logger.debug('Response:', {
        status: response.status,
        url: response.config.url,
      });
      return response;
    },
    (error: AxiosError) => {
      if (error.response) {
        // Server responded with error status
        const status = error.response.status;
        const data = error.response.data;
        const url = error.config?.url || 'unknown';
        const baseURL = error.config?.baseURL || 'unknown';
        const method = error.config?.method?.toUpperCase() || 'unknown';
        const fullUrl = baseURL && url ? `${baseURL}${url}` : url;
        
        logger.error('API Error:', {
          method,
          url: fullUrl,
          baseURL,
          path: url,
          status,
          statusText: error.response.statusText,
          data,
          headers: error.response.headers,
        });

        return Promise.reject(
          new NetworkError(
            `API request failed: ${status} ${error.response.statusText} (${method} ${fullUrl})`,
            status,
            error
          )
        );
      } else if (error.request) {
        // Request was made but no response received
        const url = error.config?.url || 'unknown';
        const baseURL = error.config?.baseURL || 'unknown';
        const method = error.config?.method?.toUpperCase() || 'unknown';
        const fullUrl = baseURL && url ? `${baseURL}${url}` : url;
        
        logger.error('Network error - no response:', {
          method,
          url: fullUrl,
          baseURL,
          path: url,
          message: error.message,
          code: error.code,
          timeout: error.config?.timeout,
          headers: error.config?.headers,
          error: error.toString(),
          stack: error.stack,
        });

        return Promise.reject(
          new NetworkError(
            `Network error: ${error.message || 'No response received from server'} (${method} ${fullUrl})`,
            undefined,
            error
          )
        );
      } else {
        // Something else happened
        const url = error.config?.url || 'unknown';
        const method = error.config?.method?.toUpperCase() || 'unknown';
        
        logger.error('Request setup error:', {
          method,
          url,
          message: error.message,
          error: error.toString(),
          stack: error.stack,
        });
        
        return Promise.reject(
          new NetworkError(`Request error: ${error.message} (${method} ${url})`, undefined, error)
        );
      }
    }
  );

  return client;
};
/**
 * Client module exports
 * 
 * This module contains HTTP client and RGB API client classes
 */

export type { RGBHTTPClientParams } from '../types/rgb-model';

/**
 * Factory function to create an RGBClient instance
 * Provides backward compatibility with the old API
 */

export interface CreateClientParams {
  xpubVan: string;
  xpubCol: string;
  masterFingerprint: string;
  dataDir: string;
  network: string;
  transportEndpoint?: string;
  indexerUrl?: string;
}


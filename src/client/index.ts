/**
 * Client module exports
 * 
 * This module contains HTTP client and RGB API client classes
 */

// Re-export RGB client class explicitly
export { RGBClient } from './rgb-client';

// Export HTTP client factory
export { createClient } from './http-client';

// Backward compatibility - export ThunderLink as alias to RGBClient
export { RGBClient as ThunderLink } from './rgb-client';


import Constants from 'expo-constants';
import { Platform, NativeModules } from 'react-native';
import axios from 'axios';

// Public Domain & Tunnel URLs
const PRODUCTION_DOMAIN = 'https://dream-ludo.onrender.com';
const PUBLIC_TUNNEL_URL = 'https://dream-ludo.onrender.com';

// Bypass tunnel reminder page for localtunnel
axios.defaults.headers.common['bypass-tunnel-reminder'] = 'true';

export const getApiServerUrl = (): string => {
  // 1. Explicit environment variable override
  if (process.env.EXPO_PUBLIC_SERVER_URL) {
    return process.env.EXPO_PUBLIC_SERVER_URL;
  }

  // 2. Production release fallback
  if (!__DEV__) {
    return PRODUCTION_DOMAIN;
  }

  // 3. Development tunnel fallback
  return PUBLIC_TUNNEL_URL;
};

export const API_SERVER_URL = getApiServerUrl();
console.log('[Dream Ludo] Active API_SERVER_URL:', API_SERVER_URL);

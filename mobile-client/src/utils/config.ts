import Constants from 'expo-constants';
import { Platform, NativeModules } from 'react-native';
import axios from 'axios';

// Public HTTPS Tunnel URL for seamless mobile connectivity across all networks (Wi-Fi, 4G/5G, Hotspot)
const PUBLIC_TUNNEL_URL = 'https://brave-phones-open.loca.lt';

// Bypass tunnel reminder page for localtunnel
axios.defaults.headers.common['bypass-tunnel-reminder'] = 'true';

export const getApiServerUrl = (): string => {
  // 1. Explicit environment variable override
  if (process.env.EXPO_PUBLIC_SERVER_URL) {
    return process.env.EXPO_PUBLIC_SERVER_URL;
  }

  // 2. Default to Active Public HTTPS Tunnel URL (Bypasses Windows Firewall, Router AP Isolation & Android Cleartext restrictions)
  return PUBLIC_TUNNEL_URL;
};

export const API_SERVER_URL = getApiServerUrl();
console.log('[Dream Ludo] Active API_SERVER_URL:', API_SERVER_URL);

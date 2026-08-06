import Constants from 'expo-constants';
import { Platform, NativeModules } from 'react-native';
import axios from 'axios';

// Public Production Domain & Tunnel URLs
const PRODUCTION_DOMAIN = 'https://dream-ludo.onrender.com';
const PUBLIC_TUNNEL_URL = 'https://dream-ludo.onrender.com';

// Bypass tunnel reminder page for localtunnel
axios.defaults.headers.common['bypass-tunnel-reminder'] = 'true';

export const getApiServerUrl = (): string => {
  // 1. Production release builds ALWAYS connect to live production server domain
  if (!__DEV__) {
    return PRODUCTION_DOMAIN;
  }

  // 2. Explicit environment variable override for local dev testing
  if (process.env.EXPO_PUBLIC_SERVER_URL) {
    return process.env.EXPO_PUBLIC_SERVER_URL;
  }

  // 3. Development fallback
  return PUBLIC_TUNNEL_URL;
};

export const API_SERVER_URL = getApiServerUrl();
console.log('[Dream Ludo] Active API_SERVER_URL:', API_SERVER_URL);

/**
 * Sanitizes technical developer logs/errors into clean, user-friendly messages.
 * Prevents end-users from seeing raw IPs, developer instructions, or internal stack traces.
 */
export const formatUserFriendlyError = (err: any, fallbackMessage: string = 'Something went wrong. Please try again.'): string => {
  if (!err) return fallbackMessage;

  // 1. If backend returned a clear user-facing error string
  if (err.response?.data?.error && typeof err.response.data.error === 'string') {
    const backendMsg = err.response.data.error;
    // Hide any internal IP/URL accidentally included from backend
    if (!backendMsg.includes('http://') && !backendMsg.includes('https://') && !backendMsg.includes('192.168.')) {
      return backendMsg;
    }
  }

  // 2. Handle Firebase & Axios Network Connection errors
  const code = err.code || err.response?.data?.code;
  const rawMsg = String(err.message || '');

  if (
    code === 'auth/network-request-failed' ||
    rawMsg.includes('Network Error') ||
    rawMsg.includes('network') ||
    rawMsg.includes('192.168.') ||
    rawMsg.includes('http://') ||
    rawMsg.includes('ECONNREFUSED') ||
    rawMsg.includes('ETIMEDOUT')
  ) {
    return 'Unable to connect to server. Please check your internet connection and try again.';
  }

  if (code === 'auth/app-not-authorized' || code === 'auth/invalid-app-credential') {
    return 'App authentication setup required. Please ensure SHA-1 fingerprint is added in Firebase Console.';
  }

  if (code === 'auth/invalid-verification-code') {
    return 'Invalid verification code. Please check the 6-digit OTP sent to your phone and try again.';
  }

  if (code === 'auth/too-many-requests') {
    return 'Too many requests sent in a short time. Please wait a moment and try again.';
  }

  if (code === 'auth/user-disabled') {
    return 'This account has been suspended. Please contact support.';
  }

  // Fallback: If raw message contains technical URLs or raw code, replace with clean notice
  if (rawMsg.includes('http') || rawMsg.includes('192.168') || rawMsg.includes('JSON') || rawMsg.includes('undefined')) {
    return 'Service temporarily unavailable. Please try again in a few moments.';
  }

  return rawMsg || fallbackMessage;
};

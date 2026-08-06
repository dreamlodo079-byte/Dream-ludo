import Constants from 'expo-constants';
import { Platform, NativeModules } from 'react-native';
import axios from 'axios';

// Public Production Domain & Tunnel URLs
const PRODUCTION_DOMAIN = 'https://dream-ludo-62941319437.asia-south1.run.app';
const PUBLIC_TUNNEL_URL = 'https://dream-ludo-62941319437.asia-south1.run.app';

// (Removed bypass-tunnel-reminder because we are on Cloud Run now, and it breaks CORS)

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
    if (
      !backendMsg.includes('http://') && 
      !backendMsg.includes('192.168.') && 
      !backendMsg.includes('Cast to ObjectId') &&
      !backendMsg.includes('<!DOCTYPE html>') &&
      !backendMsg.includes('<html>')
    ) {
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
    rawMsg.includes('ECONNREFUSED') ||
    rawMsg.includes('ETIMEDOUT')
  ) {
    return 'Unable to connect to server. Please check your internet connection and try again.';
  }

  if (code === 'auth/app-not-authorized' || code === 'auth/invalid-app-credential') {
    return 'App authentication setup in progress. Please ensure SHA-1 fingerprint is added in Firebase Console.';
  }

  if (code === 'auth/invalid-verification-code') {
    return 'Invalid verification code. Please check the 6-digit OTP sent to your phone and try again.';
  }

  if (code === 'auth/too-many-requests' || code === 'auth/quota-exceeded') {
    return 'Too many SMS requests sent. Please wait a few minutes and try again.';
  }

  if (code === 'auth/user-disabled') {
    return 'This account has been suspended. Please contact support.';
  }

  if (code === 'auth/invalid-phone-number') {
    return 'Please enter a valid 10-digit mobile phone number.';
  }

  // Filter out any technical developer terminology or stack traces from reaching end-users
  if (
    rawMsg.includes('Firebase') ||
    rawMsg.includes('standalone') ||
    rawMsg.includes('compiled') ||
    rawMsg.includes('APK') ||
    rawMsg.includes('module') ||
    rawMsg.includes('Expo') ||
    rawMsg.includes('Error:') ||
    rawMsg.includes('JSON') ||
    rawMsg.includes('undefined') ||
    rawMsg.includes('null')
  ) {
    return fallbackMessage;
  }

  return rawMsg || fallbackMessage;
};

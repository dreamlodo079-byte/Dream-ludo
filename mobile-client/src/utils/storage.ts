import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import axios from 'axios';

const KEYS = {
  CURRENT_USER: '@dream_ludo_user',
  AUTH_TOKEN: '@dream_ludo_token',
  CURRENT_VIEW: '@dream_ludo_view',
};

/**
 * Saves user authentication session persistently
 */
export const saveUserSession = async (user: any, token?: string): Promise<void> => {
  try {
    const userStr = JSON.stringify(user);
    await AsyncStorage.setItem(KEYS.CURRENT_USER, userStr);
    
    if (token) {
      await AsyncStorage.setItem(KEYS.AUTH_TOKEN, token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      axios.defaults.headers.common['x-auth-token'] = token;
    }

    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('currentUser', userStr);
      if (token) {
        window.localStorage.setItem('authToken', token);
      }
    }
  } catch (err) {
    console.warn('Error saving user session:', err);
  }
};

/**
 * Loads user authentication session on app launch
 */
export const loadUserSession = async (): Promise<{ user: any | null; token: string | null; lastView: string | null }> => {
  try {
    let userStr = await AsyncStorage.getItem(KEYS.CURRENT_USER);
    let token = await AsyncStorage.getItem(KEYS.AUTH_TOKEN);
    let lastView = await AsyncStorage.getItem(KEYS.CURRENT_VIEW);

    // Fallback to web localStorage if needed
    if (!userStr && Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      userStr = window.localStorage.getItem('currentUser');
      token = window.localStorage.getItem('authToken');
      lastView = window.localStorage.getItem('view');
    }

    if (userStr) {
      const user = JSON.parse(userStr);
      if (token) {
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        axios.defaults.headers.common['x-auth-token'] = token;
      }
      return { user, token, lastView };
    }
  } catch (err) {
    console.warn('Error loading user session:', err);
  }
  return { user: null, token: null, lastView: null };
};

/**
 * Saves current view state
 */
export const saveCurrentView = async (view: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(KEYS.CURRENT_VIEW, view);
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('view', view);
    }
  } catch (err) {
    // Ignore error
  }
};

/**
 * Clears user session on logout
 */
export const clearUserSession = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(KEYS.CURRENT_USER);
    await AsyncStorage.removeItem(KEYS.AUTH_TOKEN);
    await AsyncStorage.removeItem(KEYS.CURRENT_VIEW);

    delete axios.defaults.headers.common['Authorization'];
    delete axios.defaults.headers.common['x-auth-token'];

    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem('currentUser');
      window.localStorage.removeItem('authToken');
      window.localStorage.removeItem('view');
    }
  } catch (err) {
    console.warn('Error clearing user session:', err);
  }
};

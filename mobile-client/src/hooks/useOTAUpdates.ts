import { useEffect, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Updates from 'expo-updates';

export const useOTAUpdates = () => {
  const [checking, setChecking] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isUpdateFetched, setIsUpdateFetched] = useState(false);

  const checkAndFetchUpdatesSilently = async () => {
    if (__DEV__) {
      console.log('Expo Updates are disabled in development mode');
      return;
    }

    try {
      setChecking(true);
      const update = await Updates.checkForUpdateAsync();

      if (update.isAvailable) {
        setUpdateAvailable(true);
        console.log('New update manifest found! Fetching silently in background...');
        
        const fetchResult = await Updates.fetchUpdateAsync();
        if (fetchResult.isNew) {
          setIsUpdateFetched(true);
          console.log('New bundle version downloaded. Application is ready to update on next background transition.');
        }
      }
    } catch (error) {
      console.warn('Failed to perform background OTA update sync check:', error);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    // 1. Check for manifest sync immediately on startup
    checkAndFetchUpdatesSilently();

    // 2. Add foreground change listener to check for updates
    const stateSubscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        checkAndFetchUpdatesSilently();
      }
    });

    return () => {
      stateSubscription.remove();
    };
  }, []);

  // 3. Add background transition listener to cleanly swap versions when user background idle
  useEffect(() => {
    const bgSubscription = AppState.addEventListener('change', async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' && isUpdateFetched) {
        try {
          console.log('App is backgrounded. Triggering silent application reload for OTA update deployment...');
          await Updates.reloadAsync();
        } catch (err) {
          console.warn('Failed to cleanly reload updates during background cycle:', err);
        }
      }
    });

    return () => {
      bgSubscription.remove();
    };
  }, [isUpdateFetched]);

  return { checking, updateAvailable, isUpdateFetched };
};

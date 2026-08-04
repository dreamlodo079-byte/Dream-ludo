import { useEffect, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Updates from 'expo-updates';

export const useOTAUpdates = () => {
  const [checking, setChecking] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isUpdateFetched, setIsUpdateFetched] = useState(false);

  const checkAndFetchUpdatesSilently = async () => {
    if (__DEV__ || !Updates.isEnabled) {
      return;
    }

    try {
      setChecking(true);
      const update = await Updates.checkForUpdateAsync();

      if (update.isAvailable) {
        setUpdateAvailable(true);
        const fetchResult = await Updates.fetchUpdateAsync();
        if (fetchResult.isNew) {
          setIsUpdateFetched(true);
          // Immediately reload JS bundle so updates apply seamlessly without needing reinstall
          try {
            await Updates.reloadAsync();
          } catch (e) {
            console.warn('Failed immediate OTA reload:', e);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to perform background OTA update sync check:', error);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkAndFetchUpdatesSilently();

    const stateSubscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        checkAndFetchUpdatesSilently();
      }
    });

    return () => {
      stateSubscription.remove();
    };
  }, []);

  useEffect(() => {
    const bgSubscription = AppState.addEventListener('change', async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' && isUpdateFetched && Updates.isEnabled) {
        try {
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

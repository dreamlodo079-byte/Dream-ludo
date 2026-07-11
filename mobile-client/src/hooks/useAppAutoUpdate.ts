import { useEffect, useState } from 'react';
import { AppState, AppStateStatus, Alert } from 'react-native';
import * as Updates from 'expo-updates';

export const useAppAutoUpdate = () => {
  const [checking, setChecking] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);

  const checkAndApplyUpdates = async () => {
    if (__DEV__) {
      console.log('Expo Updates are disabled in development mode');
      return;
    }

    try {
      setChecking(true);
      const update = await Updates.checkForUpdateAsync();

      if (update.isAvailable) {
        setUpdateAvailable(true);
        console.log('Update found! Fetching update silently...');
        
        // Silent background fetch of incremental patch files
        const fetchResult = await Updates.fetchUpdateAsync();
        
        if (fetchResult.isNew) {
          Alert.alert(
            'System Optimization',
            'Optimizing system performance... Restarting.',
            [
              {
                text: 'OK',
                onPress: async () => {
                  await Updates.reloadAsync();
                },
              },
            ],
            { cancelable: false }
          );
        }
      }
    } catch (error) {
      console.warn('Failed to check or fetch application updates:', error);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    // Check for updates on mount
    checkAndApplyUpdates();

    // Check for updates when app shifts to foreground
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        checkAndApplyUpdates();
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return { checking, updateAvailable };
};

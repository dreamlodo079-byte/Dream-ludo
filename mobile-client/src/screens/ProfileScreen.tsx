import React from 'react';
import { AuthWalletScreen } from './AuthWalletScreen';

export const ProfileScreen: React.FC<any> = (props) => {
  return <AuthWalletScreen {...props} />;
};

export default ProfileScreen;

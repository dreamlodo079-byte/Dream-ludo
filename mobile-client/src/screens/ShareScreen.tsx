import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Clipboard,
  Share,
  Linking,
  Platform,
} from 'react-native';

interface ShareScreenProps {
  currentUser: {
    _id: string;
    username: string;
    phone: string;
    referralCode?: string;
    friendsJoined?: number;
  } | null;
  onBack?: () => void;
}

export const ShareScreen: React.FC<ShareScreenProps> = ({ currentUser, onBack }) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const referralCode = currentUser?.referralCode || 'SEXUS50SEXUS';
  const friendsJoined = currentUser?.friendsJoined || 0;
  const totalCashEarned = friendsJoined * 100;
  const referralUrl = `https://sexus.platform/signup?ref=${referralCode}`;

  const handleCopyCode = () => {
    Clipboard.setString(referralCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
    Alert.alert('Code Copied!', `Referral code "${referralCode}" copied to clipboard.`);
  };

  const handleCopyLink = () => {
    Clipboard.setString(referralUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
    Alert.alert('Link Copied!', `Invite link copied to clipboard.`);
  };

  const handleWhatsAppShare = async () => {
    const message = `🎮 Play Sexus Ludo & win real cash! Sign up using my referral code *${referralCode}* to claim instant ₹10 bonus cash: ${referralUrl}`;
    
    try {
      const whatsappUrl = `whatsapp://send?text=${encodeURIComponent(message)}`;
      const supported = await Linking.canOpenURL(whatsappUrl);

      if (supported) {
        await Linking.openURL(whatsappUrl);
      } else {
        await Share.share({
          message,
          title: 'Invite Friends to Sexus Ludo',
        });
      }
    } catch (error: any) {
      console.error('Error sharing via WhatsApp:', error);
      Share.share({ message });
    }
  };

  return (
    <View style={styles.container}>
      {onBack && (
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
      )}

      {/* Main Referral Card matching reference specification */}
      <View style={styles.actionCard}>
        <Text style={styles.cardHeader}>🎁 SHARE & REFER TO EARN</Text>

        {/* Metrics Grid */}
        <View style={styles.referMetricsGrid}>
          <View style={styles.referMetricCol}>
            <Text style={styles.referMetricVal}>{friendsJoined}</Text>
            <Text style={styles.referMetricLabel}>Friends Joined</Text>
          </View>

          <View style={styles.metricDivider} />

          <View style={styles.referMetricCol}>
            <Text style={[styles.referMetricVal, styles.greenText]}>
              ₹{totalCashEarned}
            </Text>
            <Text style={styles.referMetricLabel}>Total Cash Earned</Text>
          </View>
        </View>

        {/* Referral Code Box */}
        <TouchableOpacity style={styles.clipboardBox} onPress={handleCopyCode} activeOpacity={0.7}>
          <View style={styles.clipboardLabelCol}>
            <Text style={styles.clipboardLabel}>REFERRAL CODE</Text>
            <Text style={styles.clipboardValue}>{referralCode}</Text>
          </View>
          <View style={[styles.copyBadge, copiedCode && styles.copyBadgeSuccess]}>
            <Text style={styles.copyBadgeText}>{copiedCode ? '✓ Copied' : 'Copy Code'}</Text>
          </View>
        </TouchableOpacity>

        {/* Invite Link Box */}
        <TouchableOpacity style={styles.clipboardBox} onPress={handleCopyLink} activeOpacity={0.7}>
          <View style={styles.clipboardLabelCol}>
            <Text style={styles.clipboardLabel}>INVITE LINK</Text>
            <Text style={styles.clipboardValue} numberOfLines={1}>{referralUrl}</Text>
          </View>
          <View style={[styles.copyBadge, copiedLink && styles.copyBadgeSuccess]}>
            <Text style={styles.copyBadgeText}>{copiedLink ? '✓ Copied' : 'Copy Link'}</Text>
          </View>
        </TouchableOpacity>

        {/* Green WhatsApp Action Button */}
        <TouchableOpacity style={styles.whatsappBtn} onPress={handleWhatsAppShare} activeOpacity={0.8}>
          <Text style={styles.whatsappBtnText}>Share on WhatsApp</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#F8FAFC',
  },
  backBtn: {
    marginBottom: 12,
  },
  backBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#4F46E5',
  },
  actionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#334155',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  cardHeader: {
    fontSize: 12,
    fontWeight: '900',
    color: '#334155',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  referMetricsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    paddingVertical: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  referMetricCol: {
    alignItems: 'center',
    flex: 1,
  },
  referMetricVal: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
  },
  greenText: {
    color: '#10B981',
  },
  referMetricLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },
  metricDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#E2E8F0',
  },
  clipboardBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#EEF2FF',
    borderWidth: 1.5,
    borderColor: '#C7D2FE',
    borderStyle: 'dashed',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  clipboardLabelCol: {
    flex: 1,
    marginRight: 8,
  },
  clipboardLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#6366F1',
    letterSpacing: 0.8,
  },
  clipboardValue: {
    fontSize: 13,
    fontWeight: '900',
    color: '#1E293B',
    marginTop: 2,
  },
  copyBadge: {
    backgroundColor: '#4F46E5',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  copyBadgeSuccess: {
    backgroundColor: '#10B981',
  },
  copyBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  whatsappBtn: {
    backgroundColor: '#22C55E',
    borderRadius: 14,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    shadowColor: '#22C55E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  whatsappBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
});

export default ShareScreen;

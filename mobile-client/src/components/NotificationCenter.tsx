import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import axios from 'axios';
import { Socket } from 'socket.io-client';

const API_SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:5000';

export interface NotificationItem {
  _id: string;
  title: string;
  message: string;
  type: 'DEPOSIT_SUCCESS' | 'DEPOSIT_REJECTED' | 'WITHDRAWAL_SUCCESS' | 'WITHDRAWAL_REJECTED' | 'GENERAL';
  isRead: boolean;
  createdAt: string;
}

interface NotificationCenterProps {
  currentUser: { _id: string; username: string };
  socket?: Socket | null;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  currentUser,
  socket,
}) => {
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const fetchNotifications = async () => {
    try {
      setIsLoading(true);
      const res = await axios.get(`${API_SERVER_URL}/api/v1/notifications/${currentUser._id}`);
      if (res.data.success) {
        setNotifications(res.data.notifications || []);
        setUnreadCount(res.data.unreadCount || 0);
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [currentUser._id]);

  useEffect(() => {
    if (!socket) return;

    const handleNotificationReceived = (data: any) => {
      if (data && data.userId === currentUser._id) {
        setNotifications((prev) => [data.notification, ...prev]);
        setUnreadCount((prev) => prev + 1);
      }
    };

    socket.on('NOTIFICATION_RECEIVED', handleNotificationReceived);
    socket.on('DEPOSIT_APPROVED', fetchNotifications);
    socket.on('DEPOSIT_REJECTED', fetchNotifications);
    socket.on('WITHDRAWAL_APPROVED', fetchNotifications);
    socket.on('WITHDRAWAL_REJECTED', fetchNotifications);

    return () => {
      socket.off('NOTIFICATION_RECEIVED', handleNotificationReceived);
      socket.off('DEPOSIT_APPROVED', fetchNotifications);
      socket.off('DEPOSIT_REJECTED', fetchNotifications);
      socket.off('WITHDRAWAL_APPROVED', fetchNotifications);
      socket.off('WITHDRAWAL_REJECTED', fetchNotifications);
    };
  }, [socket, currentUser._id]);

  const handleOpenModal = () => {
    setModalVisible(true);
    markAllAsRead();
  };

  const markAllAsRead = async () => {
    try {
      await axios.post(`${API_SERVER_URL}/api/v1/notifications/read`, {
        userId: currentUser._id,
      });
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch (err) {
      console.error('Failed to mark notifications read:', err);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'DEPOSIT_SUCCESS':
        return '💰';
      case 'DEPOSIT_REJECTED':
        return '❌';
      case 'WITHDRAWAL_SUCCESS':
        return '💸';
      case 'WITHDRAWAL_REJECTED':
        return '🚫';
      default:
        return '🔔';
    }
  };

  return (
    <>
      {/* Bell Icon Trigger with Unread Badge */}
      <TouchableOpacity style={styles.bellBtn} onPress={handleOpenModal} activeOpacity={0.8}>
        <Text style={styles.bellIcon}>🔔</Text>
        {unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Notification Center Modal */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>IN-APP NOTIFICATIONS</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={styles.closeText}>✕ CLOSE</Text>
              </TouchableOpacity>
            </View>

            {isLoading ? (
              <View style={styles.center}>
                <ActivityIndicator size="small" color="#4F46E5" />
              </View>
            ) : (
              <FlatList
                data={notifications}
                keyExtractor={(item) => item._id}
                contentContainerStyle={{ paddingVertical: 8 }}
                renderItem={({ item }) => (
                  <View style={[styles.notifCard, !item.isRead && styles.unreadNotifCard]}>
                    <Text style={styles.notifIcon}>{getNotificationIcon(item.type)}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.notifTitle}>{item.title}</Text>
                      <Text style={styles.notifMessage}>{item.message}</Text>
                      <Text style={styles.notifTime}>{new Date(item.createdAt).toLocaleString()}</Text>
                    </View>
                  </View>
                )}
                ListEmptyComponent={
                  <View style={styles.emptyBox}>
                    <Text style={{ fontSize: 32, marginBottom: 6 }}>🔕</Text>
                    <Text style={styles.emptyTitle}>No Notifications</Text>
                    <Text style={styles.emptySub}>You will receive instant updates when deposit & withdrawal requests are processed.</Text>
                  </View>
                }
              />
            )}
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  bellBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  bellIcon: {
    fontSize: 18,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    padding: 18,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.5,
  },
  closeText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#EF4444',
  },
  center: {
    padding: 40,
    alignItems: 'center',
  },
  notifCard: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  unreadNotifCard: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
  },
  notifIcon: {
    fontSize: 22,
  },
  notifTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0F172A',
  },
  notifMessage: {
    fontSize: 11,
    color: '#334155',
    marginTop: 2,
    lineHeight: 15,
  },
  notifTime: {
    fontSize: 9,
    color: '#94A3B8',
    marginTop: 4,
    fontWeight: '600',
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#475569',
  },
  emptySub: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 240,
  },
});

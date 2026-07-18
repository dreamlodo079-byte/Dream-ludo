import React, { createContext, useContext, useState, useCallback } from 'react';
import axios from 'axios';

const API_SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:5000';

export interface WalletBalances {
  deposits: number;
  winnings: number;
  total: number;
}

export interface LedgerTransaction {
  _id: string;
  amount: number;
  type: 'DEPOSIT' | 'WITHDRAWAL' | 'ENTRY_FEE' | 'ENTRY_FEE_DEBIT' | 'WINNINGS' | 'PLATFORM_COMMISSION';
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  referenceId: string;
  createdAt: string;
}

interface WalletContextType {
  balances: WalletBalances;
  history: LedgerTransaction[];
  loading: boolean;
  error: string | null;
  fetchWallet: (userId: string) => Promise<any>;
  addCash: (userId: string, amount: number) => Promise<{ success: boolean; upiIntent?: string; transactionId?: string; error?: string }>;
  withdrawWinnings: (userId: string, amount: number, upiId: string) => Promise<{ success: boolean; referenceId?: string; error?: string }>;
  clearCommissions: (adminKey: string, adminUpiId: string) => Promise<{ success: boolean; clearedAmount?: number; error?: string }>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [balances, setBalances] = useState<WalletBalances>({ deposits: 0, winnings: 0, total: 0 });
  const [history, setHistory] = useState<LedgerTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWallet = useCallback(async (userId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(`${API_SERVER_URL}/api/payout/balance/${userId}`);
      if (response.data.success) {
        setBalances(response.data.balances);
        setHistory(response.data.history);
        return response.data.user;
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to fetch wallet info');
    } finally {
      setLoading(false);
    }
    return null;
  }, []);

  const addCash = useCallback(async (userId: string, amount: number): Promise<{ success: boolean; upiIntent?: string; transactionId?: string; error?: string }> => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.post(`${API_SERVER_URL}/api/payments/create-intent`, {
        userId,
        amount,
      });
      if (response.data.success) {
        await fetchWallet(userId);
        return {
          success: true,
          upiIntent: response.data.upiIntent,
          transactionId: response.data.transactionId,
        };
      }
      return { success: false, error: 'Failed to create payment intent' };
    } catch (err: any) {
      const errMsg = err.response?.data?.error || err.message || 'Deposit initialization failed';
      setError(errMsg);
      return { success: false, error: errMsg };
    } finally {
      setLoading(false);
    }
  }, [fetchWallet]);

  const withdrawWinnings = useCallback(async (userId: string, amount: number, upiId: string): Promise<{ success: boolean; referenceId?: string; error?: string }> => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.post(`${API_SERVER_URL}/api/payout/withdraw`, {
        userId,
        amount,
        upiId,
      });
      if (response.data.success) {
        await fetchWallet(userId);
        return {
          success: true,
          referenceId: response.data.referenceId,
        };
      }
      return { success: false, error: 'Withdrawal request failed' };
    } catch (err: any) {
      const errMsg = err.response?.data?.error || err.message || 'Withdrawal failed';
      setError(errMsg);
      return { success: false, error: errMsg };
    } finally {
      setLoading(false);
    }
  }, [fetchWallet]);

  const clearCommissions = useCallback(async (adminKey: string, adminUpiId: string): Promise<{ success: boolean; clearedAmount?: number; error?: string }> => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.post(
        `${API_SERVER_URL}/api/payout/clear-commissions`,
        { adminUpiId },
        {
          headers: {
            'x-admin-key': adminKey,
          },
        }
      );
      if (response.data.success) {
        return {
          success: true,
          clearedAmount: response.data.clearedAmount,
        };
      }
      return { success: false, error: 'Commission clearing failed' };
    } catch (err: any) {
      const errMsg = err.response?.data?.error || err.message || 'Settlement failed';
      setError(errMsg);
      return { success: false, error: errMsg };
    } finally {
      setLoading(false);
    }
  }, []);

  return React.createElement(
    WalletContext.Provider,
    {
      value: {
        balances,
        history,
        loading,
        error,
        fetchWallet,
        addCash,
        withdrawWinnings,
        clearCommissions,
      }
    },
    children
  );
};

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};

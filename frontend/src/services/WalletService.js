// WalletService.js - FIREBASE VERSİYONU (DÜZELTİLMİŞ)
import { db } from '../firebase/firebaseClient';
import { 
  doc, 
  getDoc, 
  runTransaction,
  collection, 
  serverTimestamp 
} from 'firebase/firestore';

const isDevelopment = process.env.NODE_ENV === 'development';

export const WalletService = {
  
  async getProviderWalletData(uid) {
    try {
      const docRef = doc(db, 'service_providers', uid);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        return {
          // 22 mayis eklendi / Edrees
          tokenBalance: data.currentTokenCount ?? data.tokenBalance ?? 0,
          totalTokensBought: data.lifetimeTotalTokens ?? data.totalTokensBought ?? 0,
          totalMoneySpent: data.lifetimeTotalSpend ?? data.totalMoneySpent ?? 0,
        };
      }
      return { tokenBalance: 0, totalTokensBought: 0, totalMoneySpent: 0 };
    } catch (error) {
      if (isDevelopment) console.error("WalletService.getProviderWalletData error:", error.message);
      throw error;
    }
  },

  async processTokenAction(uid, amount, type, detail = {}) {
    const providerRef = doc(db, 'service_providers', uid);
    const historyRef = doc(collection(db, 'wallet_history'));

    try {
      await runTransaction(db, async (transaction) => {
        const providerDoc = await transaction.get(providerRef);
        if (!providerDoc.exists()) throw "Uzman kaydı bulunamadı!";

        const previousTokens = providerDoc.data().currentTokenCount || 0;
        const previousTotalSpent = providerDoc.data().lifetimeTotalSpend || 0;
        const previousTotalBought = providerDoc.data().lifetimeTotalTokens || 0;

        const updatedTokens = previousTokens + amount;
        let updatedTotalSpent = previousTotalSpent;
        let updatedTotalBought = previousTotalBought;

        if (type === 'LOAD') {
          updatedTotalSpent += (detail.price || 0);
          updatedTotalBought += amount;
        }

        let providerName = providerDoc.data()?.businessName || providerDoc.data()?.displayName;
        if (!providerName) {
          const userDoc = await transaction.get(doc(db, 'users', uid));
          providerName = userDoc.data()?.displayName || "İsimsiz Uzman";
        }

        transaction.update(providerRef, {
          currentTokenCount: updatedTokens,
          lifetimeTotalSpend: updatedTotalSpent,
          lifetimeTotalTokens: updatedTotalBought
        });

        transaction.set(historyRef, {
          userId: uid,
          providerDisplayName: providerName,
          transactionType: type,
          tokensInTransaction: amount,
          previousTokens: previousTokens,
          updatedTokens: updatedTokens,
          amountPaid: detail.price || 0,
          previousTotalSpent: previousTotalSpent,
          updatedTotalSpent: updatedTotalSpent,
          transactionNote: detail.description || '',
          referenceId: detail.relatedId || '', 
          targetCustomerId: detail.targetCustomerId || null,
          cardOwner: detail.cardHolderName || null,
          cardLastFour: detail.cardLastFour || null,
          processedAt: serverTimestamp()
        });
      });

      return { success: true };
    } catch (error) {
      if (isDevelopment) console.error("Cüzdan işlemi hatası:", error.message);
      throw error;
    }
  },
};
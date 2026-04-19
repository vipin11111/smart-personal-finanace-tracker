export type TransactionType = 'income' | 'expense';

export interface Transaction {
  id: string;
  userId: string;
  amount: number;
  type: TransactionType;
  category: string;
  date: string;
  description: string;
  createdAt: string;
}

export interface Budget {
  id: string;
  userId: string;
  category: string;
  amount: number;
  month: string; // YYYY-MM
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
}

export const CATEGORIES = [
  'Food',
  'Travel',
  'Rent',
  'Shopping',
  'Bills',
  'Salary',
  'Freelance',
  'Entertainment',
  'Others'
] as const;

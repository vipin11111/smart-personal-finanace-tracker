import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Minus, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  PieChart as PieChartIcon, 
  BarChart as BarChartIcon,
  LogOut,
  Sparkles,
  Search,
  Filter,
  Trash2,
  Calendar,
  AlertCircle
} from 'lucide-react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  orderBy,
  Timestamp,
  updateDoc,
  setDoc,
  getDocs
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User 
} from 'firebase/auth';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend 
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { format, subMonths, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';

import { db, auth } from './lib/firebase';
import { cn, formatCurrency } from './lib/utils';
import { Transaction, Budget, CATEGORIES, TransactionType } from './types';
import { getFinancialInsights } from './services/geminiService';

// --- Constants ---
const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#06b6d4'];

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiInsights, setAiInsights] = useState<string | null>(null);
  const [isAiGenerating, setIsAiGenerating] = useState(false);

  // Form states
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTransaction, setNewTransaction] = useState({
    amount: '',
    type: 'expense' as TransactionType,
    category: 'Food',
    description: '',
    date: format(new Date(), 'yyyy-MM-dd')
  });

  const [budgetLimit, setBudgetLimit] = useState<number>(0);

  // Filter states
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // 1. Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. Data Listeners
  useEffect(() => {
    if (!user) {
      setTransactions([]);
      setBudgets([]);
      return;
    }

    const tQuery = query(
      collection(db, 'transactions'),
      where('userId', '==', user.uid),
      orderBy('date', 'desc')
    );

    const bQuery = query(
      collection(db, 'budgets'),
      where('userId', '==', user.uid)
    );

    const unsubscribeT = onSnapshot(tQuery, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Transaction));
      setTransactions(data);
    });

    const unsubscribeB = onSnapshot(bQuery, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Budget));
      setBudgets(data);
      if (data.length > 0) {
        setBudgetLimit(data[0].amount);
      }
    });

    return () => {
      unsubscribeT();
      unsubscribeB();
    };
  }, [user]);

  // 3. Calculated Stats
  const stats = useMemo(() => {
    const totalIncome = transactions
      .filter(t => t.type === 'income')
      .reduce((acc, t) => acc + t.amount, 0);
    const totalExpense = transactions
      .filter(t => t.type === 'expense')
      .reduce((acc, t) => acc + t.amount, 0);
    const balance = totalIncome - totalExpense;
    
    // Monthly stats
    const now = new Date();
    const currentMonthTransactions = transactions.filter(t => 
      isWithinInterval(new Date(t.date), {
        start: startOfMonth(now),
        end: endOfMonth(now)
      })
    );
    
    const monthlySpending = currentMonthTransactions
      .filter(t => t.type === 'expense')
      .reduce((acc, t) => acc + t.amount, 0);

    return { totalIncome, totalExpense, balance, monthlySpending };
  }, [transactions]);

  // 4. Chart Data
  const pieData = useMemo(() => {
    const categories: Record<string, number> = {};
    transactions
      .filter(t => t.type === 'expense')
      .forEach(t => {
        categories[t.category] = (categories[t.category] || 0) + t.amount;
      });
    return Object.entries(categories).map(([name, value]) => ({ name, value }));
  }, [transactions]);

  const lineData = useMemo(() => {
    const months: Record<string, { income: number, expense: number }> = {};
    // Last 6 months
    for (let i = 5; i >= 0; i--) {
      const monthStr = format(subMonths(new Date(), i), 'MMM');
      months[monthStr] = { income: 0, expense: 0 };
    }

    transactions.forEach(t => {
      const monthStr = format(new Date(t.date), 'MMM');
      if (months[monthStr]) {
        if (t.type === 'income') months[monthStr].income += t.amount;
        else months[monthStr].expense += t.amount;
      }
    });

    return Object.entries(months).map(([name, data]) => ({ name, ...data }));
  }, [transactions]);

  // 5. Actions
  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const handleLogout = () => signOut(auth);

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newTransaction.amount) return;

    try {
      await addDoc(collection(db, 'transactions'), {
        ...newTransaction,
        amount: parseFloat(newTransaction.amount),
        userId: user.uid,
        createdAt: new Date().toISOString()
      });
      setShowAddForm(false);
      setNewTransaction({
        amount: '',
        type: 'expense',
        category: 'Food',
        description: '',
        date: format(new Date(), 'yyyy-MM-dd')
      });
    } catch (err) {
      console.error(err);
      alert('Error adding transaction');
    }
  };

  const handleDeleteTransaction = async (id: string) => {
    if (confirm('Are you sure you want to delete this transaction?')) {
      await deleteDoc(doc(db, 'transactions', id));
    }
  };

  const updateBudget = async (amount: number) => {
    if (!user) return;
    const month = format(new Date(), 'yyyy-MM');
    const budgetData = {
      userId: user.uid,
      amount,
      category: 'total',
      month,
      updatedAt: new Date().toISOString()
    };

    if (budgets.length > 0) {
      await updateDoc(doc(db, 'budgets', budgets[0].id), budgetData);
    } else {
      await addDoc(collection(db, 'budgets'), budgetData);
    }
  };

  const generateAIInsights = async () => {
    if (transactions.length === 0) {
      alert('Please add some transactions first!');
      return;
    }
    setIsAiGenerating(true);
    const insights = await getFinancialInsights(transactions, budgetLimit);
    setAiInsights(insights);
    setIsAiGenerating(false);
  };

  // Filtered transactions
  const filteredTransactions = transactions.filter(t => {
    const categoryMatch = filterCategory === 'All' || t.category === filterCategory;
    const searchMatch = t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        t.category.toLowerCase().includes(searchQuery.toLowerCase());
    return categoryMatch && searchMatch;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-bg flex flex-col items-center justify-center p-4 text-text-primary">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-card rounded-3xl shadow-2xl p-8 text-center border border-border-subtle"
        >
          <div className="bg-accent/10 w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <DollarSign className="w-12 h-12 text-accent" />
          </div>
          <h1 className="text-3xl font-bold mb-2 italic-serif">Welcome Back</h1>
          <p className="text-text-secondary mb-8">Take control of your finances today with Elegant Smart Tracker.</p>
          <button 
            onClick={handleLogin}
            className="w-full bg-accent text-white rounded-xl py-4 font-semibold flex items-center justify-center gap-3 hover:bg-accent/90 transition-all shadow-lg shadow-accent/20"
          >
            <img src="https://www.google.com/favicon.ico" className="w-5 h-5 brightness-150" alt="Google" />
            Sign in with Google
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-text-primary font-sans flex overflow-hidden h-screen">
      {/* --- Sidebar --- */}
      <aside className="w-64 bg-sidebar border-r border-border-subtle p-6 flex flex-col gap-8 hidden lg:flex overflow-y-auto">
        <div className="flex items-center gap-3 text-accent mb-4">
          <div className="bg-accent/10 p-2 rounded-lg">
            <TrendingUp className="w-6 h-6" />
          </div>
          <span className="font-bold text-xl tracking-tight">SmartFinance</span>
        </div>

        <nav>
          <ul className="space-y-2">
            {[
              { id: 'dashboard', label: 'Dashboard', active: true },
              { id: 'transactions', label: 'Transactions' },
              { id: 'budget', label: 'Monthly Budget' },
              { id: 'insights', label: 'AI Insights' },
              { id: 'accounts', label: 'Accounts' },
              { id: 'settings', label: 'Settings' }
            ].map((item) => (
              <li 
                key={item.id}
                className={cn(
                  "px-4 py-3 rounded-xl text-sm font-medium cursor-pointer transition-all",
                  item.active 
                    ? "bg-accent/10 text-accent" 
                    : "text-text-secondary hover:bg-white/5 hover:text-text-primary"
                )}
              >
                {item.label}
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-auto">
          <div className="p-4 bg-white/5 rounded-2xl border border-border-subtle">
            <p className="text-xs text-text-secondary mb-1">Current Membership</p>
            <p className="text-sm font-bold text-accent">Pro Plan Active</p>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full mt-4 flex items-center gap-2 px-4 py-3 text-sm text-text-secondary hover:text-danger hover:bg-danger/10 rounded-xl transition-all"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* --- Main Content --- */}
      <main className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-10 flex flex-col gap-8">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl font-semibold italic-serif leading-tight">Financial Overview</h1>
            <p className="text-text-secondary text-sm mt-1">Ready to optimize your spending?</p>
          </div>
          <div className="flex items-center gap-4 bg-card/50 px-4 py-2 rounded-2xl border border-border-subtle">
            <div className="w-10 h-10 rounded-full bg-accent text-white flex items-center justify-center font-bold">
              {user.displayName?.[0] || 'U'}
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-bold leading-none mb-1">{user.displayName}</p>
              <p className="text-xs text-text-secondary">Standard Member</p>
            </div>
          </div>
        </header>

        {/* --- Highlight Column --- */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-card p-6 rounded-3xl border border-border-subtle shadow-lg relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
              <DollarSign className="w-16 h-16" />
            </div>
            <p className="text-xs font-bold text-text-secondary uppercase tracking-widest mb-2">Total Balance</p>
            <p className={cn("text-3xl font-bold tracking-tight", stats.balance < 0 ? "text-danger" : "text-white")}>
              {formatCurrency(stats.balance)}
            </p>
            <div className="mt-4 flex items-center gap-2 text-xs text-success">
              <span>↑ +2.4% from last month</span>
            </div>
          </div>

          <div className="bg-card p-6 rounded-3xl border border-border-subtle shadow-lg relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
              <TrendingUp className="w-16 h-16" />
            </div>
            <p className="text-xs font-bold text-text-secondary uppercase tracking-widest mb-2">Monthly Income</p>
            <p className="text-3xl font-bold tracking-tight text-success">
              {formatCurrency(stats.totalIncome)}
            </p>
          </div>

          <div className="bg-card p-6 rounded-3xl border border-border-subtle shadow-lg relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
              <TrendingDown className="w-16 h-16" />
            </div>
            <p className="text-xs font-bold text-text-secondary uppercase tracking-widest mb-2">Monthly Expenses</p>
            <p className="text-3xl font-bold tracking-tight text-danger">
              {formatCurrency(stats.totalExpense)}
            </p>
          </div>
        </div>

        {/* --- Dashboard Content Grid --- */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
          
          {/* Left Column: Transactions */}
          <div className="xl:col-span-8 flex flex-col gap-8">
            <div className="bg-card p-6 rounded-3xl border border-border-subtle shadow-lg">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                <div className="flex items-center gap-3">
                  <h3 className="font-bold text-xl">Recent Transactions</h3>
                  <button onClick={() => setShowAddForm(true)} className="text-accent underline text-sm font-medium">Add New</button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
                    <input 
                      type="text" 
                      placeholder="Search..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 pr-4 py-2 bg-white/5 border border-border-subtle rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-accent w-full sm:w-40 placeholder:text-text-secondary/50"
                    />
                  </div>
                  <select 
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="px-4 py-2 bg-white/5 border border-border-subtle rounded-xl text-sm focus:outline-none text-text-secondary"
                  >
                    <option value="All">All Categories</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                {filteredTransactions.length === 0 ? (
                  <div className="text-center py-20 text-text-secondary/30">
                    <p>No transactions found.</p>
                  </div>
                ) : (
                  filteredTransactions.map((t) => (
                    <motion.div 
                      layout
                      key={t.id}
                      className="group flex items-center justify-between p-4 bg-white/[0.02] border border-border-subtle rounded-2xl hover:bg-white/[0.05] transition-all"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-white/[0.05] border border-border-subtle flex items-center justify-center text-xl">
                          {t.category === 'Food' ? '🛒' : t.category === 'Rent' ? '🏢' : t.category === 'Salary' ? '💰' : t.category === 'Travel' ? '✈️' : '📦'}
                        </div>
                        <div>
                          <p className="font-bold text-text-primary leading-tight">{t.description || t.category}</p>
                          <p className="text-xs text-text-secondary mt-1">{format(new Date(t.date), 'MMM dd')} • {t.category}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-right">
                        <p className={cn("font-bold text-lg", t.type === 'income' ? "text-success" : "text-danger")}>
                          {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
                        </p>
                        <button 
                          onClick={() => handleDeleteTransaction(t.id)}
                          className="p-2 text-text-secondary/30 hover:text-danger rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </div>

            <div className="bg-card p-6 rounded-3xl border border-border-subtle shadow-lg">
              <h3 className="font-bold text-lg mb-6">Spending Trend vs Income</h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={lineData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <YAxis hide />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1A1D23', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px' }}
                      itemStyle={{ color: '#fff' }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                    <Line type="monotone" dataKey="income" stroke="#10b981" strokeWidth={3} dot={false} activeDot={{ r: 4 }} />
                    <Line type="monotone" dataKey="expense" stroke="#ef4444" strokeWidth={3} dot={false} activeDot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Right Column: Insights & Budget */}
          <div className="xl:col-span-4 flex flex-col gap-8">
            
            {/* AI Insights Section */}
            <div className="bg-card p-6 rounded-3xl border border-border-subtle shadow-lg relative overflow-hidden">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold text-lg">AI Financial Insights</h3>
                <span className="ai-gradient text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest text-white shadow-sm">AI Insight</span>
              </div>
              
              {!aiInsights && !isAiGenerating && (
                <div className="text-center py-6">
                  <p className="text-sm text-text-secondary mb-4">Analyze your data for custom saving tips.</p>
                  <button 
                    onClick={generateAIInsights}
                    className="w-full bg-accent/10 border border-accent/20 text-accent rounded-xl py-3 text-sm font-bold hover:bg-accent/20 transition-all flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    Run Analysis
                  </button>
                </div>
              )}

              {isAiGenerating && (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <Sparkles className="w-8 h-8 text-accent animate-pulse" />
                  <p className="text-sm text-text-secondary">Generating smart insights...</p>
                </div>
              )}

              {aiInsights && (
                <div className="ai-surface p-5 rounded-2xl relative">
                  <button onClick={() => setAiInsights(null)} className="absolute top-3 right-3 text-text-secondary/50 hover:text-text-primary">✕</button>
                  <div className="prose prose-invert prose-sm max-w-none text-indigo-100/90 leading-relaxed">
                    <ReactMarkdown>{aiInsights}</ReactMarkdown>
                  </div>
                </div>
              )}
            </div>

            {/* Budget Section */}
            <div className="bg-card p-6 rounded-3xl border border-border-subtle shadow-lg">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-bold text-lg">Monthly Budget</h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-text-secondary">Edit</span>
                  <input 
                    type="number" 
                    value={budgetLimit}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setBudgetLimit(val);
                    }}
                    onBlur={() => updateBudget(budgetLimit)}
                    className="w-20 px-2 py-1 bg-white/5 border border-border-subtle rounded-lg text-sm font-bold text-right text-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between text-sm">
                  <span className="text-text-secondary">{formatCurrency(stats.monthlySpending)} of {formatCurrency(budgetLimit)}</span>
                  <span className="font-bold text-accent">{Math.round((stats.monthlySpending / (budgetLimit || 1)) * 100)}%</span>
                </div>
                <div className="h-2.5 bg-white/5 rounded-full overflow-hidden border border-border-subtle">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min((stats.monthlySpending / (budgetLimit || 1)) * 100, 100)}%` }}
                    className={cn(
                      "h-full rounded-full transition-all duration-700",
                      stats.monthlySpending > budgetLimit ? "bg-danger" : "bg-accent"
                    )}
                  />
                </div>
                {stats.monthlySpending > budgetLimit && budgetLimit > 0 && (
                  <p className="text-[10px] text-danger font-bold uppercase tracking-widest mt-2 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> Overspent by {formatCurrency(stats.monthlySpending - budgetLimit)}
                  </p>
                )}
              </div>

              <div className="mt-8 pt-8 border-t border-border-subtle">
                <h4 className="text-xs font-bold text-text-secondary uppercase tracking-widest mb-6">Top Categories</h4>
                <div className="flex items-center gap-8 mb-4">
                  <div className="w-24 h-24 relative flex-shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          innerRadius={30}
                          outerRadius={45}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-2">
                    {pieData.slice(0, 3).map((d, i) => (
                      <div key={d.name} className="flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          <span className="text-text-secondary uppercase">{d.name}</span>
                        </div>
                        <span className="font-bold">{Math.round((d.value / (stats.totalExpense || 1)) * 100)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </main>

      {/* --- Add Form Modal --- */}
      <AnimatePresence>
        {showAddForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddForm(false)}
              className="absolute inset-0 bg-bg/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-card rounded-[32px] shadow-2xl overflow-hidden border border-border-subtle"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-bold italic-serif">New Transaction</h2>
                  <button onClick={() => setShowAddForm(false)} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-text-secondary hover:text-white transition-colors">✕</button>
                </div>

                <form onSubmit={handleAddTransaction} className="space-y-6">
                  <div className="flex p-1 bg-white/5 rounded-2xl border border-border-subtle gap-1">
                    <button 
                      type="button"
                      onClick={() => setNewTransaction(prev => ({ ...prev, type: 'expense' }))}
                      className={cn(
                        "flex-1 py-2.5 rounded-xl text-sm font-bold transition-all",
                        newTransaction.type === 'expense' ? "bg-accent text-white shadow-lg" : "text-text-secondary hover:text-text-primary"
                      )}
                    >
                      Expense
                    </button>
                    <button 
                      type="button"
                      onClick={() => setNewTransaction(prev => ({ ...prev, type: 'income' }))}
                      className={cn(
                        "flex-1 py-2.5 rounded-xl text-sm font-bold transition-all",
                        newTransaction.type === 'income' ? "bg-accent text-white shadow-lg" : "text-text-secondary hover:text-text-primary"
                      )}
                    >
                      Income
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest pl-1">Amount</label>
                      <div className="relative">
                        <DollarSign className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary" />
                        <input 
                          required
                          type="number" 
                          step="0.01"
                          placeholder="0.00"
                          value={newTransaction.amount}
                          onChange={(e) => setNewTransaction(prev => ({ ...prev, amount: e.target.value }))}
                          className="w-full pl-10 pr-4 py-3.5 bg-white/5 border border-border-subtle rounded-2xl focus:outline-none focus:border-accent font-bold placeholder:text-text-secondary/20"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest pl-1">Date</label>
                      <input 
                        required
                        type="date" 
                        value={newTransaction.date}
                        onChange={(e) => setNewTransaction(prev => ({ ...prev, date: e.target.value }))}
                        className="w-full px-4 py-3.5 bg-white/5 border border-border-subtle rounded-2xl focus:outline-none focus:border-accent text-sm font-medium"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest pl-1">Category</label>
                    <select 
                      value={newTransaction.category}
                      onChange={(e) => setNewTransaction(prev => ({ ...prev, category: e.target.value }))}
                      className="w-full px-4 py-3.5 bg-white/5 border border-border-subtle rounded-2xl focus:outline-none focus:border-accent text-sm font-medium appearance-none"
                    >
                      {CATEGORIES.map(c => <option key={c} value={c} className="bg-sidebar">{c}</option>)}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest pl-1">Description</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Weekly Groceries"
                      value={newTransaction.description}
                      onChange={(e) => setNewTransaction(prev => ({ ...prev, description: e.target.value }))}
                      className="w-full px-4 py-3.5 bg-white/5 border border-border-subtle rounded-2xl focus:outline-none focus:border-accent text-sm placeholder:text-text-secondary/20"
                    />
                  </div>

                  <button 
                    type="submit"
                    className="w-full bg-accent text-white rounded-2xl py-4 font-bold shadow-xl shadow-accent/20 hover:bg-accent/90 transition-all flex items-center justify-center gap-2 mt-4"
                  >
                    Save Transaction
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

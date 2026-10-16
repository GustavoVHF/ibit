import type { VercelRequest, VercelResponse } from '@vercel/node';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldPath } from 'firebase-admin/firestore';

// Initialize Firebase Admin
if (!getApps().length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  initializeApp({ credential: cert(serviceAccount) });
}

const db = getFirestore('ai-studio-f3c49800-953a-4256-9966-e5f505300c6d');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = req.query.token as string;

  if (!token) {
    return res.status(400).json({ error: 'Token is required' });
  }

  try {
    // Find project by audit token
    const projectsSnap = await db.collection('projects')
      .where('auditToken', '==', token)
      .limit(1)
      .get();

    if (projectsSnap.empty) {
      return res.status(404).json({ error: 'Invalid or expired token' });
    }

    const projectDoc = projectsSnap.docs[0];
    const projectData = projectDoc.data();
    const projectId = projectDoc.id;

    // Fetch boards, tasks, transactions, budgets in parallel
    const promises: Promise<any>[] = [
      db.collection('boards').where('projectId', '==', projectId).get(),
      db.collection('tasks').where('projectId', '==', projectId).get(),
      db.collection('transactions').where('projectId', '==', projectId).get(),
      db.collection('budgets').where('projectId', '==', projectId).get(),
    ];

    // Only fetch users if there are members
    if (projectData.members && projectData.members.length > 0) {
      promises.push(db.collection('users').where(FieldPath.documentId(), 'in', projectData.members.slice(0, 30)).get());
    } else {
      promises.push(Promise.resolve({ docs: [] }));
    }

    const [boardsSnap, tasksSnap, transactionsSnap, budgetsSnap, usersSnap] = await Promise.all(promises);

    // Parse boards and tasks
    const boards = boardsSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
    const tasks = tasksSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Calculate KPIs
    let todoCount = 0;
    if (boards.length === 0) {
      todoCount = 0;
    } else if (boards.length === 1) {
      todoCount = tasks.length;
    } else {
      const doneBoardId = boards[boards.length - 1].id;
      todoCount = tasks.filter((t: any) => t.boardId !== doneBoardId).length;
    }

    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    const completedLast7Days = tasks.filter((t: any) => {
      if (!t.dueDate) return false;
      const dueTime = t.dueDate._seconds ? t.dueDate._seconds * 1000 : new Date(t.dueDate).getTime();
      return dueTime >= sevenDaysAgo && dueTime <= now;
    }).length;

    // Calculate balance
    const transactions = transactionsSnap.docs.map(d => d.data());
    const balance = transactions.reduce((acc: number, t: any) => {
      if (t.isExternal) return acc;
      return t.type === 'income' ? acc + t.amount : acc - t.amount;
    }, 0);

    // Calculate countdown
    let countdown = null;
    if (projectData.targetDate) {
      const targetTime = projectData.targetDate._seconds ? projectData.targetDate._seconds * 1000 : new Date(projectData.targetDate).getTime();
      countdown = Math.ceil((targetTime - now) / (1000 * 60 * 60 * 24));
    }

    // Parse members
    const members = usersSnap.docs.map(d => ({
      uid: d.id,
      name: d.data().name,
      photoURL: d.data().photoURL
    }));

    // Calculate chart data for Pie Chart
    const expenseCategories: Record<string, number> = {};
    transactions.forEach((t: any) => {
      if (t.type === 'expense') {
        const cat = t.category || 'Sem Categoria';
        expenseCategories[cat] = (expenseCategories[cat] || 0) + t.amount;
      }
    });
    const chartData = Object.keys(expenseCategories).map(key => ({
      name: key,
      value: expenseCategories[key]
    })).sort((a, b) => b.value - a.value);

    // Calculate cash flow data
    const sortedTrans = [...transactions].sort((a: any, b: any) => {
      const da = a.date._seconds ? a.date._seconds * 1000 : new Date(a.date).getTime();
      const db = b.date._seconds ? b.date._seconds * 1000 : new Date(b.date).getTime();
      return da - db;
    });

    const monthNames = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
    const rawMonths: { name: string; key: string; income: number; expense: number }[] = [];

    sortedTrans.forEach((t: any) => {
      const date = new Date(t.date._seconds ? t.date._seconds * 1000 : t.date);
      const m = date.getMonth();
      const y = date.getFullYear();
      const key = `${y}-${m.toString().padStart(2, '0')}`;

      let monthRow = rawMonths.find(r => r.key === key);
      if (!monthRow) {
        monthRow = { name: `${monthNames[m]}/${y.toString().slice(-2)}`, key, income: 0, expense: 0 };
        rawMonths.push(monthRow);
      }
      if (t.type === 'income') monthRow.income += t.amount;
      if (t.type === 'expense') monthRow.expense += t.amount;
    });

    let accIncome = 0;
    let accExpense = 0;
    const cashFlowData = rawMonths.map(row => {
      accIncome += row.income;
      accExpense += row.expense;
      return {
        name: row.name,
        Entrada: accIncome,
        Saída: accExpense
      };
    });

    // Return clean JSON
    return res.status(200).json({
      project: {
        id: projectId,
        name: projectData.name,
        shortId: projectData.shortId,
        photoURL: projectData.photoURL || null,
        targetEventName: projectData.targetEventName || null,
        targetDate: projectData.targetDate || null
      },
      kpis: {
        todoCount,
        completedLast7Days,
        balance,
        countdown
      },
      charts: {
        chartData,
        cashFlowData
      },
      members
    });
  } catch (error) {
    console.error('Error fetching public dashboard:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

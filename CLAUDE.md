# CLAUDE.md — IBIT Platform (Carnelian Escuderia)

> **Plataforma de gestão de projetos** voltada a STEM Racing e gestores reais.
> Foco em escalabilidade, performance, segurança e UI premium.

---

## 📋 Visão Geral do Projeto

**IBIT** é uma plataforma SPA de gestão de projetos construída com **React + Vite + TypeScript + TailwindCSS v4 + Firebase**. Originalmente criada para a escuderia **Carnelian** (equipe de STEM Racing), mas desenhada para ser genérica e escalável a qualquer gestor de projetos.

### Stack Técnica

| Camada | Tecnologia | Detalhes |
|---|---|---|
| **Frontend** | React 19 + TypeScript 5.8 | SPA com react-router-dom v7 |
| **Build** | Vite 6.2 | Com @tailwindcss/vite plugin |
| **Estilização** | TailwindCSS v4 | `@import "tailwindcss"` via `@theme` (NÃO usa tailwind.config.js) |
| **Backend/DB** | Firebase (Firestore) | Coleções top-level, sem subcoleções |
| **Auth** | Firebase Auth | Google OAuth (signInWithPopup) |
| **Storage (imagens)** | Cloudinary | Upload direto client-side com preset público |
| **State Management** | React Context + Firestore onSnapshot | Tempo real, sem Redux |
| **Animações** | motion (Framer Motion) | `motion/react` — ATENÇÃO: import é `from 'motion/react'` |
| **Charts** | Recharts | PieChart, LineChart no módulo Financeiro |
| **PDF Export** | jsPDF + html-to-image | Exportação de relatórios financeiros |
| **Drag & Drop** | @hello-pangea/dnd | Kanban board (colunas e tarefas) |
| **Flow Diagrams** | @xyflow/react | Quadro (whiteboard de nós e arestas) |
| **Icons** | lucide-react | Toda iconografia |

### Como Rodar

```bash
npm install
npm run dev          # Roda em http://localhost:3000
npm run build        # Build de produção
npm run lint         # TypeScript check (tsc --noEmit)
```

---

## 🏗️ Arquitetura do Projeto

### Estrutura de Arquivos

```
ibi2/
├── index.html                    # Entry HTML
├── firebase-applet-config.json   # Firebase config (projectId, apiKey, etc.)
├── firestore.rules               # Regras de segurança Firestore (COMPLETAS)
├── vite.config.ts                # Vite config (TailwindCSS plugin, Gemini env)
├── tsconfig.json                 # TypeScript config
├── package.json
└── src/
    ├── main.tsx                  # Entry point (StrictMode + ErrorBoundary)
    ├── App.tsx                   # Router + AuthProvider + SidebarProvider
    ├── firebase.ts               # Firebase SDK init (db, auth, storage)
    ├── index.css                 # Design tokens (@theme) + Lufga font
    ├── types.ts                  # TODAS as interfaces TypeScript
    ├── contexts/
    │   ├── AuthContext.tsx        # Firebase Auth state (user, loading)
    │   └── SidebarContext.tsx     # Sidebar collapse state (persistido em localStorage)
    ├── utils/
    │   └── errorHandlers.ts      # handleFirestoreError + OperationType enum
    ├── media/
    │   ├── ibitlogo.svg          # Logo da plataforma
    │   └── ibitlogo.png
    └── components/
        ├── Login.tsx              # Tela de login (Google OAuth)
        ├── Dashboard.tsx          # Lista de projetos do usuário
        ├── Sidebar.tsx            # Sidebar global (navegação)
        ├── ProjectDashboard.tsx   # Dashboard do projeto (cards de tarefas)
        ├── ProjectBoard.tsx       # Kanban board (colunas + tarefas)
        ├── TaskDetailsModal.tsx   # Modal de detalhes de tarefa
        ├── ProjectSettingsModal.tsx # Config do projeto (nome, foto, delete)
        ├── UserProfileModal.tsx   # Perfil do usuário (nome, foto)
        ├── ErrorBoundary.tsx      # Error boundary global
        ├── Calendar.tsx           # Calendário de tarefas
        ├── Quadro.tsx             # Whiteboard (React Flow)
        ├── QuadroCustomNodes.tsx  # Nós customizados do Quadro
        ├── Inventory.tsx          # Inventário de itens
        ├── Assets.tsx             # Gerenciador de links/pastas
        ├── RACIMatrix.tsx         # Matriz RACI (responsabilidades)
        ├── GanttChart.tsx         # Gráfico de Gantt
        └── ProjectFinance.tsx     # Módulo financeiro completo
```

### Fluxo de Navegação (Rotas)

```
/                           → Login (Google OAuth)
/dashboard                  → Lista de Projetos (Dashboard.tsx)
/project/:projectId         → Dashboard do Projeto (ProjectDashboard.tsx)
/project/:projectId/kanban  → Kanban Board (ProjectBoard.tsx)
/project/:projectId/quadro  → Whiteboard (Quadro.tsx)
/project/:projectId/calendar → Calendário (Calendar.tsx)
/project/:projectId/inventory → Inventário (Inventory.tsx)
/project/:projectId/assets  → Ativos/Links (Assets.tsx)
/project/:projectId/raci    → Matriz RACI (RACIMatrix.tsx)
/project/:projectId/gantt   → Gráfico de Gantt (GanttChart.tsx)
/project/:projectId/finance → Financeiro (ProjectFinance.tsx)
```

Todas as rotas de projeto usam `PrivateRoute` (redireciona para `/` se não autenticado).

---

## 🎨 Design System

### Fonte
- **Lufga** (importada de cdnfonts.com)
- Definida como `--font-sans: "Lufga"` no `@theme`

### Paleta de Cores Primária (CSS Variables via @theme)

```css
--color-solar-flame: #ff7f00;    /* Laranja primário — COR PRINCIPAL */
--color-black-onyx: #1a1a1a;     /* Preto para textos */
--color-white-quartz: #ffffff;   /* Branco */
```

### Cores Frequentes no Código

| Uso | Cor | Tailwind |
|---|---|---|
| Background da app | `#f8f9fa` | `bg-[#f8f9fa]` |
| Botão primário | `#ff7f00` | `bg-[#ff7f00]` |
| Botão hover | `orange-600` | `hover:bg-orange-600` |
| Texto principal | `gray-900` | `text-gray-900` |
| Texto secundário | `gray-500` / `gray-400` | `text-gray-500` |
| Bordas | `gray-200` | `border-gray-200` |
| Backgrounds de cards | `white` | `bg-white` |
| Highlight/active | `orange-50` | `bg-orange-50 text-[#ff7f00]` |
| Erro/Perigo | `red-600` | `text-red-600`, `bg-red-50` |

### Padrões de UI Críticos

1. **Tipografia**: Tudo **uppercase + font-bold + tracking-wider** em labels, botões, títulos
2. **Labels de seções**: `text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]`
3. **Botões**: `rounded-none` para botões de ação, `rounded-lg` ou `rounded-xl` para cards/containers
4. **Modais**: Sempre com backdrop `bg-gray-900/50 backdrop-blur-sm`, container `rounded-xl`, animação `motion` com `scale: 0.95 → 1`
5. **Sidebar ativa**: `bg-orange-50 text-[#ff7f00]` no link ativo
6. **Cards**: `bg-white border border-gray-200 rounded-xl` com hover `hover:border-[#ff7f00]`
7. **Loading spinner**: `border-4 border-[#ff7f00] border-t-transparent rounded-full animate-spin`

### Layout Padrão de Páginas

Toda página de ferramenta segue este padrão:
```tsx
<div className="min-h-screen bg-[#f8f9fa] text-gray-900 flex h-screen">
  <Sidebar projectId={projectId} projectName={project.name} onOpenSettings={...} />
  <div className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
    <header className="border-b border-gray-200 bg-white p-4 flex items-center justify-between shrink-0">
      {/* Foto do projeto + Nome + ShortID + Avatares dos membros + Badge de membros */}
    </header>
    <main className="flex-1 overflow-y-auto">
      {/* Conteúdo da ferramenta */}
    </main>
  </div>
</div>
```

### Header Padrão (copie este padrão em novas páginas)

```tsx
<header className="border-b border-gray-200 bg-white p-4 flex items-center justify-between shrink-0">
  <div className="flex items-center gap-4 min-w-0">
    {/* Ícone/foto do projeto */}
    <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center overflow-hidden border border-gray-100 shrink-0">
      {project.photoURL ? (
        <img src={project.photoURL} alt={project.name} className="w-full h-full object-cover" />
      ) : (
        <span className="text-xl">🏎️</span>
      )}
    </div>
    {/* Nome + ID */}
    <div className="min-w-0">
      <h2 className="text-xl font-bold tracking-wider leading-tight text-gray-900 truncate">
        {project.name} - #{project.shortId || '---'}
      </h2>
    </div>
    {/* Avatares de membros */}
    <div className="flex items-center ml-4 shrink-0">
      <div className="flex -space-x-2 mr-3">
        {projectMembers.map((member) => (
          <div key={member.uid} className="relative inline-block" title={member?.name}>
            {member?.photoURL ? (
              <img src={member.photoURL} alt={member.name} className="w-8 h-8 rounded-full border-2 border-white object-cover" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">
                {member?.name?.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        ))}
      </div>
      <span className="text-xs font-bold text-gray-400 uppercase tracking-widest bg-gray-50 px-2 py-1 border border-gray-200 rounded-md">
        {project.members.length} {project.members.length === 1 ? 'MEMBRO' : 'MEMBROS'}
      </span>
    </div>
  </div>
</header>
```

---

## 🔥 Firebase / Firestore

### Configuração

O SDK é inicializado em `src/firebase.ts` com config de `firebase-applet-config.json`.
- **Database ID**: `ai-studio-f3c49800-953a-4256-9966-e5f505300c6d` (não é `(default)`)
- Exporta: `db` (Firestore), `auth` (Auth), `storage` (Storage)

### Coleções Firestore (TODAS top-level)

| Coleção | Descrição | Tipo TS |
|---|---|---|
| `users` | Perfis de usuário | `UserProfile` |
| `projects` | Projetos (com `members[]` e `shortId`) | `Project` |
| `boards` | Colunas do Kanban | `Board` |
| `tasks` | Tarefas do Kanban | `Task` |
| `quadros` | Whiteboard data (nós + arestas) | `Quadro` |
| `projectTags` | Tags de cor para tarefas | `ProjectTag` |
| `inventory` | Itens de inventário | `InventoryItem` |
| `assetFolders` | Pastas de assets | `AssetFolder` |
| `assetLinks` | Links dentro de pastas | `AssetLink` |
| `raciMatrices` | Matrizes RACI | `RACIMatrix` |
| `raciTasks` | Tarefas dentro de uma matriz | `RACITask` |
| `raciStakeholders` | Stakeholders da matriz | `RACIStakeholder` |
| `raciAssignments` | Atribuições R/A/C/I | `RACIAssignment` |
| `ganttTasks` | Tarefas do Gantt | `GanttTask` |
| `projectStakeholders` | Stakeholders do projeto (Gantt/RACI) | `ProjectStakeholder` |
| `transactions` | Transações financeiras | `Transaction` |
| `budgets` | Orçamentos | `Budget` |
| `decisionMatrices` | Matrizes de decisão ponderada | `DecisionMatrix` |

### Patterns de Segurança

Todas as regras estão em `firestore.rules`. Padrões:
- **Leitura**: `isProjectMember(resource.data.projectId)` — só membros lêem
- **Criação**: `isProjectMember(request.resource.data.projectId) && isValid*(request.resource.data)`
- **Update**: Mesma verificação + `areImmutableFieldsUnchanged([...])` para proteger campos fixos
- **Delete**: Geralmente `isProjectMember` ou `isProjectOwner`
- **Admin override**: `isAdmin()` em RACI, Gantt, Finance e Stakeholders

### ⚠️ Campos Imutáveis por Coleção

Cada coleção protege certos campos contra alteração:
- `projects`: `ownerId`, `createdAt`, `shortId`
- `boards`: `projectId`, `ownerId`, `createdAt`
- `tasks`: `projectId`, `ownerId`, `createdAt`
- Padrão geral: `projectId` e `createdAt` NUNCA mudam após criação

### Padrão de Fetch com onSnapshot

Cada componente de ferramenta segue esse padrão:
```tsx
// 1. Fetch projeto (validar membership)
useEffect(() => {
  const projectRef = doc(db, 'projects', projectId);
  return onSnapshot(projectRef, (docSnap) => {
    if (!data.members.includes(user.uid)) navigate('/dashboard');
    setProject({ id: docSnap.id, ...data });
  });
}, [projectId, user, navigate]);

// 2. Fetch membros (independente, evita listener leaks)
useEffect(() => {
  if (!project?.members?.length) return;
  const qMembers = query(collection(db, 'users'),
    where(documentId(), 'in', project.members.slice(0, 30)));
  return onSnapshot(qMembers, (snapshot) => { ... });
}, [project?.members?.join(',')]);

// 3. Fetch dados da ferramenta
useEffect(() => {
  const q = query(collection(db, 'collectionName'),
    where('projectId', '==', projectId));
  return onSnapshot(q, (snapshot) => { ... });
}, [projectId]);
```

**IMPORTANTE**: O `where(documentId(), 'in', ...)` tem limite de 30 itens no Firestore.

### Padrão de Erro

```tsx
import { handleFirestoreError, OperationType } from '../utils/errorHandlers';

try {
  await addDoc(collection(db, 'tasks'), { ... });
} catch (error) {
  handleFirestoreError(error, OperationType.CREATE, 'tasks');
}
```

`handleFirestoreError` loga JSON com auth info e re-throws. O `ErrorBoundary` captura e exibe.

---

## 📦 Integrações Externas

### Cloudinary (Upload de Imagens)

Usado em `UserProfileModal.tsx` e `ProjectSettingsModal.tsx`:
```typescript
const CLOUDINARY_CLOUD_NAME = 'drmgydsjc';
const CLOUDINARY_UPLOAD_PRESET = 'cirzsuhz';

// Upload via fetch POST para:
// https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload
```

### Gemini API

Configurado via `process.env.GEMINI_API_KEY` no `vite.config.ts`.
Pacote `@google/genai` instalado mas seu uso atual é limitado.

---

## 🧩 Componentes — Detalhes

### Sidebar.tsx

- Aceita props: `projectId?`, `projectName?`, `onOpenSettings?`
- Sem `projectId`: mostra apenas link "PROJETOS"
- Com `projectId`: mostra "VOLTAR", "DASHBOARD", separator, "FERRAMENTAS" (label), e todos os links de ferramentas
- **Ferramentas na sidebar**: KANBAN, QUADRO, CALENDÁRIO, INVENTÁRIO, ATIVOS, MATRIZ RACI, GANTT, FINANCEIRO
- Se `onOpenSettings` é fornecido: mostra seção "CONFIGURAÇÕES" com botão "PERSONALIZAR"
- **Collapse**: Botão circular no canto direito, estado persistido em `localStorage` via `SidebarContext`
- **Perfil**: Clique no avatar abre `UserProfileModal`
- **Logout**: Botão "SAIR" redireciona para `/`

### ProjectDashboard.tsx

- Rota: `/project/:projectId`
- **Landing page do projeto** com métricas resumidas
- Cards no topo: "Tarefas a fazer" e "Concluídas (7 dias)"
- **Heurística de conclusão**: Com 2+ colunas Kanban, a última (por `order`) é "feito"; com 1 coluna, todas contam como "a fazer"
- **Concluídas 7 dias**: Tarefas com `dueDate` nos últimos 7 dias (janela até agora), independente da coluna
- Cards placeholder vazios (reservados para futuras features)
- Grid de cards maiores placeholder (2 grandes em baixo)

### ProjectBoard.tsx (Kanban)

- Drag & Drop de colunas e tarefas entre colunas
- CRUD de boards (colunas) e tasks
- Renomeação inline de boards
- Auto-open task se `?taskId=xxx` na URL
- Tags coloridas do `projectTags`
- Batched writes para reordenação

### RACIMatrix.tsx

- Navegação por breadcrumbs (INÍCIO → MATRIZ)
- CRUD de matrizes, tarefas, stakeholders
- Assign R/A/C/I por clique (modal com seleção)
- IDs determinísticos para assignments: `${matrixId}_${taskId}_${participantId}`
- Cleanup de IDs legados (random) em background
- Suporte a membros da equipe + stakeholders externos
- **Cores RACI**: R, A = padrão; C = branco; I = preto (ajustado por pedido do usuário)
- Botões de delete para membros E stakeholders externos (ambos)

### GanttChart.tsx

- Timeline customizada com zoom (scroll wheel para zoom)
- Seções agrupáveis (por `section` field)
- Categorias: MILESTONE, HIGH RISK, GOAL, MEDIUM RISK, CLOSING, EXECUTION, INITIATION, PLANNING
- Start date configurável por projeto (`ganttStartDate` no doc do projeto)
- Sidebar resizável com tabela de dados
- Stakeholders unificados com RACI (busca de `projectStakeholders` E `raciStakeholders`)

### ProjectFinance.tsx

- 4 tabs: Dashboard, Transações, Orçamento, Matriz de Decisão
- Dashboard com 4 KPI cards (Saldo, Orçamento, Despesas do Mês, Entradas do Mês) + card Saída Interna × Externa (`finance/OutflowComparisonCard.tsx`)
- PieChart de despesas por categoria (clicável para filtrar)
- LineChart de fluxo de caixa cumulativo com 3 linhas: Entrada de capital, Saída de capital interno (despesas sem `isExternal`) e Saída de capital externo (`isExternal`) — cálculo em `utils/financeMetrics.ts`
- **Matriz de Decisão** (`src/components/finance/`): compara 2 produtos (Shopee via `/api/shopee-product` ou outra loja via link + dados manuais) com critérios ponderados (Weighted Sum Model, notas 0–10, pesos normalizados a 100%); matemática pura em `decisionMatrixHelpers.ts`; salvo em `decisionMatrices`
- **`/api/shopee-product`** (Vercel function): proxy assinado da Shopee Affiliate Open API, exige `Authorization: Bearer <Firebase ID token>`; credenciais `SHOPEE_APP_ID`/`SHOPEE_APP_SECRET` só no servidor. Em `npm run dev` é servido pelo plugin `devApiPlugin` do `vite.config.ts` (somente essa rota)
- CRUD de transações (income/expense) com link opcional para budget
- Upload de nota fiscal via Cloudinary
- Auto-criação de item no inventário ao registrar despesa (toggle)
- **Exportação PDF**: Captura DOM via `html-to-image` → `jsPDF` (landscape 1920x1080)
- Moeda: BRL (formatCurrency com Intl.NumberFormat)

---

## 📐 Tipos TypeScript (src/types.ts)

Todos os tipos/interfaces estão centralizados em `src/types.ts`. Nunca defina types inline nos componentes — importe de lá.

Tipos principais:
- `UserProfile` (uid, name, email, photoURL, role)
- `Project` (id, name, description, photoURL, ownerId, shortId, members[], ganttStartDate)
- `Board` (id, projectId, name, order, color, ownerId)
- `Task` (id, projectId, boardId, title, description, assignedTo, order, color, tags[], dueDate, startDate)
- `InventoryItem`, `ProjectTag`, `AssetFolder`, `AssetLink`
- `RACIMatrix`, `RACITask`, `RACIStakeholder`, `RACIAssignment`, `RACIRole`
- `GanttTask` (com section, category, dependencies, status enum, progress 0-100)
- `ProjectStakeholder`
- `Transaction` (income/expense), `Budget`

### ⚠️ Cuidado com `assignedTo`

No tipo `Task`, `assignedTo` pode ser `string` (legado) ou `string[]` (novo). Sempre trate:
```tsx
const assignees = Array.isArray(task.assignedTo) ? task.assignedTo : [task.assignedTo];
```

### Timestamps

Todos os campos `createdAt`, `updatedAt`, `dueDate`, `startDate` etc. são Firestore Timestamps.
Para converter: `task.dueDate?.toDate()` ou `new Date(task.startDate.seconds * 1000)`.

---

## 🐛 Bugs Resolvidos & Decisões Arquiteturais

### Problemas Comuns & Soluções

1. **Import do Motion**: Usar `from 'motion/react'` e NÃO `from 'framer-motion'`. O pacote é `motion` (não `framer-motion`).

2. **Firestore `in` query limit**: Máximo 30 elementos no `where(documentId(), 'in', ...)`. Já está slice(0, 30) em todos os componentes.

3. **RACI assignments duplicados**: IDs determinísticos (`${matrixId}_${taskId}_${participantId}`) foram implementados para evitar duplicatas. Cleanup de IDs legados roda em background.

4. **Modal de delete no RACI não fechava**: Corrigido para fechar automaticamente após exclusão (setItemToDelete(null) antes do try/catch).

5. **Deleção de membros da equipe no RACI**: Implementada mesma funcionalidade que stakeholders externos — ambos podem ser deletados.

6. **Botão de edição de stakeholder no RACI**: Aparece apenas para stakeholders externos (membros da equipe são gerenciados via projeto).

7. **Cores RACI**: Consultado (C) = branco, Informado (I) = preto — alterado por pedido do usuário para melhor contraste.

8. **Consistência de modais**: Todos os modais devem ter backgrounds `rounded-xl`, apenas botões de ação têm `rounded-none`.

9. **Sidebar collapse**: Estado persistido em `localStorage` via `SidebarContext`. Funciona entre recarregamentos.

10. **ErrorBoundary**: Tenta parsear a mensagem de erro como JSON (formato do `handleFirestoreError`) para exibir info de permissão Firestore.

### Decisões de Arquitetura

- **Coleções top-level** (não subcoleções): Facilita queries cross-project e simplifica security rules
- **onSnapshot** em vez de `getDocs`: Dados em tempo real para colaboração
- **Cloudinary client-side**: Upload direto sem backend — usa upload_preset público
- **Sem backend próprio**: Tudo via Firebase SDK client-side + Firestore rules para segurança
- **TailwindCSS v4**: Usa `@theme` block em CSS (não `tailwind.config.js`). Plugin via `@tailwindcss/vite`
- **shortId de 8 chars**: Gerado com `Math.random().toString(36).substring(2, 10).toUpperCase()` para compartilhamento de projetos

---

## 📝 Convenções de Código

1. **Linguagem da UI**: Português brasileiro (labels, botões, mensagens, tooltips)
2. **Nomes de componentes**: PascalCase em inglês (ProjectBoard, TaskDetailsModal)
3. **CSS**: 100% Tailwind utility classes inline. Zero CSS modules/styled-components
4. **Imports de ícones**: Sempre de `lucide-react`
5. **Timestamps**: Sempre `serverTimestamp()` no Firestore para `createdAt`/`updatedAt`
6. **Novos campos**: SEMPRE adicionar nas Firestore Rules (validators) e em `types.ts`
7. **Modais**: Wrapper com `AnimatePresence` + `motion.div` com `initial/animate/exit`
8. **Error handling**: Usar `handleFirestoreError` de `utils/errorHandlers.ts`
9. **Batch operations**: Usar `writeBatch(db)` para operações que afetam múltiplos documentos
10. **Novo link na sidebar**: Adicionar em `Sidebar.tsx` no bloco de ferramentas + nova rota em `App.tsx`

---

## 🚀 Checklist para Adicionar Nova Ferramenta

1. Criar tipo em `src/types.ts`
2. Criar regra de validação em `firestore.rules` (função `isValid*`)
3. Criar regra de acesso em `firestore.rules` (match block com read/create/update/delete)
4. Criar componente em `src/components/NomeDaFerramenta.tsx`
5. Adicionar rota em `src/App.tsx` (dentro de `PrivateRoute`)
6. Adicionar link na `Sidebar.tsx` (seção FERRAMENTAS, entre os outros links)
7. Usar o layout padrão (Sidebar + Header + Main)
8. Usar `onSnapshot` para dados em tempo real
9. Usar `handleFirestoreError` para tratamento de erros

---

## 🔐 Admin

O admin do sistema é identificado por email `vhfgustavo@gmail.com` (verificado) OU `role: 'admin'` no documento do usuário. Admins têm acesso especial em RACI, Gantt, Finance e Stakeholders.

---

## 📌 Pendências / Features Planejadas

- **Dashboard do projeto**: Cards placeholder no grid inferior reservados para futuras métricas (financeiro, progresso Gantt, etc.)
- **Dashboard inicial**: Estava sendo planejado um dashboard como página inicial do projeto, com botão na sidebar entre "VOLTAR" e "FERRAMENTAS"
- **Escalabilidade**: O projeto foi pensado para ser escalável — separação de concerns, tipos unificados, security rules completas

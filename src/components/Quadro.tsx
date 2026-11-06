import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import Sidebar from './Sidebar';
import MobileHeader from './MobileHeader';
import MobileBottomNav from './MobileBottomNav';
import MobileToolsDrawer from './MobileToolsDrawer';
import UserProfileModal from './UserProfileModal';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  BackgroundVariant,
  Panel,
  OnNodesChange,
  OnEdgesChange,
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow,
  ReactFlowProvider,
  SelectionMode,
  ConnectionMode
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Plus,
  Type,
  Palette,
  Trash2,
  MousePointer2,
  Square,
  Loader2,
  Settings
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import {
  doc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  setDoc,
  collection,
  query,
  where,
  getDocs
} from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../utils/errorHandlers';
import type { Quadro, Project, UserProfile } from '../types';
import { nodeTypes } from './QuadroCustomNodes';
import ProjectSettingsModal from './ProjectSettingsModal';
import { AnimatePresence } from 'motion/react';
import { useI18n } from '../i18n/LanguageContext';
import type { Messages } from '../i18n';

const COLORS = [
  { name: 'white', value: '#ffffff', text: '#1f2937', border: true },
  { name: 'orange', value: '#ff7f00', text: '#ffffff' },
  { name: 'blue', value: '#3b82f6', text: '#ffffff' },
  { name: 'green', value: '#10b981', text: '#ffffff' },
  { name: 'purple', value: '#8b5cf6', text: '#ffffff' },
  { name: 'red', value: '#ef4444', text: '#ffffff' },
  { name: 'yellow', value: '#f59e0b', text: '#ffffff' },
  { name: 'black', value: '#111827', text: '#ffffff' },
] satisfies { name: keyof Messages['common']['colors']; value: string; text: string; border?: boolean }[];

type Tool = 'pointer' | 'rectangle' | 'text';

function QuadroContent() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const { screenToFlowPosition } = useReactFlow();

  const [project, setProject] = useState<Project | null>(null);
  const [projectMembers, setProjectMembers] = useState<UserProfile[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(true);
  const [selectedColor, setSelectedColor] = useState(COLORS[1]);
  const [activeTool, setActiveTool] = useState<Tool>('pointer');

  // Fetch Project Data
  useEffect(() => {
    if (!projectId) return;

    const projectRef = doc(db, 'projects', projectId);
    const unsubscribe = onSnapshot(projectRef, async (docSnap) => {
      if (docSnap.exists()) {
        const projectData = { id: docSnap.id, ...docSnap.data() } as Project;
        setProject(projectData);

        // Fetch member profiles
        if (projectData.members && projectData.members.length > 0) {
          const usersRef = collection(db, 'users');
          const q = query(usersRef, where('uid', 'in', projectData.members));
          const usersSnap = await getDocs(q);
          const profiles = usersSnap.docs.map(d => d.data() as UserProfile);
          setProjectMembers(profiles);
        }
      }
    });

    return () => unsubscribe();
  }, [projectId]);

  const nodesRef = useRef<Node[]>(nodes);
  const edgesRef = useRef<Edge[]>(edges);

  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  const lastInteractionTime = useRef<number>(0);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sync with Firestore
  useEffect(() => {
    if (!projectId || !user) return;

    const quadroRef = doc(db, 'quadros', projectId);

    const unsubscribe = onSnapshot(quadroRef, (docSnap) => {
      const now = Date.now();
      if (now - lastInteractionTime.current < 2000) return;

      if (docSnap.exists()) {
        const data = docSnap.data() as Quadro;
        setNodes(data.nodes as any || []);
        setEdges(data.edges as any || []);
      } else {
        const initialQuadro = {
          projectId,
          name: 'Novo Mapa Mental',
          nodes: [],
          edges: [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          ownerId: user.uid
        };
        setDoc(quadroRef, initialQuadro).catch(err => setLoading(false));
      }
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `quadros/${projectId}`);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [projectId, user, setNodes, setEdges]);

  const updateQuadroInFirestore = useCallback(() => {
    if (!projectId) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        const quadroRef = doc(db, 'quadros', projectId);

        const nodesToSave = nodesRef.current.map(({ id, type, position, data, style }) => ({
          id, type, position, data: { label: data.label, color: data.color }, style
        }));

        const edgesToSave = edgesRef.current.map(({ id, source, target, style, type }) => ({
          id, source, target, animated: false, style, type: type || 'smoothstep'
        }));

        await updateDoc(quadroRef, {
          nodes: nodesToSave,
          edges: edgesToSave,
          updatedAt: serverTimestamp()
        });
      } catch (error) {
        console.error('Error updating quadro:', error);
      }
    }, 800); // 800ms debounce
  }, [projectId]);

  const handleInteraction = useCallback(() => {
    lastInteractionTime.current = Date.now();
  }, []);

  const onNodesChangeHandler: OnNodesChange = useCallback(
    (changes) => {
      handleInteraction();
      setNodes((nds) => {
        const updatedNodes = applyNodeChanges(changes, nds);
        updateQuadroInFirestore();
        return updatedNodes;
      });
    },
    [setNodes, updateQuadroInFirestore, handleInteraction]
  );

  const onEdgesChangeHandler: OnEdgesChange = useCallback(
    (changes) => {
      handleInteraction();
      setEdges((eds) => {
        const updatedEdges = applyEdgeChanges(changes, eds);
        updateQuadroInFirestore();
        return updatedEdges;
      });
    },
    [setEdges, updateQuadroInFirestore, handleInteraction]
  );

  const onConnect = useCallback(
    (params: Connection) => {
      handleInteraction();

      setEdges((eds) => {
        // Check if source or target handle already has a connection using the MUST RECENT state
        const edgeExists = eds.some(
          (edge) =>
            (edge.source === params.source && edge.sourceHandle === params.sourceHandle) ||
            (edge.target === params.target && edge.targetHandle === params.targetHandle)
        );

        if (edgeExists) return eds;

        const newEdge = {
          ...params,
          id: `e-${Date.now()}`,
          animated: false,
          type: 'smoothstep',
          style: { stroke: '#000000', strokeWidth: 2, strokeDasharray: '5,5' },
          projectId,
          createdBy: user?.uid,
          createdAt: new Date().toISOString()
        };

        const updatedEdges = addEdge(newEdge, eds);
        updateQuadroInFirestore();
        return updatedEdges;
      });
    },
    [projectId, user, updateQuadroInFirestore, handleInteraction, setEdges]
  );

  const handleLabelChange = useCallback((id: string, newLabel: string) => {
    handleInteraction();
    setNodes((nds) => {
      const updatedNodes = nds.map((node) => {
        if (node.id === id) {
          return { ...node, data: { ...node.data, label: newLabel } };
        }
        return node;
      });
      updateQuadroInFirestore();
      return updatedNodes;
    });
  }, [setNodes, updateQuadroInFirestore, handleInteraction]);

  // Inject handleLabelChange into node data
  const nodesWithCallbacks = useMemo(() =>
    nodes.map(n => ({
      ...n,
      data: {
        ...n.data,
        onLabelChange: handleLabelChange,
        onInteraction: handleInteraction
      }
    }))
    , [nodes, handleLabelChange, handleInteraction]);

  const onPaneClick = useCallback((event: React.MouseEvent) => {
    if (activeTool === 'pointer' || !user || !projectId) return;

    lastInteractionTime.current = Date.now();
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const id = `${activeTool}-${Date.now()}`;

    const newNode: Node = {
      id,
      type: activeTool,
      position,
      data: {
        label: activeTool === 'text' ? t.quadro.newText : t.quadro.newTopic,
        color: selectedColor.value
      },
      style: activeTool === 'rectangle' ? { width: 150, height: 100 } : undefined,
    };

    setNodes((nds) => {
      const updatedNodes = nds.concat(newNode);
      updateQuadroInFirestore();
      return updatedNodes;
    });

    // Auto reset to pointer tool
    setActiveTool('pointer');

    // Reset loop tool if desired, or keep it. Let's keep it for multiple adds.
  }, [activeTool, screenToFlowPosition, selectedColor, setNodes, edges, user, projectId, updateQuadroInFirestore, t]);

  const changeSelectedColor = useCallback((color: typeof COLORS[0]) => {
    lastInteractionTime.current = Date.now();
    setSelectedColor(color);
    const selectedNodeIds = nodes.filter(n => n.selected).map(n => n.id);
    const selectedEdgeIds = edges.filter(e => e.selected).map(e => e.id);

    if (selectedNodeIds.length === 0 && selectedEdgeIds.length === 0) return;

    setNodes((nds) => {
      const updatedNodes = nds.map(n => n.selected ? { ...n, data: { ...n.data, color: color.value } } : n);
      updateQuadroInFirestore();
      return updatedNodes;
    });

    setEdges((eds) => {
      const updatedEdges = eds.map(e => e.selected ? { ...e, style: { ...e.style, stroke: color.value } } : e);
      updateQuadroInFirestore();
      return updatedEdges;
    });
  }, [nodes, edges, setNodes, setEdges, updateQuadroInFirestore]);

  const deleteSelected = useCallback(() => {
    lastInteractionTime.current = Date.now();
    const selectedNodeIds = nodes.filter(n => n.selected).map(n => n.id);
    const selectedEdgeIds = edges.filter(e => e.selected).map(e => e.id);

    if (selectedNodeIds.length === 0 && selectedEdgeIds.length === 0) return;

    setNodes((nds) => {
      const updatedNodes = nds.filter(n => !n.selected);
      setEdges((eds) => {
        const updatedEdges = eds.filter(e => !e.selected && !selectedNodeIds.includes(e.source) && !selectedNodeIds.includes(e.target));
        updateQuadroInFirestore();
        return updatedEdges;
      });
      return updatedNodes;
    });
  }, [nodes, edges, setNodes, setEdges, updateQuadroInFirestore]);

  if (loading || !project) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#ff7f00] animate-spin" />
      </div>
    );
  }

  const isOwner = project.ownerId === user?.uid;

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-gray-900 flex h-screen overflow-hidden">
      <Sidebar
        projectId={projectId}
        onOpenSettings={isOwner ? () => setIsSettingsOpen(true) : undefined}
      />

      <MobileToolsDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        projectId={projectId!}
        projectName={project?.name}
        onOpenSettings={isOwner ? () => setIsSettingsOpen(true) : undefined}
      />

      <main className="flex-1 bg-white relative flex flex-col overflow-hidden">
        <MobileHeader
          projectName={project?.name}
          projectPhotoURL={project?.photoURL || undefined}
          onOpenDrawer={() => setIsDrawerOpen(true)}
        />

        <header className="hidden lg:flex border-b border-gray-200 bg-white p-4 items-center justify-between shrink-0 z-20">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center overflow-hidden border border-gray-100 shrink-0">
              {project?.photoURL ? (
                <img src={project.photoURL} alt={project.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-xl">🏎️</span>
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-wider uppercase leading-tight text-gray-900">
                {project.name} - #{project.shortId || '---'}
              </h2>
            </div>

            <div className="flex items-center ml-4">
              <div className="flex -space-x-2 mr-3">
                {projectMembers.map((member) => (
                  <div key={member.uid} className="relative inline-block" title={member.name}>
                    {member.photoURL ? (
                      <img
                        src={member.photoURL}
                        alt={member.name}
                        className="w-8 h-8 rounded-full border-2 border-white object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full border-2 border-white bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600 uppercase">
                        {member.name.charAt(0)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <span className="text-xs font-bold text-gray-400 uppercase tracking-widest bg-gray-50 px-2 py-1 border border-gray-200 rounded-md">
                {project.members.length} {t.common.membersTitle(project.members.length)}
              </span>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-hidden relative">
          <ReactFlow
            nodes={nodesWithCallbacks}
            edges={edges}
            onNodesChange={onNodesChangeHandler}
            onEdgesChange={onEdgesChangeHandler}
            onConnect={onConnect}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            fitView
            snapToGrid
            snapGrid={[8, 8]}
            className="bg-[#f8f9fa]"
            selectionMode={SelectionMode.Partial}
            deleteKeyCode={['Backspace', 'Delete']}
            zoomOnDoubleClick={false}
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{
              type: 'smoothstep',
              animated: false,
              style: { stroke: '#000000', strokeWidth: 2, strokeDasharray: '5,5' }
            }}
            connectionMode={ConnectionMode.Loose}
            connectOnClick={false}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e5e7eb" />
            <Controls className="bg-white border border-gray-200 shadow-xl rounded-xl overflow-hidden" />

            {/* Toolbar Lateral Integrada (Cores + Ferramentas) */}
            <Panel position="top-left" className="ml-4 mt-4 pointer-events-auto flex flex-col gap-4 z-10">
              {/* Cores */}
              <div className="bg-white border border-gray-200 p-2 rounded-2xl shadow-xl flex flex-col gap-2">
                <div className="p-2 border-b border-gray-100 mb-1 flex items-center justify-center">
                  <Palette className="w-4 h-4 text-gray-400" />
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {COLORS.map((color) => (
                    <button
                      key={color.value}
                      onClick={() => changeSelectedColor(color)}
                      className={clsx(
                        "w-7 h-7 rounded-lg transition-all relative overflow-hidden",
                        selectedColor.value === color.value ? "ring-2 ring-black scale-110" : "hover:scale-105",
                        color.border && "border border-gray-200"
                      )}
                      style={{ backgroundColor: color.value }}
                      title={t.common.colors[color.name]}
                    />
                  ))}
                </div>
              </div>

              {/* Ferramentas */}
              <div className="bg-white border border-gray-200 p-1 rounded-2xl shadow-xl flex flex-col gap-2">
                <button
                  onClick={() => setActiveTool('pointer')}
                  className={clsx(
                    "p-3 rounded-xl transition-all",
                    activeTool === 'pointer' ? "bg-orange-50 text-[#ff7f00]" : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                  )}
                  title={t.quadro.select}
                >
                  <MousePointer2 className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setActiveTool('rectangle')}
                  className={clsx(
                    "p-3 rounded-xl transition-all",
                    activeTool === 'rectangle' ? "bg-orange-50 text-[#ff7f00]" : "text-gray-400 hover:text-gray-600 hover:bg-gray-50"
                  )}
                  title={t.quadro.rectangle}
                >
                  <Square className="w-5 h-5" />
                </button>

                <div className="h-[1px] bg-gray-100 mx-2 my-1" />

                <button
                  onClick={deleteSelected}
                  className="p-3 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                  title={t.quadro.deleteSelected}
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </Panel>
          </ReactFlow>
        </div>

        {project && isSettingsOpen && (
          <ProjectSettingsModal
            project={project}
            onClose={() => setIsSettingsOpen(false)}
          />
        )}
      </main>

      <MobileBottomNav onOpenProfile={() => setIsProfileOpen(true)} />

      <AnimatePresence>
        {isProfileOpen && (
          <UserProfileModal onClose={() => setIsProfileOpen(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Quadro() {
  return (
    <ReactFlowProvider>
      <QuadroContent />
    </ReactFlowProvider>
  );
}

function clsx(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}


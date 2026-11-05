import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import { doc, setDoc, serverTimestamp, onSnapshot, collection, query, orderBy, getDocs, where } from 'firebase/firestore';
import { db } from '../firebase';
import { commitWrite, friendlyWriteError } from '../utils/firestoreWrite';
import { AssetDocument } from '../types';
import { useSidebar } from '../contexts/SidebarContext';
import { Image } from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { Node, mergeAttributes } from '@tiptap/core';
import ImageResize from 'tiptap-extension-resize-image';
import { TextAlign } from '@tiptap/extension-text-align';
import imageCompression from 'browser-image-compression';
import CalendarEventExtension from '../extensions/CalendarEventExtension';
import { extractSyncEvents } from '../utils/extractEvents';
import { 
  ArrowLeft, 
  Cloud, 
  CloudOff, 
  Loader2, 
  Bold, 
  Italic, 
  Strikethrough,
  List, 
  ListOrdered, 
  Quote, 
  Minus, 
  Undo2, 
  Redo2,
  Code,
  Heading1,
  Heading2,
  Heading3,
  FileText,
  Type,
  AlignJustify,
  ListTodo,
  Table as TableIcon,
  ImagePlus,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Tag as TagIcon,
  X,
  CalendarDays,
  Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { jsPDF } from 'jspdf';
import { toPng } from 'html-to-image';
// @ts-ignore
import logoIbit from '../media/ibitlogo.svg';
import clsx from 'clsx';
import { ProjectTag } from '../types';
import { TAG_COLORS } from './TaskDetailsModal';
import ExportButton from './export/ExportButton';
import { buildOfficialFooterHTML, PdfExportOptions, pixelRatioFromDpi } from '../utils/export/pdfEngine';
import { exportToWord } from '../utils/export/wordEngine';
import { tiptapJsonToWordSections } from '../utils/export/tiptapToWord';

// --- Custom Tag Extension ---
const TagNode = Node.create({
  name: 'tagNode',
  group: 'inline',
  inline: true,
  selectable: true,
  atom: true,
  
  addAttributes() {
    return {
      label: { default: '' },
      color: { default: '#ff7f00' },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-tag-label]',
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const isHex = HTMLAttributes.color?.startsWith('#');
    return [
      'span',
      mergeAttributes({
        'data-type': 'tag',
        'data-tag-label': HTMLAttributes.label,
        class: clsx(
          "px-2 py-0.5 text-[10px] font-bold border rounded inline-flex items-center justify-center mx-1 whitespace-nowrap overflow-visible",
          !isHex ? HTMLAttributes.color : "text-white border-transparent"
        ),
        style: `white-space: nowrap !important; ${isHex ? `background-color: ${HTMLAttributes.color};` : ''}`,
      }),
      HTMLAttributes.label,
    ]
  },
});

// --- Save Status Types ---
type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

interface DocumentEditorProps {
  documentId: string;
  onClose: () => void;
}

export default function DocumentEditor({ documentId, onClose }: DocumentEditorProps) {
  const { isCollapsed } = useSidebar();
  const [title, setTitle] = useState('');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectTags, setProjectTags] = useState<ProjectTag[]>([]);
  const [showTagMenu, setShowTagMenu] = useState(false);
  const [isAddingTag, setIsAddingTag] = useState(false);
  const [newTagLabel, setNewTagLabel] = useState('');
  const [selectedTagColor, setSelectedTagColor] = useState(TAG_COLORS[0].color);
  const tagButtonRef = useRef<HTMLDivElement>(null);
  const [tagMenuPos, setTagMenuPos] = useState({ top: 0, left: 0 });

  // Styling settings
  const [lineHeight, setLineHeight] = useState(1);
  const [letterSpacing, setLetterSpacing] = useState(0);

  // Refs to avoid stale closures
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleRef = useRef(title);
  const isMountedRef = useRef(true);
  const saveSeqRef = useRef(0);
  const isInitialLoadRef = useRef(true);
  const titleTextareaRef = useRef<HTMLTextAreaElement>(null);
  const saveStatusRef = useRef<SaveStatus>('saved');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);

    try {
      const options = {
        maxSizeMB: 0.6,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
        fileType: 'image/jpeg',
      };
      
      const uniqueFileName = `img-${Date.now()}-${Math.random().toString(36).substring(2, 9)}.jpg`;
      const compressedFile = await imageCompression(file, options);
      const renamedFile = new File([compressedFile], uniqueFileName, { type: 'image/jpeg' });
      
      const formData = new FormData();
      formData.append('file', renamedFile);
      formData.append('upload_preset', 'cirzsuhz'); // CLOUDINARY_UPLOAD_PRESET

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/drmgydsjc/image/upload`, // CLOUDINARY_CLOUD_NAME
        {
          method: 'POST',
          body: formData,
        }
      );

      const data = await response.json();

      if (response.ok) {
        editor?.chain().focus().setImage({ src: data.secure_url }).run();
      } else {
        throw new Error(data.error?.message || 'Erro ao fazer upload da imagem.');
      }
    } catch (error: any) {
      console.error('[DocumentEditor] Image upload failed:', error);
      setErrorMsg('Erro ao carregar imagem.');
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleExportJSON = () => {
    if (!editor) return;
    try {
      const jsonContent = editor.getJSON();
      const exportData = {
        title,
        content: jsonContent,
        projectTags,
        createdAt: new Date().toISOString()
      };
      const dataStr = JSON.stringify(exportData, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.replace(/\s+/g, '-') || 'documento'}-${new Date().toISOString().substring(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('[JSON Export] Error:', err);
      setErrorMsg('Erro ao exportar JSON');
    }
  };

  const handleExportPDF = async (options: PdfExportOptions) => {
    if (isExporting || !editor) return;
    setIsExporting(true);

    const elementId = 'pdf-export-content';
    const original = document.getElementById(elementId);

    if (!original) {
      console.error('[PDF Export] Target element not found');
      setIsExporting(false);
      return;
    }

    // Clean up any stray footers from previous failed attempts
    document.querySelectorAll('[data-pdf-footer="true"]').forEach(el => el.remove());

    // Save original styles to restore later
    const originalOverflow = original.style.overflow;
    const originalWidth = original.style.width;
    const originalMaxWidth = original.style.maxWidth;

    // Also fix overflow on all table wrappers inside
    const tableWrappers = original.querySelectorAll('.tableWrapper');
    const originalTableOverflows: string[] = [];
    tableWrappers.forEach((tw, i) => {
      originalTableOverflows[i] = (tw as HTMLElement).style.overflow;
      (tw as HTMLElement).style.overflow = 'visible';
    });

    try {
      // Temporarily expand container so tables are fully visible
      original.style.overflow = 'visible';
      original.style.maxWidth = 'none';
      original.style.width = `${Math.max(original.scrollWidth, 900)}px`;

      // 1. Build footer (only when chrome is enabled). Documents already show
      // their own title inline in the editor content, so unlike other pages
      // this export skips the official title/subtitle header block — only
      // the export-date + IBIT logo footer metadata is added.
      const dateStr = new Date().toLocaleDateString('pt-BR');
      let footer: HTMLDivElement | null = null;
      if (options.chrome) {
        footer = document.createElement('div');
        footer.setAttribute('data-pdf-footer', 'true');
        footer.innerHTML = buildOfficialFooterHTML(logoIbit, `Documento exportado da plataforma IBIT em ${dateStr}`);
        original.appendChild(footer);
      }

      // Wait for layout to settle
      await new Promise(resolve => setTimeout(resolve, 300));

      // 2. Capture content as image
      const dataUrl = await toPng(original, {
        cacheBust: true,
        backgroundColor: '#ffffff',
        pixelRatio: pixelRatioFromDpi(options.dpi),
        filter: (node) => {
          if (node?.classList?.contains('ProseMirror-separator')) {
            return false;
          }
          return true;
        }
      });

      // 3. Generate PDF: physical page size (pt) derived from widthPx/heightPx at the chosen DPI
      const pdfWidth = (options.widthPx / options.dpi) * 72;
      const pdfHeight = (options.heightPx / options.dpi) * 72;
      const margin = options.chrome ? 40 : 0;

      const pdf = new jsPDF({
        orientation: pdfWidth >= pdfHeight ? 'landscape' : 'portrait',
        unit: 'pt',
        format: [pdfWidth, pdfHeight]
      });

      const availableWidth = pdfWidth - margin * 2;
      const availableHeight = pdfHeight - margin * 2;

      const imgProps = pdf.getImageProperties(dataUrl);
      const imgRatio = imgProps.height / imgProps.width;

      // Scale image to fit page width
      const drawWidth = availableWidth;
      const drawHeight = drawWidth * imgRatio;

      const xOffset = margin;

      let heightLeft = drawHeight;
      let position = margin;

      // Page 1
      pdf.setFillColor(255, 255, 255);
      pdf.rect(0, 0, pdfWidth, pdfHeight, 'F');
      pdf.addImage(dataUrl, 'PNG', xOffset, position, drawWidth, drawHeight);
      heightLeft -= availableHeight;

      // Additional pages for long documents
      while (heightLeft > 0) {
        position -= availableHeight;
        pdf.addPage();
        pdf.setFillColor(255, 255, 255);
        pdf.rect(0, 0, pdfWidth, pdfHeight, 'F');
        pdf.addImage(dataUrl, 'PNG', xOffset, position, drawWidth, drawHeight);
        heightLeft -= availableHeight;
      }

      const fileName = `${title.replace(/\s+/g, '-') || 'documento'}-${new Date().toISOString().substring(0, 10)}.pdf`;
      pdf.save(fileName);

    } catch (err) {
      console.error('[PDF Export] Error:', err);
      setErrorMsg('Erro ao exportar PDF');
      setTimeout(() => setErrorMsg(null), 3000);
    } finally {
      // Restore original styles
      original.style.overflow = originalOverflow;
      original.style.maxWidth = originalMaxWidth;
      original.style.width = originalWidth;
      tableWrappers.forEach((tw, i) => {
        (tw as HTMLElement).style.overflow = originalTableOverflows[i];
      });
      document.querySelectorAll('[data-pdf-footer="true"]').forEach(el => el.remove());
      setIsExporting(false);
    }
  };

  const handleExportWord = async () => {
    if (!editor) return;
    try {
      const docJson = editor.getJSON();
      const sections = tiptapJsonToWordSections(docJson as any);
      await exportToWord({
        filename: `${title.replace(/\s+/g, '-') || 'documento'}-${new Date().toISOString().substring(0, 10)}.docx`,
        title: title || 'Documento',
        subtitle: 'Documento exportado da plataforma IBIT',
        sections,
      });
    } catch (err) {
      console.error('[Word Export] Error:', err);
      setErrorMsg('Erro ao exportar Word');
      setTimeout(() => setErrorMsg(null), 3000);
    }
  };

  // Auto-resize title textarea (Robust version)
  const resizeTitle = useCallback(() => {
    if (titleTextareaRef.current) {
      titleTextareaRef.current.style.height = 'auto';
      // Add a generous buffer (10px) to absolutely guarantee no clipping of descenders
      titleTextareaRef.current.style.height = (titleTextareaRef.current.scrollHeight + 10) + 'px';
    }
  }, []);

  useEffect(() => {
    resizeTitle();
    window.addEventListener('resize', resizeTitle);
    
    // Fallback: trigger after a short delay in case web fonts load late and change wrapping
    const timeout = setTimeout(resizeTitle, 300);
    
    return () => {
      window.removeEventListener('resize', resizeTitle);
      clearTimeout(timeout);
    };
  }, [title, resizeTitle]);

  // Keep titleRef in sync
  useEffect(() => {
    titleRef.current = title;
  }, [title]);

  // State to hold content that needs saving
  const [debouncedContent, setDebouncedContent] = useState<Record<string, any> | null>(null);

  // Table context menu state
  const [tableMenuContext, setTableMenuContext] = useState<{ x: number, y: number } | null>(null);

  // Close context menu on global click/scroll
  useEffect(() => {
    const handleGlobalClick = () => setTableMenuContext(null);
    window.addEventListener('click', handleGlobalClick);
    window.addEventListener('scroll', handleGlobalClick, true);
    return () => {
      window.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('scroll', handleGlobalClick, true);
    };
  }, []);

  // Set mounted flag correctly
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // --- Standard React Debounced Auto-Save ---
  useEffect(() => {
    // Only attempt to save if we have content and it's not the initial load
    if (!debouncedContent || isInitialLoadRef.current) return;

    setSaveStatus('unsaved');
    setErrorMsg(null);

    const timer = setTimeout(async () => {
      if (!isMountedRef.current) return;
      
      // Só o salvamento mais recente pode atualizar o status (um antigo e lento não sobrescreve).
      const seq = ++saveSeqRef.current;
      setSaveStatus('saving');
      
      try {
        const docRef = doc(db, 'assetDocuments', documentId);
        console.log("[DocumentEditor] Saving to Firestore...", { documentId, title });

        // Extract sync events from the TipTap JSON before saving
        const syncEvents = extractSyncEvents(debouncedContent);

        await commitWrite(setDoc(docRef, {
          content: debouncedContent,
          title: title,
          syncEvents: syncEvents,
          updatedAt: serverTimestamp(),
        }, { merge: true }), {
          label: 'o documento',
          onLateError: (err) => {
            console.error('[DocumentEditor] Save FAILED (late):', err);
            if (isMountedRef.current && seq === saveSeqRef.current) {
              setSaveStatus('error');
              setErrorMsg(friendlyWriteError(err));
            }
          },
        });
        
        console.log("[DocumentEditor] Save successful!");
        if (isMountedRef.current && seq === saveSeqRef.current) {
          setSaveStatus('saved');
        }
      } catch (error: any) {
        console.error('[DocumentEditor] Save FAILED:', error);
        if (isMountedRef.current) {
          setSaveStatus('error');
          setErrorMsg(error.message || "Erro desconhecido.");
        }
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [debouncedContent, title, documentId]);

  // --- TipTap Editor Instance ---
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
      }),
      Image,
      ImageResize,
      TextAlign.configure({
        types: ['heading', 'paragraph', 'image', 'imageResize'],
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      TagNode,
      CalendarEventExtension,
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'prose prose-orange lg:prose-lg focus:outline-none max-w-none w-full min-h-[70vh]',
      },
      handleKeyDown: (view, event) => {
        const { state } = view;
        const { selection } = state;

        if (event.key === 'Backspace' || event.key === 'Delete') {

          // If the selection is a NodeSelection on an image, it is explicitly selected (resize mode active)
          // We allow the deletion in this case.
          if (selection instanceof NodeSelection && (selection.node.type.name === 'image' || selection.node.type.name === 'imageResize')) {
            return false; // Let TipTap handle the deletion
          }

          // We want to prevent deleting an image if it's not the primary selection.
          // We check if the backspace/delete would target an image node.
          const { $from, $to } = selection;
          
          if (event.key === 'Backspace') {
            const { $from } = selection;
            const nodeBefore = $from.nodeBefore;
            
            // Case 1: Cursor is immediately after an image at the same level
            if (nodeBefore && (nodeBefore.type.name === 'image' || nodeBefore.type.name === 'imageResize')) {
              return true;
            }

            // Case 2: Cursor is at the start of a block (paragraph), and the previous sibling block is an image
            if ($from.parentOffset === 0) {
              const index = $from.index($from.depth - 1);
              if (index > 0) {
                const prevNode = $from.node($from.depth - 1).child(index - 1);
                if (prevNode.type.name === 'image' || prevNode.type.name === 'imageResize') {
                  return true;
                }
              }
            }
          } else if (event.key === 'Delete') {
            const { $to } = selection;
            const nodeAfter = $to.nodeAfter;
            if (nodeAfter && (nodeAfter.type.name === 'image' || nodeAfter.type.name === 'imageResize')) {
              return true;
            }

            // Also check next block if at end of current block
            if ($to.parentOffset === $to.parent.content.size) {
              const index = $to.index($to.depth - 1);
              const parentNode = $to.node($to.depth - 1);
              if (index < parentNode.childCount - 1) {
                const nextNode = parentNode.child(index + 1);
                if (nextNode.type.name === 'image' || nextNode.type.name === 'imageResize') {
                  return true;
                }
              }
            }
          }
        }

        if (event.key === 'Enter' && editor.isActive('taskItem')) {
          // Prevent TipTap from turning an empty checkbox into a paragraph on Enter
          // We force it to stay as a checkbox or create a new one
          const { selection } = state;
          const { $from } = selection;
          if ($from.parent.content.size === 0) {
            editor.chain().focus().splitListItem('taskItem').run();
            return true;
          }
        }
        return false;
      }
    },
    onUpdate: ({ editor }) => {
      // Don't trigger save during initial content load
      if (isInitialLoadRef.current) return;
      // Trigger save by updating debouncedContent state
      setDebouncedContent(editor.getJSON());
    },
    onSelectionUpdate: () => {
      // Forcing a re-render so editor.isActive() calls in the toolbar update
      setSaveStatus(prev => prev); 
    },
  });

  // Styling logic moved to a <style> block in render to prevent TipTap re-renders

  // --- Fetch Document from Firestore (realtime) ---
  useEffect(() => {
    if (!documentId) return;
    const docRef = doc(db, 'assetDocuments', documentId);
    
    const unsub = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const data = { id: snap.id, ...snap.data() } as AssetDocument;
        setProjectId(data.projectId);

        // Only set content on first load (don't overwrite user's typing)
        if (isInitialLoadRef.current && editor) {
          setTitle(data.title || 'Documento sem título');
          
          if (data.content && Object.keys(data.content).length > 0) {
            editor.commands.setContent(data.content);
          }
          
          setTimeout(() => {
            isInitialLoadRef.current = false;
          }, 100);
        }
      } else {
        onClose();
      }
      setLoading(false);
    }, (error) => {
      console.error("[DocumentEditor] Snapshot error:", error);
      setErrorMsg("Erro ao carregar documento.");
      setLoading(false);
    });

    return () => unsub();
  }, [documentId, editor]);

  // Fetch Tags when projectId is available
  useEffect(() => {
    if (!projectId) return;

    const fetchTags = async () => {
      console.log("[DocumentEditor] Fetching tags for projectId:", projectId);
      try {
        const qTags = query(
          collection(db, 'projectTags'), 
          where('projectId', '==', projectId),
          orderBy('createdAt', 'asc')
        );
        const snap = await getDocs(qTags);
        const tagsData: ProjectTag[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as ProjectTag));
        console.log("[DocumentEditor] Tags fetched:", tagsData.length);
        setProjectTags(tagsData);
      } catch (err) {
        console.error("[DocumentEditor] Error fetching tags:", err);
      }
    };

    fetchTags();
  }, [projectId]);

  const handleCreateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTagLabel.trim() || !projectId) return;

    try {
      const docRef = doc(collection(db, 'projectTags'));
      await commitWrite(setDoc(docRef, {
        projectId,
        label: newTagLabel.trim(),
        color: selectedTagColor,
        createdAt: serverTimestamp()
      }), { label: 'a tag' });
      
      const newTag: ProjectTag = {
        id: docRef.id,
        projectId,
        label: newTagLabel.trim(),
        color: selectedTagColor,
        createdAt: new Date()
      };
      
      setProjectTags(prev => [...prev, newTag]);
      setNewTagLabel('');
      setIsAddingTag(false);
    } catch (err) {
      console.error("[DocumentEditor] Error creating tag:", err);
    }
  };

  // --- Save title changes with debounce ---
  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    if (!isInitialLoadRef.current && editor) {
      setDebouncedContent(editor.getJSON());
    }
  };

  // Handle Enter on title to move focus to editor body
  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      editor?.commands.focus('start');
    }
  };

  // --- Alignment Handler ---
  const handleAlignment = (alignment: 'left' | 'center' | 'right') => {
    if (!editor) return;
    
    if (editor.isActive('imageResize')) {
      const attrs = editor.getAttributes('imageResize');
      let currentStyle = attrs.containerStyle || '';
      // Remove any existing margin declarations to reset alignment
      currentStyle = currentStyle.replace(/margin:\s*[^;]+;/g, '').trim();
      
      let newMargin = '';
      if (alignment === 'left') newMargin = 'margin: 0 auto 0 0;';
      else if (alignment === 'center') newMargin = 'margin: 0 auto;';
      else if (alignment === 'right') newMargin = 'margin: 0 0 0 auto;';
      
      editor.chain().focus().updateAttributes('imageResize', {
        containerStyle: `${currentStyle} ${newMargin}`.trim(),
        textAlign: alignment // Track alignment status
      }).run();
    } else {
      editor.chain().focus().setTextAlign(alignment).run();
    }
  };

  // --- Loading State ---
  if (loading || !editor) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-[#ff7f00] animate-spin" />
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Abrindo documento...</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      className={clsx(
        "fixed inset-0 z-40 bg-white flex flex-col overflow-hidden transition-all duration-300",
        isCollapsed ? "lg:left-20" : "lg:left-64"
      )}
    >
      {/* --- Top Bar --- */}
      <header className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-gray-100 shrink-0 bg-white/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500 hover:text-gray-900"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#ff7f00]" />
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest hidden sm:inline">
              Editando Ativo
            </span>
          </div>
        </div>

        {/* Save Status Indicator */}
        <div className="flex items-center gap-4">
          {errorMsg && (
            <span className="text-[9px] font-bold text-red-500 uppercase tracking-tighter bg-red-50 px-2 py-1 rounded">
              {errorMsg}
            </span>
          )}
          
          <div className="flex items-center gap-2">
            {saveStatus === 'saving' && !isUploadingImage && (
              <div className="flex items-center gap-1.5 text-gray-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Salvando...</span>
              </div>
            )}
            {isUploadingImage && (
              <div className="flex items-center gap-1.5 text-blue-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Carregando imagem...</span>
              </div>
            )}
            {saveStatus === 'saved' && (
              <div className="flex items-center gap-1.5 text-emerald-500">
                <Cloud className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Salvo</span>
              </div>
            )}
            {saveStatus === 'unsaved' && (
              <div className="flex items-center gap-1.5 text-orange-400">
                <Cloud className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Editando...</span>
              </div>
            )}
            {saveStatus === 'error' && (
              <div className="flex items-center gap-1.5 text-red-500">
                <CloudOff className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold uppercase tracking-widest">Erro</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* --- Toolbar --- */}
      <div className="flex items-center gap-1 px-4 sm:px-6 py-2 border-b border-gray-100 shrink-0 overflow-x-auto no-scrollbar bg-white shadow-sm z-10">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive('bold')}
          title="Negrito"
        >
          <Bold className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive('italic')}
          title="Itálico"
        >
          <Italic className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive('strike')}
          title="Tachado"
        >
          <Strikethrough className="w-4 h-4" />
        </ToolbarButton>

        <div className="w-px h-5 bg-gray-200 mx-1 shrink-0" />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          active={editor.isActive('heading', { level: 1 })}
          title="Título 1"
        >
          <Heading1 className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive('heading', { level: 2 })}
          title="Título 2"
        >
          <Heading2 className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor.isActive('heading', { level: 3 })}
          title="Título 3"
        >
          <Heading3 className="w-4 h-4" />
        </ToolbarButton>

        <div className="w-px h-5 bg-gray-200 mx-1 shrink-0" />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')}
          title="Lista"
        >
          <List className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive('orderedList')}
          title="Lista numerada"
        >
          <ListOrdered className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          active={editor.isActive('taskList')}
          title="Checklist"
        >
          <ListTodo className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive('blockquote')}
          title="Citação"
        >
          <Quote className="w-4 h-4" />
        </ToolbarButton>

        <div className="w-px h-5 bg-gray-200 mx-1 shrink-0" />

        <ToolbarButton
          onClick={() => handleAlignment('left')}
          active={editor.isActive({ textAlign: 'left' })}
          title="Alinhar à esquerda"
        >
          <AlignLeft className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => handleAlignment('center')}
          active={editor.isActive({ textAlign: 'center' })}
          title="Centralizar"
        >
          <AlignCenter className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => handleAlignment('right')}
          active={editor.isActive({ textAlign: 'right' })}
          title="Alinhar à direita"
        >
          <AlignRight className="w-4 h-4" />
        </ToolbarButton>

        <div className="w-px h-5 bg-gray-200 mx-1 shrink-0" />

        <ToolbarButton
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          title="Inserir Tabela"
        >
          <TableIcon className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => fileInputRef.current?.click()}
          title="Inserir Imagem"
        >
          <ImagePlus className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().insertCalendarEvent().run()}
          title="Inserir Evento de Calendário"
        >
          <CalendarDays className="w-4 h-4" />
        </ToolbarButton>

          <div className="relative" ref={tagButtonRef}>
            <ToolbarButton
              onClick={() => {
                if (tagButtonRef.current) {
                  const rect = tagButtonRef.current.getBoundingClientRect();
                  setTagMenuPos({ top: rect.bottom + 5, left: rect.left });
                }
                setShowTagMenu(!showTagMenu);
              }}
              active={showTagMenu}
              title="Adicionar Tag"
              disabled={editor.isActive('heading')}
            >
              <TagIcon className="w-4 h-4" />
            </ToolbarButton>

            {/* Tag Dropdown (Desktop) */}
            {showTagMenu && (
              <div 
                className="hidden lg:block fixed z-[9999] bg-white rounded-xl shadow-2xl border border-gray-100 py-1.5 w-72 animate-in fade-in slide-in-from-top-2"
                style={{ top: tagMenuPos.top, left: tagMenuPos.left }}
              >
              <div className="px-3 py-1.5 flex items-center justify-between border-b border-gray-50 mb-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Tags do Projeto</span>
                <button 
                  onClick={() => setIsAddingTag(!isAddingTag)}
                  className="text-[10px] font-bold text-[#ff7f00] hover:underline"
                >
                  {isAddingTag ? 'CANCELAR' : '+ NOVA'}
                </button>
              </div>

              {isAddingTag ? (
                <div className="p-3 space-y-3 bg-gray-50/50">
                  <input
                    type="text"
                    autoFocus
                    value={newTagLabel}
                    onChange={(e) => setNewTagLabel(e.target.value)}
                    placeholder="Nome da tag..."
                    className="w-full bg-white border border-gray-200 px-3 py-2 text-xs text-gray-900 focus:outline-none focus:border-[#ff7f00] rounded-lg shadow-sm"
                  />
                  <div className="flex flex-wrap gap-1.5 justify-center">
                    {TAG_COLORS.map(tc => (
                      <button
                        key={tc.id}
                        type="button"
                        onClick={() => setSelectedTagColor(tc.color)}
                        className={clsx(
                          "w-6 h-6 rounded-md border-2 transition-all",
                          selectedTagColor === tc.color ? "border-gray-900 scale-110" : "border-transparent"
                        )}
                      >
                        <div className={clsx("w-full h-full rounded-[3px]", tc.color.split(' ')[0])} />
                      </button>
                    ))}
                  </div>
                  <button 
                    onClick={handleCreateTag}
                    className="w-full bg-[#ff7f00] text-white py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg hover:bg-orange-600 transition-all shadow-md"
                  >
                    CRIAR TAG
                  </button>
                </div>
              ) : (
                <div className="max-h-60 overflow-y-auto no-scrollbar flex flex-wrap gap-2 p-3">
                  {projectTags.length === 0 ? (
                    <div className="w-full py-3 text-xs text-gray-400 text-center italic">
                      Nenhuma tag encontrada.
                    </div>
                  ) : (
                    projectTags.map(tag => (
                      <button
                        key={tag.id}
                        className="transition-transform hover:scale-105 active:scale-95"
                        onClick={() => {
                          editor.chain().focus().insertContent({
                            type: 'tagNode',
                            attrs: { label: tag.label, color: tag.color }
                          }).insertContent(' ').run();
                          setShowTagMenu(false);
                        }}
                      >
                        <span 
                          className={clsx(
                            "px-2.5 py-1 text-[10px] font-bold border rounded shadow-sm inline-block whitespace-nowrap",
                            (!tag.color || !tag.color.startsWith('#')) ? (tag.color || 'bg-gray-500 text-white') : 'text-white border-transparent'
                          )}
                          style={tag.color?.startsWith('#') ? { backgroundColor: tag.color } : {}}
                        >
                          {tag.label}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleImageUpload} 
          accept="image/*" 
          className="hidden" 
        />

        <div className="w-px h-5 bg-gray-200 mx-1 shrink-0" />

        {/* Custom Styles Controls */}
        <div className="flex items-center gap-3 px-3 py-1 bg-gray-50 rounded-xl border border-gray-200 ml-1">
           <div className="flex items-center gap-1.5" title="Espaçamento entre linhas (0 = padrão)">
              <AlignJustify className="w-3.5 h-3.5 text-gray-400" />
              <input 
                type="number" 
                step="0.1" 
                min="0" 
                max="3"
                value={lineHeight}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setLineHeight(isNaN(val) ? 0 : val);
                }}
                className="w-11 bg-transparent text-xs font-medium text-gray-700 focus:outline-none h-7 border-none p-0"
              />
           </div>
           <div className="w-px h-5 bg-gray-200 shrink-0" />
           <div className="flex items-center gap-1.5" title="Espaçamento entre letras">
              <Type className="w-3.5 h-3.5 text-gray-400" />
              <input 
                type="number" 
                step="0.5" 
                min="-2" 
                max="10"
                value={letterSpacing}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setLetterSpacing(isNaN(val) ? 0 : val);
                }}
                className="w-11 bg-transparent text-xs font-medium text-gray-700 focus:outline-none h-7 border-none p-0"
              />
           </div>
        </div>

        <div className="w-px h-5 bg-gray-200 mx-1 shrink-0" />

        <ToolbarButton
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Desfazer"
        >
          <Undo2 className="w-4 h-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Refazer"
        >
          <Redo2 className="w-4 h-4" />
        </ToolbarButton>

        <div className="w-px h-5 bg-gray-200 mx-1 shrink-0" />

        <ToolbarButton
          onClick={handleExportJSON}
          title="Exportar JSON"
        >
          <Download className="w-4 h-4" />
        </ToolbarButton>

        <ExportButton
          formats={['pdf', 'word']}
          title="Exportar Documento"
          onExportPdf={handleExportPDF}
          onExportWord={handleExportWord}
          label=""
          icon={FileText}
          defaultPdfOptions={{ widthPx: 2480, heightPx: 3508, dpi: 300 }}
          className="!p-2 !border-none !bg-transparent text-gray-400 hover:!bg-gray-100 hover:text-gray-700 shrink-0"
        />
      </div>

      {/* --- Editor Content Area --- */}
      <div className="flex-1 overflow-y-auto bg-white">
        <style>{`
          .editor-wrapper .ProseMirror {
            line-height: ${!isNaN(lineHeight) && lineHeight > 0 ? lineHeight : 1.5} !important;
            letter-spacing: ${!isNaN(letterSpacing) ? letterSpacing : 0}px !important;
          }
          .editor-wrapper .ProseMirror p {
            margin-top: 0.5em;
            margin-bottom: 0.5em;
          }
          
          /* Table Styles */
          .editor-wrapper .ProseMirror .tableWrapper {
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            margin: 1rem 0;
          }
          .editor-wrapper .ProseMirror table {
            width: 100%;
            border-collapse: collapse;
            table-layout: auto;
          }
          .editor-wrapper .ProseMirror th,
          .editor-wrapper .ProseMirror td {
            border: 1px solid #e5e7eb;
            padding: 0.5rem 0.75rem;
            min-width: 80px;
            position: relative;
            vertical-align: top;
            word-break: break-word;
            white-space: normal;
          }
          .editor-wrapper .ProseMirror th {
            font-weight: bold;
            text-align: left;
            background-color: #f9fafb;
          }
          .editor-wrapper .ProseMirror .column-resize-handle {
            position: absolute;
            right: -2px;
            top: 0;
            bottom: -2px;
            width: 4px;
            background-color: #ff7f00;
            pointer-events: none;
          }
          
          /* Checklist Styles */
          .editor-wrapper .ProseMirror ul[data-type="taskList"] {
            list-style: none;
            padding: 0;
            margin: 0;
          }
          .editor-wrapper .ProseMirror ul[data-type="taskList"] li {
            display: flex;
            align-items: center; /* Center checkbox with single line text */
            gap: 0.4rem;
            margin-bottom: 0;
          }
          .editor-wrapper .ProseMirror ul[data-type="taskList"] li > label {
            display: flex;
            user-select: none;
            margin-top: 0; /* Remove top margin that was pushing it down */
          }
          .editor-wrapper .ProseMirror ul[data-type="taskList"] li > div {
            flex: 1;
          }
          .editor-wrapper .ProseMirror ul[data-type="taskList"] li p {
            margin: 0 !important; /* Force no margin for paragraphs inside checklists */
          }
          .editor-wrapper .ProseMirror ul[data-type="taskList"] input[type="checkbox"] {
            width: 1rem;
            height: 1rem;
            accent-color: #ff7f00;
            cursor: pointer;
            border-radius: 0.25rem;
            margin: 0;
          }
          
          /* Image Styles */
          .editor-wrapper .ProseMirror img {
            max-width: 100%;
            height: auto;
            border-radius: 0.5rem;
            margin: 1.5rem 0;
          }
          .editor-wrapper .ProseMirror img.ProseMirror-selectednode {
            outline: 2px solid #ff7f00;
          }

          /* Bottom Sheet Mobile */
          .bottom-sheet-overlay {
            background-color: rgba(0, 0, 0, 0.4);
            animation: fadeIn 0.2s ease-out;
          }
          /* Hide floating alignment buttons from ImageResize extension */
          .editor-wrapper .ProseMirror [style*="z-index: 999"],
          .editor-wrapper .ProseMirror [style*="z-index:999"] {
            display: none !important;
          }
          .bottom-sheet {
            animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          }
          @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        `}</style>
        <div 
          id="pdf-export-content"
          className="max-w-5xl mx-auto px-6 sm:px-10 py-10 sm:py-16 editor-wrapper overflow-x-auto"
          onContextMenu={(e) => {
            if (editor && editor.isActive('table')) {
              e.preventDefault();
              setTableMenuContext({ x: e.clientX, y: e.clientY });
            }
          }}
        >
          {/* Title Input (Notion-style, Auto-wrapping) */}
          <textarea
            ref={titleTextareaRef}
            rows={1}
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            onKeyDown={handleTitleKeyDown}
            placeholder="Documento sem título"
            className="w-full text-4xl sm:text-5xl font-black text-gray-900 placeholder-gray-200 focus:outline-none border-none bg-transparent mb-8 tracking-tight leading-[1.2] resize-none overflow-hidden p-0"
          />

          {/* TipTap Editor */}
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Floating Table Context Menu */}
      {tableMenuContext && editor && (
        <div 
          className="fixed z-50 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 w-56 animate-in fade-in zoom-in-95 duration-100"
          style={{ top: Math.min(tableMenuContext.y, window.innerHeight - 300), left: Math.min(tableMenuContext.x, window.innerWidth - 230) }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-50 mb-1">
            Linhas
          </div>
          <button 
            className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-orange-50 hover:text-[#ff7f00] transition-colors"
            onClick={() => { editor.chain().focus().addRowBefore().run(); setTableMenuContext(null); }}
          >
            Adicionar linha acima
          </button>
          <button 
            className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-orange-50 hover:text-[#ff7f00] transition-colors"
            onClick={() => { editor.chain().focus().addRowAfter().run(); setTableMenuContext(null); }}
          >
            Adicionar linha abaixo
          </button>
          {!editor.isActive('tableHeader') && (
            <button 
              className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 transition-colors"
              onClick={() => { editor.chain().focus().deleteRow().run(); setTableMenuContext(null); }}
            >
              Excluir linha atual
            </button>
          )}
          
          <div className="px-3 py-1.5 mt-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-50 mb-1 border-t">
            Colunas
          </div>
          <button 
            className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-orange-50 hover:text-[#ff7f00] transition-colors"
            onClick={() => { editor.chain().focus().addColumnAfter().run(); setTableMenuContext(null); }}
          >
            Adicionar coluna
          </button>
          <button  
            className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 transition-colors"
            onClick={() => { editor.chain().focus().deleteColumn().run(); setTableMenuContext(null); }}
          >
            Excluir coluna atual
          </button>

          <div className="border-t border-gray-100 mt-1 pt-1">
            <button 
              className="w-full text-left px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 transition-colors"
              onClick={() => { editor.chain().focus().deleteTable().run(); setTableMenuContext(null); }}
            >
              Excluir Tabela Inteira
            </button>
          </div>
        </div>
      )}
      {/* Bottom Sheet Mobile for Tags */}
      <AnimatePresence>
        {showTagMenu && (
          <div className="lg:hidden fixed inset-0 z-[100] flex items-end bottom-sheet-overlay" onClick={() => setShowTagMenu(false)}>
            <motion.div 
              initial={{ translateY: '100%' }}
              animate={{ translateY: 0 }}
              exit={{ translateY: '100%' }}
              className="w-full bg-white rounded-t-3xl p-6 pb-12 bottom-sheet max-h-[80vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">
                  {isAddingTag ? 'CRIAR NOVA TAG' : 'SELECIONAR TAG'}
                </h3>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setIsAddingTag(!isAddingTag)}
                    className="px-4 py-2 bg-orange-50 text-[#ff7f00] text-[10px] font-black rounded-full uppercase tracking-widest"
                  >
                    {isAddingTag ? 'VOLTAR' : '+ NOVA'}
                  </button>
                  <button onClick={() => { setShowTagMenu(false); setIsAddingTag(false); }} className="p-2 bg-gray-100 rounded-full">
                    <X className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
              </div>
              
              {isAddingTag ? (
                <div className="space-y-6">
                  <input
                    type="text"
                    autoFocus
                    value={newTagLabel}
                    onChange={(e) => setNewTagLabel(e.target.value)}
                    placeholder="Nome da tag..."
                    className="w-full bg-gray-50 border border-gray-200 px-4 py-4 text-sm text-gray-900 focus:outline-none focus:border-[#ff7f00] rounded-2xl"
                  />
                  <div className="grid grid-cols-4 gap-3">
                    {TAG_COLORS.map(tc => (
                      <button
                        key={tc.id}
                        type="button"
                        onClick={() => setSelectedTagColor(tc.color)}
                        className={clsx(
                          "aspect-square rounded-xl border-2 transition-all",
                          selectedTagColor === tc.color ? "border-gray-900 scale-110 shadow-lg" : "border-transparent"
                        )}
                      >
                        <div className={clsx("w-full h-full rounded-lg", tc.color.split(' ')[0])} />
                      </button>
                    ))}
                  </div>
                  <button 
                    onClick={handleCreateTag}
                    className="w-full bg-[#ff7f00] text-white py-5 text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-orange-600 transition-all shadow-xl shadow-orange-100"
                  >
                    CRIAR TAG
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {projectTags.length === 0 ? (
                    <div className="w-full py-10 text-center text-xs text-gray-400 italic">
                      Nenhuma tag disponível no projeto.
                    </div>
                  ) : (
                    projectTags.map(tag => (
                      <button
                        key={tag.id}
                        className="transition-transform active:scale-90"
                        onClick={() => {
                          editor.chain().focus().insertContent({
                            type: 'tagNode',
                            attrs: { label: tag.label, color: tag.color }
                          }).insertContent(' ').run();
                          setShowTagMenu(false);
                        }}
                      >
                        <span 
                          className={clsx(
                            "px-3 py-1.5 text-xs font-bold border rounded-lg shadow-sm inline-block whitespace-nowrap",
                            (!tag.color || !tag.color.startsWith('#')) ? (tag.color || 'bg-gray-500 text-white') : 'text-white border-transparent'
                          )}
                          style={tag.color?.startsWith('#') ? { backgroundColor: tag.color } : {}}
                        >
                          {tag.label}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Export Loading Modal */}
      <AnimatePresence>
        {isExporting && (
          <div className="fixed inset-0 z-[9999] bg-[#f8f9fa]/80 backdrop-blur-sm flex flex-col items-center justify-center transition-all">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white p-10 rounded-2xl shadow-2xl flex flex-col items-center max-w-sm text-center border border-gray-200"
            >
              <Loader2 className="w-16 h-16 animate-spin text-[#ff7f00] mb-6" />
              <h2 className="text-xl font-bold text-gray-900 tracking-widest uppercase mb-2">Exportando</h2>
              <p className="text-gray-500 text-sm font-medium">Renderizando documento e tabelas de alta resolução. Isso pode levar alguns segundos.</p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Toolbar Button Component ---
interface ToolbarButtonProps {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}

function ToolbarButton({ onClick, active, disabled, title, children }: ToolbarButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={clsx(
        'p-2 rounded-lg transition-all shrink-0',
        active
          ? 'bg-orange-50 text-[#ff7f00]'
          : 'text-gray-400 hover:bg-gray-100 hover:text-gray-700',
        disabled && 'opacity-30 cursor-not-allowed'
      )}
    >
      {children}
    </button>
  );
}

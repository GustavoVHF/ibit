import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, doc, documentId } from 'firebase/firestore';
import { Project, UserProfile, ProjectTag, ProjectRole } from '../types';
import { getUserRole, canManageMembers, canRemoveMember, canChangeRole, getRoleLabel, getRoleColor, isProjectOwner } from '../utils/roleHelpers';
import { changeMemberRole, removeMember, transferOwnership } from '../utils/memberManagement';
import Sidebar from './Sidebar';
import ProjectSettingsModal from './ProjectSettingsModal';
import { Trash2, Tag, Crown, AlertTriangle, X, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useI18n } from '../i18n/LanguageContext';

export default function ProjectMembers() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [projectMembers, setProjectMembers] = useState<UserProfile[]>([]);
  const [projectTags, setProjectTags] = useState<ProjectTag[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [selectedNewOwner, setSelectedNewOwner] = useState<string>('');
  const [isTransferring, setIsTransferring] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Fetch project
  useEffect(() => {
    if (!projectId || !user) return;
    const projectRef = doc(db, 'projects', projectId);
    return onSnapshot(projectRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as Project;
        if (!data.members.includes(user.uid)) {
          navigate('/dashboard');
          return;
        }
        setProject({ id: docSnap.id, ...data });
        setLoading(false);
      }
    });
  }, [projectId, user, navigate]);

  // Check permissions
  const userRole = project && user ? getUserRole(project, user.uid) : 'viewer';
  const isOwner = project && user ? isProjectOwner(project, user.uid) : false;
  const canManage = project && user ? canManageMembers(project, user.uid) : false;

  // Redirect if no permission
  useEffect(() => {
    if (!loading && !canManage) {
      navigate(`/project/${projectId}`);
    }
  }, [loading, canManage, navigate, projectId]);

  // Fetch members
  useEffect(() => {
    if (!project?.members || project.members.length === 0) return;
    const qMembers = query(
      collection(db, 'users'),
      where(documentId(), 'in', project.members.slice(0, 30))
    );
    return onSnapshot(qMembers, (snapshot) => {
      const membersData: UserProfile[] = [];
      snapshot.forEach((doc) => {
        membersData.push({ uid: doc.id, ...doc.data() } as UserProfile);
      });
      setProjectMembers(membersData);
    });
  }, [project?.members?.join(',')]);

  // Fetch tags
  useEffect(() => {
    if (!projectId) return;
    const qTags = query(
      collection(db, 'projectTags'),
      where('projectId', '==', projectId)
    );
    return onSnapshot(qTags, (snapshot) => {
      const tagsData: ProjectTag[] = [];
      snapshot.forEach((doc) => {
        tagsData.push({ id: doc.id, ...doc.data() } as ProjectTag);
      });
      setProjectTags(tagsData);
    });
  }, [projectId]);

  const handleRoleChange = async (targetUid: string, newRole: ProjectRole) => {
    if (!project || !user || !projectId) return;
    if (newRole === 'owner') return; // Cannot promote to owner via dropdown

    try {
      await changeMemberRole(projectId, targetUid, newRole as 'admin' | 'editor' | 'viewer', user.uid);
    } catch (error) {
      console.error('Error changing role:', error);
      alert(t.members.changeRoleError);
    }
  };

  const handleRemoveMember = async (targetUid: string) => {
    if (!project || !user || !projectId) return;
    if (!confirm(t.members.removeConfirm)) return;

    try {
      await removeMember(projectId, targetUid, user.uid);
    } catch (error) {
      console.error('Error removing member:', error);
      alert(t.members.removeError);
    }
  };

  const handleTransferOwnership = async () => {
    if (!project || !user || !projectId || !selectedNewOwner) return;

    setIsTransferring(true);
    try {
      await transferOwnership(projectId, selectedNewOwner, user.uid);
      setIsTransferModalOpen(false);
      setSelectedNewOwner('');
    } catch (error) {
      console.error('Error transferring ownership:', error);
      alert(t.members.transferError);
    } finally {
      setIsTransferring(false);
    }
  };

  const admins = projectMembers.filter(m => project && getUserRole(project, m.uid) === 'admin');

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8f9fa] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#ff7f00] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!project || !canManage) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-gray-900 flex h-screen">
      <Sidebar
        projectId={projectId}
        projectName={project.name}
        onOpenSettings={canManage ? () => setIsSettingsModalOpen(true) : undefined}
      />

      <div className="flex-1 flex flex-col h-screen overflow-hidden min-w-0">
        {/* Header */}
        <header className="border-b border-gray-200 bg-white p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center overflow-hidden border border-gray-100 shrink-0">
              {project.photoURL ? (
                <img src={project.photoURL} alt={project.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-xl">🏎️</span>
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold tracking-wider leading-tight text-gray-900 truncate">
                {project.name} - #{project.shortId || '---'}
              </h2>
            </div>
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
                {project.members.length} {t.common.membersCount(project.members.length)}
              </span>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-5xl mx-auto space-y-6 mt-8">
            {/* Title */}
            <div>
              <h1 className="text-2xl font-bold tracking-wider uppercase text-gray-900">{t.members.title}</h1>
              <p className="text-sm text-gray-500 mt-1">{t.members.subtitle}</p>
            </div>

            {/* Transfer Ownership (Owner only) */}
            {isOwner && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <Crown className="w-5 h-5 text-[#ff7f00] mt-0.5 shrink-0" />
                    <div>
                      <h3 className="text-sm font-bold uppercase tracking-wider text-gray-900">{t.members.transferTitle}</h3>
                      <p className="text-xs text-gray-600 mt-1">
                        {t.members.transferText}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setIsTransferModalOpen(true)}
                    disabled={admins.length === 0}
                    className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-white bg-[#ff7f00] hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors rounded-none shrink-0"
                  >
                    {t.members.transfer}
                  </button>
                </div>
              </div>
            )}

            {/* Members Table */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">{t.members.colMember}</th>
                      <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">{t.members.colRole}</th>
                      <th className="px-6 py-3 text-right text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">{t.common.actions}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {projectMembers.map((member) => {
                      const memberRole = getUserRole(project, member.uid);
                      const canRemove = user && canRemoveMember(project, user.uid, member.uid);
                      const canChange = user && canChangeRole(project, user.uid, member.uid, 'editor');

                      return (
                        <tr key={member.uid} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full overflow-hidden border border-gray-200 bg-white shrink-0">
                                {member.photoURL ? (
                                  <img src={member.photoURL} alt={member.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-sm font-bold text-gray-400">
                                    {member.name.charAt(0).toUpperCase()}
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-bold text-gray-900 truncate">{member.name}</div>
                                <div className="text-xs text-gray-500 truncate">{member.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            {canChange ? (
                              <select
                                value={memberRole}
                                onChange={(e) => handleRoleChange(member.uid, e.target.value as ProjectRole)}
                                className="text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-md border border-gray-300 focus:outline-none focus:border-[#ff7f00] bg-white"
                              >
                                <option value="admin">{t.enums.projectRole.admin}</option>
                                <option value="editor">{t.enums.projectRole.editor}</option>
                                <option value="viewer">{t.enums.projectRole.viewer}</option>
                              </select>
                            ) : (
                              <span className={`inline-block px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md ${getRoleColor(memberRole)}`}>
                                {getRoleLabel(memberRole)}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => handleRemoveMember(member.uid)}
                              disabled={!canRemove}
                              className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors rounded-none"
                              title={canRemove ? t.members.removeMember : t.members.cannotRemove}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Transfer Ownership Modal */}
      <AnimatePresence>
        {isTransferModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white border border-orange-200 w-full max-w-md overflow-hidden shadow-2xl rounded-xl"
            >
              <div className="flex justify-between items-center p-6 border-b border-orange-100 bg-orange-50">
                <h3 className="text-xl font-bold uppercase text-gray-900 flex items-center gap-2">
                  <Crown className="w-5 h-5 text-[#ff7f00]" /> {t.members.transferTitle}
                </h3>
                <button onClick={() => { setIsTransferModalOpen(false); setSelectedNewOwner(''); }} className="text-gray-400 hover:text-gray-600 transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                <p className="text-sm text-gray-700">
                  {t.members.transferModalText}
                </p>

                <div className="space-y-2">
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider">
                    {t.members.newOwner}
                  </label>
                  {admins.length === 0 ? (
                    <p className="text-sm text-red-600">{t.members.noAdmins}</p>
                  ) : (
                    <div className="space-y-2">
                      {admins.map((admin) => (
                        <div
                          key={admin.uid}
                          onClick={() => setSelectedNewOwner(admin.uid)}
                          className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all border ${
                            selectedNewOwner === admin.uid
                              ? 'bg-orange-50 border-orange-200'
                              : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full overflow-hidden border border-gray-200 bg-white">
                              {admin.photoURL ? (
                                <img src={admin.photoURL} alt={admin.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-xs font-bold text-gray-400">
                                  {admin.name.charAt(0).toUpperCase()}
                                </div>
                              )}
                            </div>
                            <div>
                              <div className="text-sm font-bold text-gray-900">{admin.name}</div>
                              <div className="text-xs text-gray-500">{admin.email}</div>
                            </div>
                          </div>
                          {selectedNewOwner === admin.uid && (
                            <Check className="w-5 h-5 text-[#ff7f00]" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => { setIsTransferModalOpen(false); setSelectedNewOwner(''); }}
                    className="flex-1 bg-white border border-gray-300 text-gray-700 px-4 py-3 font-bold uppercase tracking-wider transition-colors rounded-none hover:bg-gray-50"
                  >
                    {t.common.cancel}
                  </button>
                  <button
                    type="button"
                    onClick={handleTransferOwnership}
                    disabled={isTransferring || !selectedNewOwner}
                    className="flex-1 bg-[#ff7f00] hover:bg-orange-600 disabled:opacity-50 text-white px-4 py-3 font-bold uppercase tracking-wider transition-colors rounded-none"
                  >
                    {isTransferring ? t.members.transferring : t.common.confirm}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Project Settings Modal */}
      {isSettingsModalOpen && project && (
        <ProjectSettingsModal
          project={project}
          onClose={() => setIsSettingsModalOpen(false)}
        />
      )}
    </div>
  );
}

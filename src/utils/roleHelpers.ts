import { Project, ProjectRole } from '../types';
import { getMessages } from '../i18n';

/**
 * Get the role of a user in a project.
 * Handles legacy projects without roles field.
 */
export function getUserRole(project: Project, uid: string): ProjectRole {
  // If roles map exists, use it
  if (project.roles && project.roles[uid]) {
    return project.roles[uid];
  }

  // Legacy fallback: owner gets 'owner', others get 'editor'
  if (project.ownerId === uid) {
    return 'owner';
  }

  // Check if user is a member
  if (project.members.includes(uid)) {
    return 'editor';
  }

  // Default to viewer if somehow not in members (shouldn't happen)
  return 'viewer';
}

/**
 * Check if user can edit project settings (name, description, photo).
 * Only owner and admin can edit.
 */
export function canEditProject(project: Project, uid: string): boolean {
  const role = getUserRole(project, uid);
  return role === 'owner' || role === 'admin';
}

/**
 * Check if user can manage members (view member page, change roles, remove members).
 * Only owner and admin can manage members.
 */
export function canManageMembers(project: Project, uid: string): boolean {
  const role = getUserRole(project, uid);
  return role === 'owner' || role === 'admin';
}

/**
 * Check if actor can remove a specific member.
 * - Owner cannot be removed
 * - Only owner/admin can remove members
 * - Admin cannot remove owner
 */
export function canRemoveMember(project: Project, actorUid: string, targetUid: string): boolean {
  const actorRole = getUserRole(project, actorUid);
  const targetRole = getUserRole(project, targetUid);

  // Only owner/admin can remove members
  if (actorRole !== 'owner' && actorRole !== 'admin') {
    return false;
  }

  // Cannot remove the owner
  if (targetRole === 'owner') {
    return false;
  }

  return true;
}

/**
 * Check if actor can change a member's role to the specified target role.
 * - Only owner/admin can change roles
 * - Cannot change owner's role
 * - Admin cannot promote someone to owner
 * - Admin cannot change their own role (only owner can)
 */
export function canChangeRole(project: Project, actorUid: string, targetUid: string, newRole: ProjectRole): boolean {
  const actorRole = getUserRole(project, actorUid);
  const targetRole = getUserRole(project, targetUid);

  // Only owner/admin can change roles
  if (actorRole !== 'owner' && actorRole !== 'admin') {
    return false;
  }

  // Cannot change owner's role
  if (targetRole === 'owner') {
    return false;
  }

  // Only owner can promote to owner (via transfer ownership)
  if (newRole === 'owner') {
    return false;
  }

  // Admin cannot change their own role (only owner can)
  if (actorRole === 'admin' && actorUid === targetUid) {
    return false;
  }

  return true;
}

/**
 * Check if user has write permissions (can create/edit/delete content).
 * Viewers have read-only access.
 */
export function canWrite(project: Project, uid: string): boolean {
  const role = getUserRole(project, uid);
  return role !== 'viewer';
}

/**
 * Check if user is the project owner.
 */
export function isProjectOwner(project: Project, uid: string): boolean {
  return getUserRole(project, uid) === 'owner';
}

/**
 * Get display label for role in the current language.
 */
export function getRoleLabel(role: ProjectRole): string {
  return getMessages().enums.projectRole[role];
}

/**
 * Get color class for role badge.
 */
export function getRoleColor(role: ProjectRole): string {
  const colors: Record<ProjectRole, string> = {
    owner: 'bg-[#ff7f00] text-white',
    admin: 'bg-blue-500 text-white',
    editor: 'bg-green-500 text-white',
    viewer: 'bg-gray-400 text-white'
  };
  return colors[role];
}

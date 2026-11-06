import { db } from '../firebase';
import { doc, updateDoc, getDoc, serverTimestamp, arrayRemove } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from './errorHandlers';
import { commitWrite, withTimeout } from './firestoreWrite';
import { Project, ProjectRole } from '../types';
import { getUserRole, canManageMembers, canRemoveMember, canChangeRole } from './roleHelpers';
import { getMessages } from '../i18n';

/**
 * Change a member's role in a project.
 * Validates permissions and handles legacy projects.
 */
export async function changeMemberRole(
  projectId: string,
  targetUid: string,
  newRole: 'admin' | 'editor' | 'viewer',
  actorUid: string
): Promise<void> {
  try {
    // Fetch project
    const projectRef = doc(db, 'projects', projectId);
    const projectSnap = await withTimeout(getDoc(projectRef));

    if (!projectSnap.exists()) {
      throw new Error(getMessages().errors.projectNotFound);
    }

    const project = { id: projectSnap.id, ...projectSnap.data() } as Project;

    // Validate permissions
    if (!canChangeRole(project, actorUid, targetUid, newRole)) {
      throw new Error(getMessages().errors.noPermissionChangeRole);
    }

    // Initialize roles map if it doesn't exist (legacy project)
    const currentRoles = project.roles || {};

    // If roles map is empty, initialize it with current state
    if (Object.keys(currentRoles).length === 0) {
      project.members.forEach(uid => {
        if (uid === project.ownerId) {
          currentRoles[uid] = 'owner';
        } else {
          currentRoles[uid] = 'editor';
        }
      });
    }

    // Update the target user's role
    currentRoles[targetUid] = newRole;

    // Update project document
    await commitWrite(updateDoc(projectRef, {
      roles: currentRoles,
      updatedAt: serverTimestamp()
    }), { label: 'o cargo do membro' });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `projects/${projectId}`);
    throw error;
  }
}

/**
 * Remove a member from a project.
 * Validates permissions and cleans up related data.
 */
export async function removeMember(
  projectId: string,
  targetUid: string,
  actorUid: string
): Promise<void> {
  try {
    // Fetch project
    const projectRef = doc(db, 'projects', projectId);
    const projectSnap = await withTimeout(getDoc(projectRef));

    if (!projectSnap.exists()) {
      throw new Error(getMessages().errors.projectNotFound);
    }

    const project = { id: projectSnap.id, ...projectSnap.data() } as Project;

    // Validate permissions
    if (!canRemoveMember(project, actorUid, targetUid)) {
      throw new Error(getMessages().errors.noPermissionRemoveMember);
    }

    // Remove from members array
    const updateData: any = {
      members: arrayRemove(targetUid),
      updatedAt: serverTimestamp()
    };

    // Remove from roles map if it exists
    if (project.roles && project.roles[targetUid]) {
      const updatedRoles = { ...project.roles };
      delete updatedRoles[targetUid];
      updateData.roles = updatedRoles;
    }

    // Update project document
    await commitWrite(updateDoc(projectRef, updateData), { label: 'a remoção do membro' });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `projects/${projectId}`);
    throw error;
  }
}

/**
 * Transfer project ownership to another admin.
 * Current owner becomes admin, target admin becomes owner.
 */
export async function transferOwnership(
  projectId: string,
  newOwnerUid: string,
  currentOwnerUid: string
): Promise<void> {
  try {
    // Fetch project
    const projectRef = doc(db, 'projects', projectId);
    const projectSnap = await withTimeout(getDoc(projectRef));

    if (!projectSnap.exists()) {
      throw new Error(getMessages().errors.projectNotFound);
    }

    const project = { id: projectSnap.id, ...projectSnap.data() } as Project;

    // Validate current owner
    if (project.ownerId !== currentOwnerUid) {
      throw new Error(getMessages().errors.onlyOwnerTransfers);
    }

    // Validate new owner is an admin
    const newOwnerRole = getUserRole(project, newOwnerUid);
    if (newOwnerRole !== 'admin') {
      throw new Error(getMessages().errors.newOwnerMustBeAdmin);
    }

    // Initialize roles map if it doesn't exist
    const currentRoles = project.roles || {};

    if (Object.keys(currentRoles).length === 0) {
      project.members.forEach(uid => {
        if (uid === project.ownerId) {
          currentRoles[uid] = 'owner';
        } else {
          currentRoles[uid] = 'editor';
        }
      });
    }

    // Update roles: new owner gets 'owner', current owner gets 'admin'
    currentRoles[newOwnerUid] = 'owner';
    currentRoles[currentOwnerUid] = 'admin';

    // Update project document
    await commitWrite(updateDoc(projectRef, {
      ownerId: newOwnerUid,
      roles: currentRoles,
      updatedAt: serverTimestamp()
    }), { label: 'a transferência de posse' });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `projects/${projectId}`);
    throw error;
  }
}

/**
 * Assign tags to a member (placeholder for future implementation).
 * This would create/update a memberTags collection document.
 */
export async function assignMemberTags(
  projectId: string,
  targetUid: string,
  tagIds: string[],
  actorUid: string
): Promise<void> {
  try {
    // Fetch project to validate permissions
    const projectRef = doc(db, 'projects', projectId);
    const projectSnap = await withTimeout(getDoc(projectRef));

    if (!projectSnap.exists()) {
      throw new Error(getMessages().errors.projectNotFound);
    }

    const project = { id: projectSnap.id, ...projectSnap.data() } as Project;

    // Validate permissions
    if (!canManageMembers(project, actorUid)) {
      throw new Error(getMessages().errors.noPermissionAssignTags);
    }

    // TODO: Implement memberTags collection
    // For now, this is a placeholder
    console.log('Assign tags:', { projectId, targetUid, tagIds });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `projects/${projectId}`);
    throw error;
  }
}

import type { Messages } from '../pt-BR';

export const kanban: Messages['kanban'] = {
  newBadge: 'NEW',
  dropHere: 'DROP HERE',
  taskPlaceholder: 'What needs to be done?',
  newTask: 'NEW TASK',
  columnNamePlaceholder: 'Column name',
  createColumn: 'CREATE COLUMN',
  addColumn: 'ADD COLUMN',
};

export const task: Messages['task'] = {
  title: 'Task Details',
  titleLabel: 'Title',
  namePlaceholder: 'Task name...',
  description: 'DESCRIPTION',
  descriptionPlaceholder: 'Add a description...',
  assignees: 'ASSIGNEES',
  startDate: 'START DATE',
  dueDate: 'DUE DATE',
  highlightColor: 'HIGHLIGHT COLOR',
  projectTags: 'PROJECT TAGS',
  tagNamePlaceholder: 'Tag name...',
  create: 'CREATE',
  newTag: '+ New Tag',
  deleteConfirm: 'Are you sure you want to delete this task?',
};

export const quadro: Messages['quadro'] = {
  select: 'Select',
  rectangle: 'Rectangle',
  deleteSelected: 'Delete Selected',
  newText: 'TEXT',
  newTopic: 'NEW TOPIC',
};

export const tags: Messages['tags'] = {
  saveError: 'Error saving the tag.',
  deleteError: 'Error deleting the tag.',
  deleteConfirm: 'Are you sure you want to delete this tag?',
  title: 'Tag Management',
  subtitle: 'Create and manage the project identification tags',
  newTag: 'NEW TAG',
  colTag: 'Tag',
  colPreview: 'Preview',
  empty: 'No tags yet.',
  editTag: 'Edit tag',
  deleteTag: 'Delete tag',
  editTitle: 'Edit Tag',
  newTitle: 'New Tag',
  preview: 'Preview',
  previewPlaceholder: 'TAG NAME',
  nameLabel: 'Tag Name',
  namePlaceholder: 'E.g.: HIGH PRIORITY',
  colorLabel: 'Tag Color',
  saveTag: 'Save Tag',
};

export const members: Messages['members'] = {
  changeRoleError: 'Error changing the role. Check your permissions.',
  removeConfirm: 'Are you sure you want to remove this member?',
  removeError: 'Error removing the member. Check your permissions.',
  transferError: 'Error transferring ownership. Check your permissions.',
  title: 'Member Management',
  subtitle: 'Manage roles and permissions of the project members',
  transferTitle: 'Transfer Ownership',
  transferText: 'You can transfer project ownership to an admin. You will become an admin after the transfer.',
  transfer: 'Transfer',
  colMember: 'Member',
  colRole: 'Role',
  removeMember: 'Remove member',
  cannotRemove: 'Cannot be removed',
  transferModalText: 'Select an admin to become the new project owner. You will be downgraded to admin.',
  newOwner: 'New Owner',
  noAdmins: 'There are no admins available for the transfer.',
  transferring: 'Transferring...',
};

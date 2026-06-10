type ConfirmDeleteOptions = {
  title?: string;
  itemName?: string;
  description?: string;
};

export const confirmDelete = ({
  title = 'Confirm delete',
  itemName = 'this item',
  description = 'This action cannot be undone.',
}: ConfirmDeleteOptions = {}) => (
  window.confirm(`${title}\n\nDelete ${itemName}?\n${description}`)
);

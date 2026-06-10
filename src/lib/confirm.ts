export type ConfirmDeleteOptions = {
  title?: string;
  itemName?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

export type ConfirmDeleteRequest = Required<ConfirmDeleteOptions> & {
  resolve: (confirmed: boolean) => void;
};

export const confirmDelete = ({
  title = 'Confirm delete',
  itemName = 'this item',
  description = 'This action cannot be undone.',
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
}: ConfirmDeleteOptions = {}) => new Promise<boolean>((resolve) => {
  window.dispatchEvent(new CustomEvent<ConfirmDeleteRequest>('app-confirm-delete', {
    detail: {
      title,
      itemName,
      description,
      confirmLabel,
      cancelLabel,
      resolve,
    },
  }));
});

export type ToastLevel = 'success' | 'info' | 'error';

export type ToastEventDetail = {
  id?: string;
  level?: ToastLevel;
  title?: string;
  message: string;
};

export const notify = (detail: ToastEventDetail) => {
  window.dispatchEvent(new CustomEvent<ToastEventDetail>('app-toast', { detail }));
};

export const notifySuccess = (message = 'Saved successfully.', title = 'Saved') => {
  notify({ level: 'success', title, message });
};

export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'ticketia_theme';

export const getStoredTheme = (): ThemeMode => {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* sin acceso a localStorage */
  }
  return 'system';
};

const systemPrefersDark = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-color-scheme: dark)').matches;

export const applyTheme = (mode: ThemeMode): void => {
  const dark = mode === 'dark' || (mode === 'system' && systemPrefersDark());
  const root = document.documentElement;
  root.classList.toggle('dark', dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0b0f19' : '#4f46e5');
};

export const setTheme = (mode: ThemeMode): void => {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* sin acceso a localStorage */
  }
  applyTheme(mode);
};

/** Aplica el tema guardado y reacciona a cambios del sistema cuando el modo es "system". */
export const initTheme = (): void => {
  applyTheme(getStoredTheme());
  if (typeof window.matchMedia !== 'function') return;
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => {
    if (getStoredTheme() === 'system') applyTheme('system');
  };
  if (mq.addEventListener) mq.addEventListener('change', onChange);
  else if ((mq as any).addListener) (mq as any).addListener(onChange);
};

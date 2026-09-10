/**
 * PWA shell chrome for the web app (DESIGN.md §7.4, phase 7 of §9):
 * install prompt, update prompt, offline indicator.
 */
export { InstallBanner } from './InstallBanner';
export { OfflineIndicator } from './OfflineIndicator';
export { PwaLayer } from './PwaLayer';
export { UpdateToast } from './UpdateToast';
export { useInstallPrompt, type InstallPrompt } from './useInstallPrompt';
export { useOnlineStatus } from './useOnlineStatus';
export { useServiceWorkerUpdate, type ServiceWorkerUpdate } from './useServiceWorkerUpdate';

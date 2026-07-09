import "../styles/AppToast.css";

const TOAST_VISIBLE_MS = 5000;
const TOAST_FADE_MS = 450;

let activeToast = null;
let hideTimer = null;
let removeTimer = null;
let lastToastKey = '';
let lastToastAt = 0;

function clearToastTimers() {
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  if (removeTimer) {
    clearTimeout(removeTimer);
    removeTimer = null;
  }
}

function dismissToast(el) {
  if (!el?.isConnected) return;
  el.classList.add("app-toast--leaving");
  removeTimer = setTimeout(() => {
    el.remove();
    if (activeToast === el) activeToast = null;
    removeTimer = null;
  }, TOAST_FADE_MS);
}

/**
 * Sağ üstte otomatik kaybolan bildirim (varsayılan 5 sn).
 * @param {string} message
 * @param {'success' | 'error' | 'info'} type
 */
export function showAppToast(message, type = "success") {
  const text = String(message || "").trim();
  if (!text) return;

  const toastKey = `${type}:${text}`;
  const now = Date.now();
  if (toastKey === lastToastKey && now - lastToastAt < 600) return;
  lastToastKey = toastKey;
  lastToastAt = now;

  let variant, icon, title;
  
  if (type === "error") {
    variant = "error";
    icon = "fa-exclamation-circle";
    title = "Hata";
  } else if (type === "info") {
    variant = "info";
    icon = "fa-info-circle";
    title = "Bilgi";
  } else {
    variant = "success";
    icon = "fa-check-circle";
    title = "Başarılı";
  }

  clearToastTimers();
  if (activeToast?.isConnected) {
    activeToast.remove();
    activeToast = null;
  }

  const toast = document.createElement("div");
  toast.className = `app-toast app-toast--${variant}`;
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");

  const header = document.createElement("div");
  header.className = "app-toast__header";
  const iconEl = document.createElement("i");
  iconEl.className = `fas ${icon}`;
  iconEl.setAttribute("aria-hidden", "true");
  const titleEl = document.createElement("span");
  titleEl.textContent = title;
  header.appendChild(iconEl);
  header.appendChild(titleEl);

  const messageEl = document.createElement("p");
  messageEl.className = "app-toast__message";
  messageEl.textContent = text;

  toast.appendChild(header);
  toast.appendChild(messageEl);
  document.body.appendChild(toast);
  activeToast = toast;

  hideTimer = setTimeout(() => dismissToast(toast), TOAST_VISIBLE_MS);
}
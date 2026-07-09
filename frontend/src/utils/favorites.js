const STORAGE_KEY = 'uzmangel_favorites_v1';

export function loadFavorites() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load favorites', e);
    return {};
  }
}

export function saveFavorites(obj) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch (e) {
    console.error('Failed to save favorites', e);
  }
}

export function toggleFavoriteId(id) {
  const fav = loadFavorites();
  const next = { ...fav, [id]: !fav[id] };
  saveFavorites(next);
  return next;
}

export default { loadFavorites, saveFavorites, toggleFavoriteId };

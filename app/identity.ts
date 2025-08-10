export type Identity = {
  userId: string;
  name: string;
  color: string;
  avatar?: string; // data URL
};

const USER_ID_KEY = 'pk-user-id';
const NAME_KEY = 'pk-name';
const COLOR_KEY = 'pk-color';
const AVATAR_KEY = 'pk-avatar';

function randomColor() {
  return `hsl(${Math.floor(Math.random() * 360)} 80% 60%)`;
}

export function getIdentity(): Identity {
  const existingId = localStorage.getItem(USER_ID_KEY);
  const userId = existingId ?? Math.random().toString(36).slice(2, 8);
  if (!existingId) localStorage.setItem(USER_ID_KEY, userId);
  const name = localStorage.getItem(NAME_KEY) || 'anon';
  const color = localStorage.getItem(COLOR_KEY) || randomColor();
  const avatar = localStorage.getItem(AVATAR_KEY) || undefined;
  return { userId, name, color, avatar };
}

export function setIdentity(update: Partial<Identity>): Identity {
  const current = getIdentity();
  const merged: Identity = {
    ...current,
    ...update,
  };
  localStorage.setItem(USER_ID_KEY, merged.userId);
  localStorage.setItem(NAME_KEY, merged.name);
  localStorage.setItem(COLOR_KEY, merged.color);
  if (merged.avatar) localStorage.setItem(AVATAR_KEY, merged.avatar);
  // notify listeners in other tabs/components
  window.dispatchEvent(
    new CustomEvent('pk-identity-updated', { detail: merged }),
  );
  return merged;
}

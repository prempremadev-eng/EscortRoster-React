import { createContext, useContext } from 'react';

// The signed-in person ({ email, name, role, roleName, city, branch_id, agency_id }), set by AuthGate.
export const UserContext = createContext(null);
export const useUser = () => useContext(UserContext);

const RANK = { supervisor: 1, branch_admin: 2, city_admin: 3, state_admin: 4, admin: 5, super_admin: 6 };
// Same ladder as the server (functions/escortAPI/auth.js). The server checks again; this only hides buttons.
export const atLeast = (user, role) => !!user && (RANK[user.role] || 0) >= RANK[role];

const APP_PAGE = '/app/index.html';
export function signOut() {
  try {
    window.catalyst.auth.signOut(APP_PAGE);
  } catch {
    window.location.href = APP_PAGE;
  }
}

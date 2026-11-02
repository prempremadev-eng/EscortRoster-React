import { createContext, useContext } from 'react';

// The signed-in person ({ email, name, role, roleName, city, branch_id, agency_id }), set by AuthGate.
export const UserContext = createContext(null);
export const useUser = () => useContext(UserContext);

const RANK = { supervisor: 1, branch_admin: 2, city_admin: 3, state_admin: 4, admin: 5, super_admin: 6 };
// Same ladder as the server (functions/escortAPI/auth.js). The server checks again; this only hides buttons.
export const atLeast = (user, role) => !!user && (RANK[user.role] || 0) >= RANK[role];
// Escort sheet: everyone may look; a supervisor of an agency without the Escort team only looks (server sends escortEdit).
export const canEditEscort = user => !user || user.escortEdit !== false;

// This page's own address (/app/index.html on the old hosting, / on Slate).
const appPage = () => window.location.origin + window.location.pathname;
export function signOut() {
  try {
    window.catalyst.auth.signOut(appPage());
  } catch {
    window.location.href = appPage();
  }
}

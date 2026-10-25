import { useState } from 'react';
import { useUser } from './auth/user.js';
import { worksIn } from './agency.js';

// One agency at a time for Branch Admin and above (Prem, 25 Oct: a Super Admin goes everywhere, so every
// page with guards or posts gets the IPF / ISI / BSS picker). A supervisor always sees their own agency and
// gets no picker. The choice is shared by the pages (kept on this browser).
const KEY = 'sc-agency';
export function useAgencyPick(branch, agencies) {
  const me = useUser();
  const pickAgency = !!me && me.role !== 'supervisor';
  const [agency, setAgency] = useState(() => { try { return localStorage.getItem(KEY) || ''; } catch { return ''; } });
  const chooseAgency = v => { setAgency(v); try { localStorage.setItem(KEY, v); } catch { /* private window */ } };
  // "All my branches" (Shift report, Vehicles): every active agency.
  const branchAgencies = (agencies || []).filter(a => (a.is_active === true || a.is_active === 'true') && (branch === 'ALL' || worksIn(a, branch)));
  const ag = !pickAgency ? '' : branchAgencies.some(a => String(a.ROWID) === agency) ? agency : (branchAgencies[0] ? String(branchAgencies[0].ROWID) : '');
  return { pickAgency, branchAgencies, ag, chooseAgency };
}

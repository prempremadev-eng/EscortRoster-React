// Agencies.branch_ids = comma list of the branches the agency works in (Admin → Agencies).
export const agencyBranches = a => String((a && a.branch_ids) || '').split(',').map(x => x.trim()).filter(Boolean);
export const worksIn = (a, branchId) => agencyBranches(a).includes(String(branchId));

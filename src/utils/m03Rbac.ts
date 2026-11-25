export interface M03UserLike {
  id?: string | null;
  username?: string | null;
  name?: string | null;
  role?: string | null;
  roleUpper?: string | null;
  la_to_truong?: boolean | null;
  allowedModules?: string[] | null;
  allowed_modules?: string[] | null;
  userPermissions?: any[] | string | null;
  user_permissions?: any[] | string | null;
  permissions?: any[] | string | null;
  [key: string]: any;
}

export interface M03BookingLike {
  id?: string | null;
  bookingCode?: string | null;
  requesterId?: string | null;
  requesterName?: string | null;
  assignedQcId?: string | null;
  assignedQcName?: string | null;
  status?: string | null;
  sqcType?: string | null;
  [key: string]: any;
}

export interface M03Capabilities {
  canView: boolean;
  canViewAll: boolean;
  canCreate: boolean;
  canEditOwn: boolean;
  canEditAll: boolean;
  canDeleteOwn: boolean;
  canDeleteAll: boolean;
  canAssignQc: boolean;
  canReconcile: boolean;
  canExport: boolean;
  canImport: boolean;
  canInspectAny: boolean;
  canInspectAssigned: boolean;
  canViewInspections: boolean;
  isManagerial: boolean;
}

function parseArrayField<T = any>(raw: any): T[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function extractUserPermissionsList(
  user: M03UserLike | null | undefined,
  rolesList: any[] = []
): any[] {
  if (!user) return [];
  const raw = user.userPermissions ?? user.user_permissions ?? user.permissions;
  const userPerms = parseArrayField(raw);
  if (userPerms.length > 0) return userPerms;

  const roleUpper = String(user.role || user.roleUpper || '').toUpperCase().trim();
  if (roleUpper && Array.isArray(rolesList) && rolesList.length > 0) {
    const roleObj = rolesList.find(
      (r: any) =>
        r &&
        typeof r === 'object' &&
        (String(r.id || '').toUpperCase() === roleUpper ||
          String(r.name || '').toUpperCase() === roleUpper)
    );
    if (roleObj) {
      return parseArrayField(roleObj.permissions);
    }
  }
  return [];
}

export function extractAllowedModules(
  user: M03UserLike | null | undefined,
  rolesList: any[] = []
): string[] {
  if (!user) return [];
  const direct = parseArrayField<string>(user.allowedModules ?? user.allowed_modules).map((m) =>
    String(m || '').toUpperCase().trim()
  );
  if (direct.length > 0) return direct;

  const roleUpper = String(user.role || user.roleUpper || '').toUpperCase().trim();
  if (roleUpper && Array.isArray(rolesList) && rolesList.length > 0) {
    const roleObj = rolesList.find(
      (r: any) =>
        r &&
        typeof r === 'object' &&
        (String(r.id || '').toUpperCase() === roleUpper ||
          String(r.name || '').toUpperCase() === roleUpper)
    );
    if (roleObj) {
      return parseArrayField<string>(roleObj.allowedModules).map((m) =>
        String(m || '').toUpperCase().trim()
      );
    }
  }
  return [];
}

export function actionMatchesGrant(grantedActions: string[], requestedAction: string): boolean {
  const req = String(requestedAction || 'VIEW').toUpperCase().trim();
  const set = new Set(grantedActions.map((a) => String(a || '').toUpperCase().trim()));
  if (set.has(req)) return true;
  if (req === 'VIEW' && set.has('VIEW_ALL')) return true;
  if (req === 'EDIT' && (set.has('EDIT_OWN') || set.has('EDIT_ALL'))) return true;
  if (req === 'EDIT_OWN' && (set.has('EDIT_ALL') || set.has('EDIT'))) return true;
  if (req === 'DELETE' && (set.has('DELETE_OWN') || set.has('DELETE_ALL'))) return true;
  if (req === 'DELETE_OWN' && (set.has('DELETE_ALL') || set.has('DELETE'))) return true;
  return false;
}

export function checkModuleActionPermission(
  user: M03UserLike | null | undefined,
  rolesList: any[] = [],
  moduleId: string,
  action: string = 'VIEW'
): boolean {
  if (!user) return false;
  const roleUpper = String(user.role || user.roleUpper || '').toUpperCase().trim();
  if (roleUpper === 'ADMIN') return true;

  const perms = extractUserPermissionsList(user, rolesList);
  const act = String(action || 'VIEW').toUpperCase().trim();
  const mod = String(moduleId || '').toUpperCase().trim();

  const sysAdmin = perms.find((p) => String(p?.moduleId || '').toUpperCase() === 'SYSTEM_ADMIN');
  if (sysAdmin && Array.isArray(sysAdmin.actions) && actionMatchesGrant(sysAdmin.actions, act)) {
    return true;
  }

  const matched = perms.filter((p) => String(p?.moduleId || '').toUpperCase() === mod);
  if (matched.length > 0) {
    return matched.some((p) => Array.isArray(p?.actions) && actionMatchesGrant(p.actions, act));
  }

  const allowedModules = extractAllowedModules(user, rolesList);
  if (allowedModules.includes(mod)) {
    if (act === 'VIEW' || act === 'CREATE' || act === 'EDIT' || act === 'EDIT_OWN') {
      return true;
    }
    const isLeadOrManager =
      Boolean(user.la_to_truong) ||
      roleUpper === 'MANAGER' ||
      roleUpper === 'QA' ||
      roleUpper === 'QC_LEAD';
    if (isLeadOrManager && act === 'SIGN1') return true;
    if ((roleUpper === 'MANAGER' || roleUpper === 'QA') && act === 'SIGN2') {
      return true;
    }
  }

  return false;
}

export function mapSqcTypeToModuleId(sqcType?: string | null): string {
  const t = String(sqcType || 'SQC_BTP').toUpperCase().trim();
  if (t === 'SQC_VT' || t === 'SQC_MAT') return 'SQC_MAT';
  if (t === 'SQC_TP') return 'SQC_TP';
  return 'SQC_BTP';
}

export function isBookingOwner(
  user: M03UserLike | null | undefined,
  booking: M03BookingLike | null | undefined
): boolean {
  if (!user || !booking) return false;
  const userId = String(user.id || '').trim();
  const reqId = String(booking.requesterId || '').trim();
  if (userId && reqId && userId === reqId) return true;

  const userNameNorm = String(user.name || '').trim().toLowerCase();
  const usernameNorm = String(user.username || '').trim().toLowerCase();
  const reqNameNorm = String(booking.requesterName || '').trim().toLowerCase();
  if (!reqNameNorm) return false;
  return Boolean(
    (userNameNorm && reqNameNorm === userNameNorm) ||
      (usernameNorm && reqNameNorm === usernameNorm)
  );
}

export function isAssignedQcForBooking(
  user: M03UserLike | null | undefined,
  booking: M03BookingLike | null | undefined
): boolean {
  if (!user || !booking) return false;
  const userId = String(user.id || '').trim();
  const qcId = String(booking.assignedQcId || '').trim();
  if (userId && qcId && userId === qcId) return true;

  const userNameNorm = String(user.name || '').trim().toLowerCase();
  const usernameNorm = String(user.username || '').trim().toLowerCase();
  const qcNameNorm = String(booking.assignedQcName || '').trim().toLowerCase();
  if (!qcNameNorm) return false;
  return Boolean(
    (userNameNorm && qcNameNorm === userNameNorm) ||
      (usernameNorm && qcNameNorm === usernameNorm)
  );
}

export function getM03Capabilities(
  user: M03UserLike | null | undefined,
  rolesList: any[] = []
): M03Capabilities {
  const empty: M03Capabilities = {
    canView: false,
    canViewAll: false,
    canCreate: false,
    canEditOwn: false,
    canEditAll: false,
    canDeleteOwn: false,
    canDeleteAll: false,
    canAssignQc: false,
    canReconcile: false,
    canExport: false,
    canImport: false,
    canInspectAny: false,
    canInspectAssigned: false,
    canViewInspections: false,
    isManagerial: false,
  };
  if (!user) return empty;

  const roleUpper = String(user.role || user.roleUpper || '').toUpperCase().trim();
  if (roleUpper === 'GUEST') return empty;

  const isAdmin = roleUpper === 'ADMIN';
  const isManager = roleUpper === 'MANAGER';
  const isQa = roleUpper === 'QA';
  const isQcLead = roleUpper === 'QC_LEAD' || Boolean(user.la_to_truong);
  const isQcInspector = roleUpper === 'QC_INSPECTOR' || roleUpper === 'QC';
  const isPurchasing = roleUpper === 'PURCHASING';
  const isVendor = roleUpper === 'VENDOR';
  const isManagerial = isAdmin || isManager || isQa || isQcLead;
  const isQcPersonnel = isManagerial || isQcInspector;

  if (isAdmin) {
    return {
      canView: true,
      canViewAll: true,
      canCreate: true,
      canEditOwn: true,
      canEditAll: true,
      canDeleteOwn: true,
      canDeleteAll: true,
      canAssignQc: true,
      canReconcile: true,
      canExport: true,
      canImport: true,
      canInspectAny: true,
      canInspectAssigned: true,
      canViewInspections: true,
      isManagerial: true,
    };
  }

  const perms = extractUserPermissionsList(user, rolesList);
  const allowedModules = extractAllowedModules(user, rolesList);

  const sysAdmin = perms.find((p) => String(p?.moduleId || '').toUpperCase() === 'SYSTEM_ADMIN');
  const sysActions: string[] = Array.isArray(sysAdmin?.actions)
    ? sysAdmin.actions.map((a: any) => String(a || '').toUpperCase().trim())
    : [];
  const hasSysView = sysActions.includes('VIEW') || sysActions.includes('VIEW_ALL');
  const hasSysCreate = sysActions.includes('CREATE');
  const hasSysEditAll = sysActions.includes('EDIT_ALL');
  const hasSysDeleteAll = sysActions.includes('DELETE_ALL');

  const bookingMatrix = perms.filter(
    (p) => String(p?.moduleId || '').toUpperCase() === 'SUBCONTRACTOR_BOOKING'
  );
  const hasAllowedModule = allowedModules.includes('SUBCONTRACTOR_BOOKING');

  let canView = false;
  let canViewAll = false;
  let canCreate = false;
  let canEditOwn = false;
  let canEditAll = false;
  let canDeleteOwn = false;
  let canDeleteAll = false;
  let canExport = false;
  let canImport = false;
  let hasSignPerm = false;

  if (bookingMatrix.length > 0) {
    const actions = new Set<string>();
    bookingMatrix.forEach((p) => {
      if (Array.isArray(p?.actions)) {
        p.actions.forEach((a: any) => actions.add(String(a || '').toUpperCase().trim()));
      }
    });

    hasSignPerm = actions.has('SIGN1') || actions.has('SIGN2');
    canViewAll =
      hasSysView ||
      actions.has('VIEW_ALL') ||
      actions.has('EDIT_ALL') ||
      actions.has('DELETE_ALL');
    canView = hasSysView || canViewAll || actions.has('VIEW');
    canCreate = canView && (hasSysCreate || actions.has('CREATE'));
    canEditAll = canView && (hasSysEditAll || actions.has('EDIT_ALL'));
    canEditOwn =
      canView &&
      (canEditAll || actions.has('EDIT_OWN') || actions.has('EDIT'));
    canDeleteAll = canView && (hasSysDeleteAll || actions.has('DELETE_ALL'));
    canDeleteOwn =
      canView &&
      (canDeleteAll || actions.has('DELETE_OWN') || actions.has('DELETE'));
    canExport = canView && actions.has('EXPORT');
    canImport = canView && actions.has('IMPORT');
  } else if (hasAllowedModule || hasSysView) {
    canView = true;
    canViewAll = isManagerial || isQcInspector || isPurchasing || hasSysView;
    canCreate =
      hasSysCreate || isManager || isQa || isQcLead || isPurchasing || isVendor;
    canEditAll = hasSysEditAll || isManager || isQa || isQcLead;
    canEditOwn =
      canEditAll || isPurchasing || isVendor;
    canDeleteAll = hasSysDeleteAll;
    canDeleteOwn =
      canDeleteAll || isManager || isQa || isQcLead || isPurchasing;
    canExport = isManager || isQa || isQcLead || isPurchasing;
    canImport = isManager || isQa;
  }

  // Confirmed Decision 2: QC Assignment, Return for Supplement & Reconcile belong to SIGN1/SIGN2 OR ADMIN/MANAGER/QA/QC_LEAD (la_to_truong)
  const canAssignQc = (canView && hasSignPerm) || (canView && isManagerial);
  const canReconcile = canAssignQc;

  // Inspection creation rights (SQC_MAT/SQC_VT, SQC_BTP, SQC_TP, INSPECTIONS, LIST)
  const hasAnySqcCreate =
    checkModuleActionPermission(user, rolesList, 'SQC_MAT', 'CREATE') ||
    checkModuleActionPermission(user, rolesList, 'SQC_VT', 'CREATE') ||
    checkModuleActionPermission(user, rolesList, 'SQC_BTP', 'CREATE') ||
    checkModuleActionPermission(user, rolesList, 'SQC_TP', 'CREATE') ||
    checkModuleActionPermission(user, rolesList, 'INSPECTIONS', 'CREATE') ||
    checkModuleActionPermission(user, rolesList, 'LIST', 'CREATE');

  const canInspectAny = canView && isManagerial && (hasAnySqcCreate || isManager || isQa || isQcLead);
  const canInspectAssigned = canView && isQcPersonnel && (hasAnySqcCreate || isManagerial);

  const canViewInspections =
    checkModuleActionPermission(user, rolesList, 'LIST', 'VIEW') ||
    checkModuleActionPermission(user, rolesList, 'INSPECTIONS', 'VIEW') ||
    checkModuleActionPermission(user, rolesList, 'SQC_MAT', 'VIEW') ||
    checkModuleActionPermission(user, rolesList, 'SQC_BTP', 'VIEW') ||
    checkModuleActionPermission(user, rolesList, 'SQC_TP', 'VIEW');

  return {
    canView,
    canViewAll,
    canCreate,
    canEditOwn,
    canEditAll,
    canDeleteOwn,
    canDeleteAll,
    canAssignQc,
    canReconcile,
    canExport,
    canImport,
    canInspectAny,
    canInspectAssigned,
    canViewInspections,
    isManagerial,
  };
}

export function canViewM03(
  user: M03UserLike | null | undefined,
  rolesList: any[] = []
): boolean {
  return getM03Capabilities(user, rolesList).canView;
}

export function canCreateM03(
  user: M03UserLike | null | undefined,
  rolesList: any[] = []
): boolean {
  return getM03Capabilities(user, rolesList).canCreate;
}

export function canReconcileM03(
  user: M03UserLike | null | undefined,
  rolesList: any[] = []
): boolean {
  return getM03Capabilities(user, rolesList).canReconcile;
}

export function canEditM03Booking(
  user: M03UserLike | null | undefined,
  booking: M03BookingLike | null | undefined,
  rolesList: any[] = []
): boolean {
  if (!user || !booking) return false;
  const st = String(booking.status || '').toUpperCase().trim();
  if (st === 'COMPLETED' || st === 'CANCELLED') return false;
  const caps = getM03Capabilities(user, rolesList);
  if (caps.canEditAll) return true;
  if (caps.canEditOwn && isBookingOwner(user, booking)) return true;
  return false;
}

export function canDeleteM03Booking(
  user: M03UserLike | null | undefined,
  booking: M03BookingLike | null | undefined,
  rolesList: any[] = []
): boolean {
  if (!user || !booking) return false;
  const st = String(booking.status || '').toUpperCase().trim();
  if (st === 'COMPLETED') return false;
  const caps = getM03Capabilities(user, rolesList);
  if (caps.canDeleteAll) return true;
  if (caps.canDeleteOwn && isBookingOwner(user, booking)) return true;
  return false;
}

export function canAssignM03Booking(
  user: M03UserLike | null | undefined,
  booking: M03BookingLike | null | undefined,
  rolesList: any[] = []
): boolean {
  if (!user || !booking) return false;
  const st = String(booking.status || '').toUpperCase().trim();
  if (st === 'COMPLETED' || st === 'CANCELLED') return false;
  return getM03Capabilities(user, rolesList).canAssignQc;
}

export function canManualOverrideM03Booking(
  user: M03UserLike | null | undefined,
  booking: M03BookingLike | null | undefined,
  rolesList: any[] = []
): boolean {
  if (!user || !booking) return false;
  const st = String(booking.status || '').toUpperCase().trim();
  if (st === 'COMPLETED' || st === 'CANCELLED') return false;
  return getM03Capabilities(user, rolesList).canAssignQc;
}

export function canInspectM03Booking(
  user: M03UserLike | null | undefined,
  booking: M03BookingLike | null | undefined,
  rolesList: any[] = []
): boolean {
  if (!user || !booking) return false;
  const st = String(booking.status || '').toUpperCase().trim();
  if (st === 'COMPLETED' || st === 'CANCELLED') return false;

  const caps = getM03Capabilities(user, rolesList);
  if (!caps.canView) return false;

  const roleUpper = String(user.role || user.roleUpper || '').toUpperCase().trim();
  if (roleUpper === 'ADMIN') return true;

  const mappedModule = mapSqcTypeToModuleId(booking.sqcType);
  const rawSqc = String(booking.sqcType || 'SQC_BTP').toUpperCase().trim();
  const hasSpecificSqcCreate =
    checkModuleActionPermission(user, rolesList, mappedModule, 'CREATE') ||
    (rawSqc !== mappedModule && checkModuleActionPermission(user, rolesList, rawSqc, 'CREATE')) ||
    checkModuleActionPermission(user, rolesList, 'INSPECTIONS', 'CREATE') ||
    checkModuleActionPermission(user, rolesList, 'LIST', 'CREATE');

  if (caps.isManagerial && (hasSpecificSqcCreate || roleUpper === 'MANAGER' || roleUpper === 'QA' || roleUpper === 'QC_LEAD' || Boolean(user.la_to_truong))) {
    return true;
  }

  const isQcRole = roleUpper === 'QC_INSPECTOR' || roleUpper === 'QC';
  if (!isQcRole || !hasSpecificSqcCreate) {
    return false;
  }

  const hasAssignedQc = Boolean(
    String(booking.assignedQcId || '').trim() || String(booking.assignedQcName || '').trim()
  );
  if (hasAssignedQc) {
    return isAssignedQcForBooking(user, booking);
  }
  return true;
}

export function canViewM03RelatedSqc(
  user: M03UserLike | null | undefined,
  reportType?: string | null,
  rolesList: any[] = []
): boolean {
  if (!user) return false;
  const roleUpper = String(user.role || user.roleUpper || '').toUpperCase().trim();
  if (roleUpper === 'ADMIN') return true;
  const sqcModule = mapSqcTypeToModuleId(reportType);
  return (
    checkModuleActionPermission(user, rolesList, 'LIST', 'VIEW') ||
    checkModuleActionPermission(user, rolesList, 'INSPECTIONS', 'VIEW') ||
    checkModuleActionPermission(user, rolesList, sqcModule, 'VIEW') ||
    (reportType ? checkModuleActionPermission(user, rolesList, String(reportType).toUpperCase(), 'VIEW') : false)
  );
}

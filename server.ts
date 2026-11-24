import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { fileURLToPath } from 'url';
import * as dbService from './services/dbService.js';
import * as dbMod from './services/dbModuleService.js';
import * as storageService from './services/storageService.js';
import { runMigrations } from './services/migrationService.js';
import { backfillTraceabilityIndex } from './services/traceabilityIndexService.js';
import {
  getM03Capabilities,
  canViewM03,
  canCreateM03,
  canReconcileM03,
  canEditM03Booking,
  canDeleteM03Booking,
  canAssignM03Booking,
  canManualOverrideM03Booking,
  canInspectM03Booking,
  canViewM03RelatedSqc,
} from './src/utils/m03Rbac.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOAD_DIR = storageService.UPLOAD_DIR;

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use('/uploads', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  next();
}, express.static(UPLOAD_DIR), (_req, res) => {
  res.status(404).json({ error: 'Uploaded file not found' });
});

// Attach JWT user context, enforce authentication on protected routes, & capture all API errors (>= 400) for System Audit
const isPublicApiRoute = (method: string, pathUrl: string): boolean => {
  const cleanPath = (pathUrl || '').split('?')[0];
  if (method === 'GET' && cleanPath === '/api/health') return true;
  if (method === 'POST' && (cleanPath === '/api/auth/login' || cleanPath === '/api/auth/forgot-password' || cleanPath === '/api/auth/reset-password')) return true;
  if (method === 'GET' && cleanPath.startsWith('/api/public/inspections/')) return true;
  if (method === 'GET' && (cleanPath === '/api/proxy-image' || cleanPath === '/api/images/proxy')) return true;
  if (method === 'GET' && (cleanPath.startsWith('/api/media/image') || cleanPath.startsWith('/api/image') || cleanPath.startsWith('/api/media/') || cleanPath.startsWith('/display-image') || cleanPath.startsWith('/media/stream'))) return true;
  if ((method === 'PUT' || method === 'POST') && cleanPath === '/api/storage/upload') return true;
  if (method === 'GET' && cleanPath.startsWith('/api/storage/files/')) return true;
  if (method === 'POST' && cleanPath === '/api/system/audit-errors') return true;
  return false;
};

app.use('/api', async (req: any, res, next) => {
  const start = Date.now();

  let capturedErrorMsg = '';
  const origJson = res.json.bind(res);
  res.json = ((body: any) => {
    if (res.statusCode >= 400 && body && typeof body === 'object') {
      capturedErrorMsg = String(body.error || body.message || body.details || '');
    }
    return origJson(body);
  }) as any;

  const origSend = res.send.bind(res);
  res.send = ((body: any) => {
    if (res.statusCode >= 400 && !capturedErrorMsg) {
      capturedErrorMsg = typeof body === 'string' ? body.slice(0, 300) : '';
    }
    return origSend(body);
  }) as any;

  res.on('finish', () => {
    if (res.statusCode >= 400) {
      const fullPath = req.originalUrl || req.url;
      // Avoid feedback loop if audit-errors endpoint itself is polled
      if (fullPath.startsWith('/api/system/audit-errors') && req.method === 'GET') {
        return;
      }
      const mod = dbMod.resolveModuleFromPath(fullPath);
      dbMod.recordApiErrorLog({
        moduleId: mod.moduleId,
        moduleName: mod.moduleName,
        method: req.method,
        path: fullPath,
        statusCode: res.statusCode,
        errorMessage: capturedErrorMsg || `HTTP ${res.statusCode} ${res.statusMessage || ''}`.trim(),
        userId: req.authUser?.id || req.user?.id || req.user?.username || null,
        durationMs: Date.now() - start,
        details: {
          query: req.query && Object.keys(req.query).length > 0 ? req.query : undefined,
          ip: req.ip || req.socket?.remoteAddress || undefined,
        },
      }).catch(() => {});
    }
  });

  try {
    const decoded = dbMod.verifyJwtToken(req.headers?.authorization);
    if (decoded) {
      const liveUser = await dbMod.getAuthenticatedUserContext(decoded?.id || decoded?.username);
      if (liveUser) {
        req.authUser = liveUser;
        req.user = liveUser;
      }
    }

    if (!isPublicApiRoute(req.method, req.originalUrl || req.url)) {
      if (!req.authUser) {
        return res.status(401).json({
          error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.',
        });
      }
    }

    next();
  } catch (err) {
    next(err);
  }
});

const getActorId = (req: any): string | null => req.authUser?.id || req.user?.id || req.user?.username || null;

const requireAdmin = (req: any, res: any, next: any) => {
  if (!req.authUser || !dbMod.isServerAdmin(req.authUser)) {
    return res.status(403).json({ error: 'Từ chối truy cập: Yêu cầu quyền Quản trị viên (ADMIN).' });
  }
  return next();
};

const requireTrashAccess = (req: any, res: any, next: any) => {
  if (
    !req.authUser ||
    (!dbMod.isServerAdmin(req.authUser) &&
      !dbMod.hasServerPermission(req.authUser, 'INSPECTIONS', 'DELETE') &&
      !dbMod.hasServerPermission(req.authUser, 'TRASH', 'VIEW'))
  ) {
    return res.status(403).json({ error: 'Từ chối truy cập: Bạn không có quyền thao tác với Thùng rác (M12).' });
  }
  return next();
};

const sendErr = (res: any, err: any, fallbackStatus = 500) => {
  const status = err?.statusCode && Number.isInteger(err.statusCode) ? err.statusCode : fallbackStatus;
  return res.status(status).json({ error: err?.message || 'Internal Server Error' });
};

// --- M00: HEALTH & AUTH ENDPOINTS ---
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '3.1.0', timestamp: Date.now() });
});

app.get('/api/public/inspections/:id', async (req, res) => {
  try {
    const inspection = await dbService.getPublicInspectionShareById(req.params.id);
    if (!inspection) {
      return res.status(404).json({ error: 'Inspection not found' });
    }
    res.json({ inspection: storageService.signPublicMediaUrls(inspection, 3600) });
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.get('/api/public/inspections/:id/traceability', async (req, res) => {
  try {
    const bundle = await dbService.resolveTraceability({
      inspectionId: req.params.id,
      isPublic: true,
    });
    if (!bundle) {
      return res.status(404).json({ error: 'Inspection not found' });
    }
    res.json(storageService.signPublicMediaUrls(bundle, 3600));
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const result = await dbMod.authenticateUser(req.body?.username, req.body?.password, {
      ip: req.ip || req.socket?.remoteAddress,
      userAgent: req.headers['user-agent'],
    });
    res.json(result);
  } catch (err: any) {
    sendErr(res, err, 401);
  }
});

app.post('/api/auth/change-password', async (req: any, res) => {
  try {
    const userId = req.authUser?.id;
    if (!userId) return res.status(401).json({ error: 'Vui lòng đăng nhập để đổi mật khẩu' });
    const result = await dbMod.changeUserPassword(userId, req.body?.currentPassword, req.body?.newPassword);
    res.json(result);
  } catch (err: any) {
    sendErr(res, err, 400);
  }
});

app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const result = await dbMod.requestPasswordReset(req.body?.email);
    res.json(result);
  } catch (err: any) {
    sendErr(res, err, 400);
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const result = await dbMod.confirmPasswordReset(req.body?.email, req.body?.code, req.body?.newPassword);
    res.json(result);
  } catch (err: any) {
    sendErr(res, err, 400);
  }
});

// --- M01: DASHBOARD ---
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const stats = await dbService.getDashboardStats(req.query);
    res.json(stats);
  } catch (err: any) {
    sendErr(res, err);
  }
});

// --- M02: PROJECTS, DOCUMENTS, FLOOR PLANS & PINS ---
app.get('/api/projects', async (req, res) => {
  try {
    const search = String(req.query.search || '');
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = parseInt(req.query.limit as string || '500', 10);
    const result = await dbMod.getProjectsList(search, page, limit);
    res.json(result);
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.get('/api/projects/:projectId/documents', async (req, res) => {
  try {
    const docs = await dbMod.getProjectDocuments(req.params.projectId);
    res.json(docs);
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.post('/api/projects/documents', async (req: any, res) => {
  try {
    const doc = await dbMod.saveProjectDocument(req.body, getActorId(req));
    res.json(doc);
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.delete('/api/projects/documents/:id', async (req: any, res) => {
  try {
    const result = await dbMod.deleteProjectDocument(req.params.id, getActorId(req));
    res.json(result);
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.get('/api/projects/:code', async (req, res) => {
  try {
    const project = await dbMod.getProjectByCode(req.params.code);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json(project);
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.put('/api/projects/:id', async (req: any, res) => {
  try {
    const updated = await dbMod.updateProjectRecord(req.params.id, req.body, getActorId(req));
    res.json(updated);
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.get('/api/floor-plans', async (req, res) => {
  try {
    const projectId = String(req.query.projectId || '');
    const plans = await dbMod.getFloorPlans(projectId);
    res.json(plans);
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.post('/api/floor-plans', async (req: any, res) => {
  try {
    const plan = await dbMod.saveFloorPlan(req.body, getActorId(req));
    res.json(plan);
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.delete('/api/floor-plans/:id', async (req: any, res) => {
  try {
    const result = await dbMod.deleteFloorPlan(req.params.id, getActorId(req));
    res.json(result);
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.get('/api/layout-pins', async (req, res) => {
  try {
    const floorPlanId = String(req.query.floorPlanId || '');
    const pins = await dbMod.getLayoutPins(floorPlanId);
    res.json(pins);
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.post('/api/layout-pins', async (req: any, res) => {
  try {
    const pin = await dbMod.saveLayoutPin(req.body, getActorId(req));
    res.json(pin);
  } catch (err: any) {
    sendErr(res, err);
  }
});

// --- M03: SUBCONTRACTOR BOOKINGS & PO-MATERIAL LOOKUP (RBAC ENFORCED) ---
const requireM03View = (req: any, res: any, next: any) => {
  if (!req.authUser || !canViewM03(req.authUser)) {
    return res.status(403).json({
      error: 'Từ chối truy cập: Bạn không có quyền xem module Lịch nghiệm thu (M03).',
    });
  }
  return next();
};

const requireM03Reconcile = (req: any, res: any, next: any) => {
  if (!req.authUser || !canReconcileM03(req.authUser)) {
    return res.status(403).json({
      error: 'Từ chối truy cập: Chỉ ADMIN, MANAGER, QA, QC_LEAD hoặc tài khoản có quyền SIGN1/SIGN2 mới được đối chiếu lịch nghiệm thu.',
    });
  }
  return next();
};

app.get('/api/subcontractor-bookings', requireM03View, async (req, res) => {
  try {
    const bookings = await dbService.getSubcontractorBookings(req.query);
    res.json({ bookings: storageService.signPublicMediaUrls(bookings, 86400) });
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.post('/api/subcontractor-bookings', async (req: any, res) => {
  try {
    const caps = getM03Capabilities(req.authUser);
    if (!caps.canCreate) {
      return res.status(403).json({
        error: 'Từ chối truy cập: Bạn không có quyền tạo mới Lịch nghiệm thu (CREATE).',
      });
    }

    const payload = { ...(req.body || {}) };
    if (!caps.canAssignQc) {
      payload.status = 'PENDING';
      payload.assignedQcId = null;
      payload.assignedQcName = null;
    }
    if (!caps.canEditAll && !caps.isManagerial) {
      payload.requesterId = req.authUser.id;
      payload.requesterName = req.authUser.name || req.authUser.username || payload.requesterName;
    }

    const booking = await dbService.createSubcontractorBooking(payload, getActorId(req));
    res.json(storageService.signPublicMediaUrls(booking, 86400));
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.post('/api/subcontractor-bookings/reconcile', requireM03Reconcile, async (_req, res) => {
  try {
    const result = await dbService.reconcileSubcontractorBookings();
    res.json(result);
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.get('/api/subcontractor-bookings/:id/related-sqc', requireM03View, async (req, res) => {
  try {
    const result = await dbService.getRelatedSqcInspectionsForBooking(req.params.id);
    res.json(result);
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.get('/api/subcontractor-bookings/:id', requireM03View, async (req, res) => {
  try {
    const booking = await dbService.getSubcontractorBookingById(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Not found' });
    res.json(storageService.signPublicMediaUrls(booking, 86400));
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.post('/api/subcontractor-bookings/:id/manual-status', async (req: any, res) => {
  try {
    const existing = await dbService.getSubcontractorBookingById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Không tìm thấy phiếu Book QC để gán trạng thái thủ công.' });
    }

    const caps = getM03Capabilities(req.authUser);
    if (!caps.canAssignQc) {
      return res.status(403).json({
        error: 'Từ chối truy cập: Chỉ Tổ trưởng QC, QA, MANAGER, ADMIN hoặc tài khoản có quyền SIGN1/SIGN2 mới được gán trạng thái thủ công.',
      });
    }

    if (!canManualOverrideM03Booking(req.authUser, existing)) {
      return res.status(403).json({
        error: 'Phiếu Book QC đã hoàn thành (COMPLETED) hoặc đã hủy (CANCELLED), không thể gán trạng thái thủ công.',
      });
    }

    const body = req.body || {};
    const result = String(body.result || '').toUpperCase().trim();
    const reason = String(body.reason || '').trim();
    const sqcCode = body.sqcCode !== undefined ? String(body.sqcCode || '').trim() : undefined;
    const version = body.version !== undefined ? Number(body.version) : undefined;

    if (result !== 'PASS' && result !== 'FAIL') {
      return res.status(400).json({ error: 'Vui lòng chọn kết quả hợp lệ (PASS hoặc FAIL).' });
    }
    if (!reason || reason.length > 1000) {
      return res.status(400).json({ error: 'Vui lòng nhập lý do gán trạng thái thủ công (tối đa 1000 ký tự).' });
    }
    if (sqcCode && sqcCode.length > 120) {
      return res.status(400).json({ error: 'Mã phiếu SQC tham chiếu tối đa 120 ký tự.' });
    }
    if (version !== undefined && !Number.isFinite(version)) {
      return res.status(400).json({ error: 'Giá trị version không hợp lệ.' });
    }

    const updated = await dbService.manualOverrideSubcontractorBookingStatus(
      req.params.id,
      {
        result: result as 'PASS' | 'FAIL',
        reason,
        sqcCode,
        version,
      },
      req.authUser
    );

    res.json(storageService.signPublicMediaUrls(updated, 86400));
  } catch (err: any) {
    sendErr(res, err);
  }
});

const handleUpdateBooking = async (req: any, res: any) => {
  try {
    const existing = await dbService.getSubcontractorBookingById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Không tìm thấy phiếu Book QC để cập nhật' });
    }

    const body = req.body || {};
    const caps = getM03Capabilities(req.authUser);
    const existingStatus = String(existing.status || '').toUpperCase().trim();
    const hasStatusChange =
      body.status !== undefined &&
      String(body.status || '').toUpperCase().trim() !== existingStatus;
    const nextStatus = hasStatusChange
      ? String(body.status || '').toUpperCase().trim()
      : existingStatus;

    const assignKeys = [
      'assignedQcId',
      'assignedQcName',
      'rejectionReason',
      'suggestedDate',
      'rejectedAt',
      'rejectedByName',
    ];
    const hasAssignChanges =
      assignKeys.some((k) => body[k] !== undefined) ||
      (hasStatusChange && (nextStatus === 'ASSIGNED' || nextStatus === 'RETURNED_FOR_SUPPLEMENT'));

    const contentKeys = [
      'sqcType',
      'poId',
      'poNumber',
      'supplierId',
      'supplierName',
      'locationAddress',
      'contactPerson',
      'contactPhone',
      'requestedDate',
      'notes',
      'items',
      'documents',
      'commodityLine',
    ];
    const hasContentChanges = contentKeys.some((k) => body[k] !== undefined);

    if (existingStatus === 'COMPLETED') {
      return res.status(403).json({
        error: 'Từ chối cập nhật: Phiếu Book QC đã hoàn thành nghiệm thu (COMPLETED) và bị khóa chỉnh sửa.',
      });
    }

    if (hasAssignChanges) {
      if (!canAssignM03Booking(req.authUser, existing)) {
        return res.status(403).json({
          error:
            existingStatus === 'CANCELLED'
              ? 'Không thể phân công QC hoặc phản hồi cho phiếu Book QC đã hủy.'
              : 'Từ chối truy cập: Bạn không có quyền Phân công QC hoặc Trả lại yêu cầu bổ sung (yêu cầu SIGN1/SIGN2 hoặc ADMIN/MANAGER/QA/QC_LEAD).',
        });
      }
    }

    if (hasContentChanges) {
      if (existingStatus === 'CANCELLED') {
        return res.status(403).json({
          error: 'Từ chối sửa: Phiếu Book QC đã bị hủy (CANCELLED), không thể chỉnh sửa nội dung.',
        });
      }
      if (!canEditM03Booking(req.authUser, existing)) {
        return res.status(403).json({
          error: 'Từ chối truy cập: Bạn không có quyền sửa thông tin phiếu Book QC này (cần EDIT_ALL hoặc EDIT_OWN trên phiếu do mình tạo).',
        });
      }
    }

    if (hasStatusChange) {
      if (existingStatus === 'CANCELLED' && !caps.isManagerial) {
        return res.status(403).json({
          error: 'Từ chối truy cập: Phiếu Book QC đã hủy chỉ cấp Quản lý mới có thể khôi phục trạng thái.',
        });
      }
      if (nextStatus === 'IN_PROGRESS' || nextStatus === 'COMPLETED') {
        if (!canInspectM03Booking(req.authUser, existing) && !caps.canAssignQc) {
          return res.status(403).json({
            error: 'Từ chối truy cập: Bạn không có quyền cập nhật trạng thái nghiệm thu cho phiếu Book QC này.',
          });
        }
      } else if (nextStatus === 'CANCELLED') {
        if (
          !canEditM03Booking(req.authUser, existing) &&
          !canDeleteM03Booking(req.authUser, existing) &&
          !caps.canAssignQc
        ) {
          return res.status(403).json({
            error: 'Từ chối truy cập: Bạn không có quyền hủy phiếu Book QC này.',
          });
        }
      } else if (nextStatus !== 'ASSIGNED' && nextStatus !== 'RETURNED_FOR_SUPPLEMENT') {
        if (!caps.canAssignQc && !canEditM03Booking(req.authUser, existing)) {
          return res.status(403).json({
            error: 'Từ chối truy cập: Bạn không có quyền thay đổi trạng thái phiếu Book QC này.',
          });
        }
      }
    }

    if (!hasAssignChanges && !hasContentChanges && !hasStatusChange) {
      if (!canEditM03Booking(req.authUser, existing) && !canAssignM03Booking(req.authUser, existing)) {
        return res.status(403).json({
          error: 'Từ chối truy cập: Bạn không có quyền cập nhật phiếu Book QC này.',
        });
      }
    }

    const updated = await dbService.updateSubcontractorBooking(req.params.id, body, getActorId(req));
    res.json(storageService.signPublicMediaUrls(updated, 86400));
  } catch (err: any) {
    sendErr(res, err);
  }
};
app.patch('/api/subcontractor-bookings/:id', handleUpdateBooking);
app.put('/api/subcontractor-bookings/:id', handleUpdateBooking);

app.delete('/api/subcontractor-bookings/:id', async (req: any, res) => {
  try {
    const existing = await dbService.getSubcontractorBookingById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Không tìm thấy phiếu Book QC để xóa.' });
    }
    if (String(existing.status || '').toUpperCase().trim() === 'COMPLETED') {
      return res.status(403).json({
        error: 'Từ chối xóa: Phiếu Book QC đã hoàn thành nghiệm thu (COMPLETED) là hồ sơ bất biến, không được phép xóa.',
      });
    }
    if (!canDeleteM03Booking(req.authUser, existing)) {
      return res.status(403).json({
        error: 'Từ chối truy cập: Bạn không có quyền xóa phiếu Book QC này (cần DELETE_ALL hoặc DELETE_OWN trên phiếu do mình tạo).',
      });
    }
    const success = await dbService.deleteSubcontractorBooking(req.params.id, getActorId(req));
    res.json({ success });
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.get('/api/po-materials/lookup', async (req: any, res) => {
  try {
    const canLookup =
      canViewM03(req.authUser) ||
      canCreateM03(req.authUser) ||
      dbMod.hasServerPermission(req.authUser, 'MATERIALS', 'VIEW') ||
      dbMod.hasServerPermission(req.authUser, 'IPO', 'VIEW') ||
      dbMod.hasServerPermission(req.authUser, 'LIST', 'VIEW') ||
      dbMod.hasServerPermission(req.authUser, 'INSPECTIONS', 'VIEW');
    if (!canLookup) {
      return res.status(403).json({
        error: 'Từ chối truy cập: Bạn không có quyền tra cứu vật tư PO / IPO.',
      });
    }
    const q = String(req.query.q || '');
    const exactFlag = String(req.query.exact || '').trim().toLowerCase();
    const exact = exactFlag === '1' || exactFlag === 'true';
    const result = await dbService.lookupPoMaterials(q, { exact });
    res.json(result);
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.get('/api/subcontractor-inspections', requireM03View, async (_req, res) => {
  try {
    const result = await dbService.getSubcontractorInspections();
    res.json(result);
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.get('/api/subcontractor-reinspection-costs', requireM03View, async (_req, res) => {
  try {
    const result = await dbService.getSubcontractorReinspectionCosts();
    res.json(result);
  } catch (err: any) {
    sendErr(res, err);
  }
});

// --- M04: SUPPLIERS ---
app.get('/api/suppliers/find-by-name', async (req, res) => {
  try {
    const name = String(req.query.name || '');
    const supplier = await dbService.findSupplierByNameOrCode(name);
    res.json({ supplier });
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.get('/api/suppliers', async (req, res) => {
  try {
    const search = String(req.query.search || '');
    const limit = parseInt(req.query.limit as string || '200', 10);
    const result = await dbService.getSuppliers(search, limit);
    res.json(result);
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.post('/api/suppliers', async (req: any, res) => {
  try {
    const supplier = await dbService.upsertSupplier(req.body, getActorId(req));
    res.json({ success: true, supplier });
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.delete('/api/suppliers/:id', async (req: any, res) => {
  try {
    const result = await dbMod.softDeleteSupplierRecord(req.params.id, getActorId(req));
    res.json(result);
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.post('/api/suppliers/sync-from-bookings', async (_req, res) => {
  try {
    const result = await dbService.syncSuppliersFromBookings();
    res.json(result);
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.get('/api/suppliers/stats', async (req, res) => {
  try {
    const name = String(req.query.name || '');
    const stats = await dbService.getSupplierStats(name);
    res.json(stats);
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.get('/api/suppliers/inspections', async (req, res) => {
  try {
    const name = String(req.query.name || '');
    const items = await dbService.getSupplierInspections(name);
    res.json({ items });
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.get('/api/suppliers/materials', async (req, res) => {
  try {
    const name = String(req.query.name || '');
    const items = await dbService.getSupplierMaterials(name);
    res.json({ items });
  } catch (err: any) {
    sendErr(res, err);
  }
});

// --- M05 & M12: INSPECTIONS & TRASH ---
app.get('/api/inspections', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = parseInt(req.query.limit as string || '200', 10);
    const result = await dbService.getInspectionsList(req.query, page, limit);
    res.json(result);
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.get('/api/inspections/dates', async (req, res) => {
  try {
    const dates = await dbService.getInspectionsDates(req.query);
    res.json(dates);
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.get('/api/inspections/projects', async (req, res) => {
  try {
    const projects = await dbService.getInspectionsProjects(req.query);
    res.json(projects);
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.get('/api/inspections/deleted', requireTrashAccess, async (_req, res) => {
  try {
    const items = await dbMod.getDeletedInspectionsList();
    res.json(items);
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.post('/api/inspections/sync', async (_req, res) => {
  try {
    const result = await dbService.syncMissingInspectionsFromForms();
    res.json({ success: true, ...result });
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.post('/api/inspections', async (req: any, res) => {
  try {
    const result = await dbMod.upsertInspectionRecord(req.body, getActorId(req), req.authUser);
    res.json(result);
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.get('/api/inspections/:id', async (req, res) => {
  try {
    const inspection = await dbService.getInspectionById(req.params.id);
    if (!inspection) {
      return res.status(404).json({ error: 'Inspection not found' });
    }
    res.json({ inspection: storageService.signPublicMediaUrls(inspection, 86400) });
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.delete('/api/inspections/:id', async (req: any, res) => {
  try {
    const canDel =
      dbMod.isServerAdmin(req.authUser) ||
      dbMod.hasServerPermission(req.authUser, 'INSPECTIONS', 'DELETE') ||
      dbMod.hasServerPermission(req.authUser, 'INSPECTIONS', 'EDIT');
    if (!canDel) {
      return res.status(403).json({ error: 'Bạn không có quyền xóa phiếu kiểm tra.' });
    }
    const result = await dbMod.softDeleteInspectionRecord(req.params.id, getActorId(req));
    res.json(result);
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.post('/api/inspections/:id/restore', requireTrashAccess, async (req: any, res) => {
  try {
    const result = await dbMod.restoreInspectionRecord(req.params.id, getActorId(req));
    res.json(result);
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.delete('/api/inspections/:id/permanent', requireAdmin, async (req: any, res) => {
  try {
    const result = await dbMod.permanentDeleteInspectionRecord(req.params.id, getActorId(req));
    res.json(result);
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.get('/api/inspections/:id/related-bookings', async (req: any, res) => {
  try {
    if (!canViewM03(req.authUser) && !canViewM03RelatedSqc(req.authUser)) {
      return res.status(403).json({
        error: 'Từ chối truy cập: Bạn không có quyền xem liên kết Booking QC của phiếu kiểm tra.',
      });
    }
    const result = await dbService.getRelatedBookingsForInspection(req.params.id);
    res.json(result);
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.get('/api/inspections/:id/traceability', async (req, res) => {
  try {
    const bundle = await dbService.resolveTraceability({
      inspectionId: req.params.id,
      isPublic: false,
    });
    if (!bundle) {
      return res.status(404).json({ error: 'Inspection not found' });
    }
    res.json(bundle);
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.get('/api/traceability', async (req, res) => {
  try {
    const bundle = await dbService.resolveTraceability({
      inspectionId: req.query.inspectionId ? String(req.query.inspectionId) : undefined,
      ipo: req.query.ipo ? String(req.query.ipo) : undefined,
      po: req.query.po ? String(req.query.po) : undefined,
      pr: req.query.pr ? String(req.query.pr) : undefined,
      q: req.query.q ? String(req.query.q) : undefined,
      isPublic: false,
    });
    if (!bundle) {
      return res.status(404).json({ error: 'Traceability record not found' });
    }
    res.json(bundle);
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.get('/api/inspections/:id/audit-logs', async (req, res) => {
  try {
    const logs = await dbService.getInspectionAuditLogs(req.params.id);
    res.json(logs);
  } catch (err: any) {
    sendErr(res, err);
  }
});

// --- M06: NCR & DEFECT TRACKER ---
app.get('/api/ncrs', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = parseInt(req.query.limit as string || '50', 10);
    const result = await dbService.getNcrs(req.query, page, limit);
    res.json(result);
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.get('/api/ncrs/:id', async (req, res) => {
  try {
    const ncr = await dbService.getNcrById(req.params.id);
    if (!ncr) return res.status(404).json({ error: 'NCR not found' });
    res.json(ncr);
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.post('/api/ncrs', async (req: any, res) => {
  try {
    const ncr = await dbService.upsertNcr(req.body, getActorId(req), req.authUser);
    res.json(ncr);
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.delete('/api/ncrs/:id', async (req: any, res) => {
  try {
    const canDel =
      dbMod.isServerAdmin(req.authUser) ||
      dbMod.hasServerPermission(req.authUser, 'NCR_LIST', 'DELETE') ||
      dbMod.hasServerPermission(req.authUser, 'NCR_LIST', 'EDIT');
    if (!canDel) {
      return res.status(403).json({ error: 'Bạn không có quyền xóa báo cáo NCR.' });
    }
    const success = await dbService.deleteNcr(req.params.id, getActorId(req));
    res.json({ success });
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.get('/api/defects', async (req, res) => {
  try {
    const result = await dbMod.getDefectsList({ status: String(req.query.status || 'ALL') });
    res.json(result);
  } catch (err: any) {
    sendErr(res, err);
  }
});

// --- M07: DEFECT LIBRARY ---
app.get('/api/defect-library', async (_req, res) => {
  try {
    const items = await dbMod.getDefectLibraryList();
    res.json(items);
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.post('/api/defect-library', async (req: any, res) => {
  try {
    const item = await dbMod.saveDefectLibraryRecord(req.body, getActorId(req));
    res.json(item);
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.delete('/api/defect-library/:id', async (req: any, res) => {
  try {
    const result = await dbMod.softDeleteDefectLibraryRecord(req.params.id, getActorId(req));
    res.json(result);
  } catch (err: any) {
    sendErr(res, err);
  }
});

// --- M08: MATERIALS (100% READ-ONLY) ---
app.get('/api/materials', async (req, res) => {
  try {
    const search = String(req.query.search || '');
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = parseInt(req.query.limit as string || '50', 10);
    const result = await dbMod.getMaterialsReadOnly(search, page, limit);
    res.json(result);
  } catch (err: any) {
    sendErr(res, err);
  }
});

const readOnlyMaterialGuard = (_req: any, res: any) => {
  res.status(403).json({
    error: 'Vi phạm quy tắc READ-ONLY: Bảng nguyên vật liệu (material) đồng bộ từ ERP là chỉ đọc, không được phép INSERT/UPDATE/DELETE từ QMS.',
  });
};
app.post('/api/materials', readOnlyMaterialGuard);
app.put('/api/materials/:id', readOnlyMaterialGuard);
app.delete('/api/materials/:id', readOnlyMaterialGuard);
app.post('/api/import/materials', readOnlyMaterialGuard);

// --- M09: TOOL MANAGEMENT ---
const getToolsExplicitActions = (userCtx: any): string[] | null => {
  const perms: any[] = Array.isArray(userCtx?.userPermissions) ? userCtx.userPermissions : [];
  const matched = perms.filter((p) => String(p?.moduleId || '').toUpperCase().trim() === 'TOOLS');
  if (matched.length === 0) return null;
  const actions: string[] = [];
  for (const m of matched) {
    if (Array.isArray(m?.actions)) {
      for (const a of m.actions) actions.push(String(a || '').toUpperCase().trim());
    }
  }
  return actions;
};

const canManageTools = (userCtx: any): boolean => {
  if (!userCtx) return false;
  const roleUpper = String(userCtx.role || userCtx.roleUpper || '').toUpperCase().trim();
  if (roleUpper === 'GUEST') return false;
  if (dbMod.isServerAdmin(userCtx)) return true;
  if (
    dbMod.hasServerPermission(userCtx, 'SYSTEM_ADMIN', 'CREATE') ||
    dbMod.hasServerPermission(userCtx, 'SYSTEM_ADMIN', 'EDIT')
  ) {
    return true;
  }
  if (['MANAGER', 'QA', 'QC_LEAD', 'LEAD_QC'].includes(roleUpper) || Boolean(userCtx.la_to_truong)) {
    return true;
  }
  const explicitTools = getToolsExplicitActions(userCtx);
  if (explicitTools !== null) {
    return explicitTools.some((a) =>
      ['CREATE', 'EDIT', 'EDIT_ALL', 'DELETE', 'DELETE_ALL', 'SIGN1', 'SIGN2'].includes(a)
    );
  }
  return false;
};

const canViewTools = (userCtx: any): boolean => {
  if (!userCtx) return false;
  const roleUpper = String(userCtx.role || userCtx.roleUpper || '').toUpperCase().trim();
  if (roleUpper === 'GUEST') return false;
  if (canManageTools(userCtx)) return true;
  const explicitTools = getToolsExplicitActions(userCtx);
  if (explicitTools !== null) {
    return explicitTools.some((a) => ['VIEW', 'VIEW_ALL'].includes(a));
  }
  if (['PURCHASING', 'VENDOR'].includes(roleUpper)) return false;
  return dbMod.hasServerPermission(userCtx, 'TOOLS', 'VIEW');
};

const canDeleteTools = (userCtx: any): boolean => {
  if (!userCtx) return false;
  if (dbMod.isServerAdmin(userCtx)) return true;
  if (dbMod.hasServerPermission(userCtx, 'SYSTEM_ADMIN', 'DELETE')) return true;
  const explicitTools = getToolsExplicitActions(userCtx);
  if (explicitTools !== null) {
    return explicitTools.some((a) => ['DELETE', 'DELETE_ALL'].includes(a));
  }
  return false;
};

app.get('/api/tool-catalogs', async (req: any, res) => {
  try {
    if (!canViewTools(req.authUser)) {
      return res.status(403).json({ error: 'Từ chối truy cập: Bạn không có quyền xem dữ liệu Công cụ dụng cụ (M09).' });
    }
    res.json(await dbService.getToolCatalogs());
  } catch (err: any) {
    sendErr(res, err);
  }
});
app.post('/api/tool-catalogs', async (req: any, res) => {
  try {
    if (!canManageTools(req.authUser)) {
      return res.status(403).json({ error: 'Từ chối truy cập: Chỉ Quản lý CCDC mới có quyền tạo hoặc chỉnh sửa danh mục kho tổng.' });
    }
    res.json(await dbService.saveToolCatalog(req.body, getActorId(req)));
  } catch (err: any) {
    sendErr(res, err);
  }
});
app.delete('/api/tool-catalogs/:id', async (req: any, res) => {
  try {
    if (!canDeleteTools(req.authUser)) {
      return res.status(403).json({ error: 'Từ chối truy cập: Chỉ Admin hoặc tài khoản được cấp quyền xóa CCDC mới có thể xóa danh mục.' });
    }
    res.json(await dbService.deleteToolCatalog(req.params.id, getActorId(req)));
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.get('/api/tool-assets', async (req: any, res) => {
  try {
    if (!canViewTools(req.authUser)) {
      return res.status(403).json({ error: 'Từ chối truy cập: Bạn không có quyền xem danh sách thiết bị CCDC.' });
    }
    res.json(await dbService.getToolAssets());
  } catch (err: any) {
    sendErr(res, err);
  }
});
app.get('/api/tool-catalogs/:catalogId/assets', async (req: any, res) => {
  try {
    if (!canViewTools(req.authUser)) {
      return res.status(403).json({ error: 'Từ chối truy cập: Bạn không có quyền xem thiết bị thuộc danh mục này.' });
    }
    res.json(await dbService.getToolAssetsByCatalog(req.params.catalogId));
  } catch (err: any) {
    sendErr(res, err);
  }
});
app.post('/api/tool-assets', async (req: any, res) => {
  try {
    if (!canManageTools(req.authUser)) {
      return res.status(403).json({ error: 'Từ chối truy cập: Chỉ Quản lý CCDC mới có quyền tạo hoặc sửa tài sản vật lý.' });
    }
    res.json(await dbService.saveToolAsset(req.body, getActorId(req)));
  } catch (err: any) {
    sendErr(res, err);
  }
});
app.delete('/api/tool-assets/:id', async (req: any, res) => {
  try {
    if (!canDeleteTools(req.authUser)) {
      return res.status(403).json({ error: 'Từ chối truy cập: Chỉ Admin hoặc tài khoản được cấp quyền xóa CCDC mới có thể xóa tài sản.' });
    }
    res.json(await dbService.deleteToolAsset(req.params.id, getActorId(req)));
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.get('/api/tool-assets/:assetId/transfers', async (req: any, res) => {
  try {
    if (!canViewTools(req.authUser)) {
      return res.status(403).json({ error: 'Từ chối truy cập: Bạn không có quyền xem lịch sử luân chuyển CCDC.' });
    }
    res.json(await dbService.getToolTransfers(req.params.assetId));
  } catch (err: any) {
    sendErr(res, err);
  }
});
app.post('/api/tool-transfers', async (req: any, res) => {
  try {
    if (!canViewTools(req.authUser)) {
      return res.status(403).json({ error: 'Từ chối truy cập: Bạn không có quyền thao tác luân chuyển CCDC.' });
    }
    res.json(
      await dbService.saveToolTransfer(req.body, getActorId(req), {
        actorCanManage: canManageTools(req.authUser),
        actorUser: req.authUser,
      })
    );
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.get('/api/tool-assets/:assetId/calibrations', async (req: any, res) => {
  try {
    if (!canViewTools(req.authUser)) {
      return res.status(403).json({ error: 'Từ chối truy cập: Bạn không có quyền xem lịch sử hiệu chuẩn CCDC.' });
    }
    res.json(await dbService.getToolCalibrations(req.params.assetId));
  } catch (err: any) {
    sendErr(res, err);
  }
});
app.post('/api/tool-calibrations', async (req: any, res) => {
  try {
    if (!canViewTools(req.authUser)) {
      return res.status(403).json({ error: 'Từ chối truy cập: Bạn không có quyền thao tác hiệu chuẩn CCDC.' });
    }
    res.json(
      await dbService.saveToolCalibration(req.body, getActorId(req), {
        actorCanManage: canManageTools(req.authUser),
      })
    );
  } catch (err: any) {
    sendErr(res, err);
  }
});

// --- M10: IPO DATA (CORE `ipo` STRICTLY READ-ONLY) & PLANS ---
app.get('/api/ipo', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = parseInt(req.query.limit as string || '50', 10);
    const factoryOrder = String(req.query.factoryOrder || '');
    const maTender = String(req.query.maTender || '');
    const result = await dbMod.getIpoReadOnly({ page, limit, factoryOrder, maTender });
    res.json(result);
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.post('/api/import/ipo', (_req, res) => {
  res.status(403).json({
    error: 'Vi phạm quy tắc READ-ONLY: Bảng đơn hàng sản xuất (ipo) đồng bộ từ ERP là chỉ đọc, không được phép ghi/import từ QMS.',
  });
});

app.get('/api/ipo/detail/:idFactoryOrder', async (req, res) => {
  try {
    const result = await dbMod.getIpoDetailExtended(req.params.idFactoryOrder);
    res.json(result);
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.post('/api/ipo/detail', async (req: any, res) => {
  try {
    res.json(await dbMod.saveIpoDetailExtendedRecord(req.body, getActorId(req)));
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.post('/api/ipo/drawings', async (req: any, res) => {
  try {
    res.json(await dbMod.saveIpoDrawingRecord(req.body, getActorId(req)));
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.post('/api/ipo/materials', async (req: any, res) => {
  try {
    res.json(await dbMod.saveIpoMaterialHistoryRecord(req.body, getActorId(req)));
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.post('/api/ipo/samples', async (req: any, res) => {
  try {
    res.json(await dbMod.saveIpoSampleHistoryRecord(req.body, getActorId(req)));
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.put('/api/ipo/samples/:id', async (req: any, res) => {
  try {
    res.json(await dbMod.updateIpoSampleHistoryRecord(req.params.id, req.body, getActorId(req)));
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.delete('/api/ipo/samples/:id', async (req: any, res) => {
  try {
    res.json(await dbMod.deleteIpoSampleHistoryRecord(req.params.id, getActorId(req)));
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.get('/api/plans', async (req, res) => {
  try {
    const projectId = req.query.projectId ? String(req.query.projectId) : undefined;
    const search = req.query.search ? String(req.query.search) : undefined;
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = parseInt(req.query.limit as string || '200', 10);
    res.json(await dbMod.getPlansList({ projectId, search, page, limit }));
  } catch (err: any) {
    sendErr(res, err);
  }
});

// --- M11: USERS, ROLES, WORKSHOPS, TEMPLATES, ORG, NOTIFICATIONS ---
app.get('/api/users', async (req, res) => {
  try {
    const includeMedia = req.query.includeMedia === '1' || req.query.includeMedia === 'true';
    const users = await dbMod.getUsersList({ includeMedia });
    res.json(users);
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.get('/api/users/:id', async (req, res) => {
  try {
    const user = await dbMod.getUserById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.post('/api/users/import', requireAdmin, async (req: any, res) => {
  try {
    const result = await dbMod.importUsersBatchRecords(req.body?.users || [], getActorId(req));
    res.json(result);
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.post('/api/users', async (req: any, res) => {
  try {
    const isAdmin = dbMod.isServerAdmin(req.authUser);
    const existingTarget = req.body?.id ? await dbMod.getUserById(String(req.body.id)) : null;
    const reqAction = existingTarget ? 'EDIT' : 'CREATE';
    const hasUserMgmtPerm =
      dbMod.hasServerPermission(req.authUser, 'SETTINGS_USERS', reqAction) ||
      dbMod.hasServerPermission(req.authUser, 'SETTINGS', reqAction);

    if (isAdmin || hasUserMgmtPerm) {
      if (!isAdmin) {
        const targetRoleUpper = String(req.body?.role || '').trim().toUpperCase();
        const existingRoleUpper = String(existingTarget?.role || '').trim().toUpperCase();
        if (targetRoleUpper === 'ADMIN' || existingRoleUpper === 'ADMIN') {
          return res.status(403).json({ error: 'Từ chối truy cập: Chỉ ADMIN mới có quyền tạo hoặc chỉnh sửa tài khoản vai trò ADMIN.' });
        }
        const incomingPerms = Array.isArray(req.body?.userPermissions || req.body?.user_permissions)
          ? (req.body.userPermissions || req.body.user_permissions)
          : [];
        const hasSysAdminGrant = incomingPerms.some((p: any) => String(p?.moduleId || '').toUpperCase() === 'SYSTEM_ADMIN');
        const incomingModules = Array.isArray(req.body?.allowedModules || req.body?.allowed_modules)
          ? (req.body.allowedModules || req.body.allowed_modules).map((m: any) => String(m || '').toUpperCase())
          : [];
        if (hasSysAdminGrant || incomingModules.includes('SYSTEM_ADMIN')) {
          return res.status(403).json({ error: 'Từ chối truy cập: Không thể cấp quyền SYSTEM_ADMIN nếu bạn không phải ADMIN.' });
        }
      }
      const result = await dbMod.upsertUserRecord(req.body, getActorId(req));
      return res.json(result);
    }

    // Non-admin self-profile update only: strip privileged fields to prevent role/permission escalation
    if (req.body?.id && String(req.body.id) === String(req.authUser?.id)) {
      const {
        role: _r,
        status: _s,
        allowedModules: _am,
        allowed_modules: _am2,
        userPermissions: _up,
        user_permissions: _up2,
        la_to_truong: _ltt,
        requirePasswordChange: _rpc,
        require_password_change: _rpc2,
        password: _pw,
        ...safeProfileFields
      } = req.body || {};
      const result = await dbMod.upsertUserRecord(
        {
          ...req.authUser,
          ...safeProfileFields,
          id: req.authUser.id,
          role: req.authUser.role,
          status: req.authUser.status,
          allowedModules: req.authUser.allowedModules,
          userPermissions: req.authUser.userPermissions,
          la_to_truong: req.authUser.la_to_truong,
        },
        getActorId(req)
      );
      return res.json(result);
    }

    return res.status(403).json({ error: 'Từ chối truy cập: Bạn không có quyền chỉnh sửa tài khoản người dùng khác.' });
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.delete('/api/users/:id', requireAdmin, async (req: any, res) => {
  try {
    const result = await dbMod.softDeleteUserRecord(req.params.id, getActorId(req));
    res.json(result);
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.get('/api/users/:userId/activity', async (req: any, res) => {
  try {
    const isSelf = String(req.authUser?.id) === String(req.params.userId);
    const canViewActivity =
      isSelf ||
      dbMod.isServerAdmin(req.authUser) ||
      dbMod.hasServerPermission(req.authUser, 'SETTINGS_USERS', 'VIEW');
    if (!canViewActivity) {
      return res.status(403).json({ error: 'Từ chối truy cập lịch sử hoạt động của người dùng khác.' });
    }
    const stats = await dbMod.getUserActivityLogs(req.params.userId);
    res.json(stats);
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.get('/api/roles', async (_req, res) => {
  try {
    res.json(await dbMod.getRolesList());
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.post('/api/roles', requireAdmin, async (req: any, res) => {
  try {
    res.json(await dbMod.saveRoleRecord(req.body, getActorId(req)));
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.delete('/api/roles/:id', requireAdmin, async (req: any, res) => {
  try {
    res.json(await dbMod.deleteRoleRecord(req.params.id, getActorId(req)));
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.get('/api/workshops', async (_req, res) => {
  try {
    res.json(await dbMod.getWorkshopsList());
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.post('/api/workshops', requireAdmin, async (req: any, res) => {
  try {
    res.json(await dbMod.saveWorkshopRecord(req.body, getActorId(req)));
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.delete('/api/workshops/:id', requireAdmin, async (req: any, res) => {
  try {
    res.json(await dbMod.deleteWorkshopRecord(req.params.id, getActorId(req)));
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.get('/api/templates', async (_req, res) => {
  try {
    res.json(await dbMod.getTemplatesMap());
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.post('/api/templates/:id', requireAdmin, async (req: any, res) => {
  try {
    res.json(await dbMod.saveTemplateRecord(req.params.id, req.body?.items || [], getActorId(req)));
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.post('/api/admin/sync-departments', requireAdmin, async (_req, res) => {
  try {
    res.json(await dbMod.syncDepartmentsForUsers());
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.get('/api/notifications', async (req: any, res) => {
  try {
    const requestedUserId = String(req.query.userId || req.query.user_id || '').trim();
    const userId = dbMod.isServerAdmin(req.authUser) && requestedUserId
      ? requestedUserId
      : String(req.authUser?.id || '').trim();
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = parseInt(req.query.limit as string || '50', 10);
    res.json(await dbService.getNotifications(userId, page, limit));
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.post('/api/notifications/:id/read', async (req: any, res) => {
  try {
    const requestedUserId = req.body?.userId ? String(req.body.userId).trim() : '';
    const userId = dbMod.isServerAdmin(req.authUser) && requestedUserId
      ? requestedUserId
      : String(req.authUser?.id || '').trim();
    res.json(await dbService.markNotificationAsRead(req.params.id, userId));
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.post('/api/notifications/read-all', async (req: any, res) => {
  try {
    const requestedUserId = String(req.body?.userId || req.query?.userId || '').trim();
    const userId = dbMod.isServerAdmin(req.authUser) && requestedUserId
      ? requestedUserId
      : String(req.authUser?.id || '').trim();
    res.json(await dbService.markAllNotificationsAsRead(userId));
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.post('/api/notifications', async (req, res) => {
  try {
    res.json(await dbService.createNotificationRecord(req.body));
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.get('/api/departments', async (_req, res) => {
  try {
    res.json(await dbService.getDepartments());
  } catch (err: any) {
    sendErr(res, err);
  }
});
app.post('/api/departments', requireAdmin, async (req: any, res) => {
  try {
    res.json(await dbService.upsertDepartment(req.body, getActorId(req)));
  } catch (err: any) {
    sendErr(res, err);
  }
});
app.delete('/api/departments/:id', requireAdmin, async (req: any, res) => {
  try {
    res.json(await dbService.deleteDepartment(req.params.id, getActorId(req)));
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.get('/api/divisions', async (_req, res) => {
  try {
    res.json(await dbService.getDivisions());
  } catch (err: any) {
    sendErr(res, err);
  }
});
app.post('/api/divisions', requireAdmin, async (req: any, res) => {
  try {
    res.json(await dbService.upsertDivision(req.body, getActorId(req)));
  } catch (err: any) {
    sendErr(res, err);
  }
});
app.delete('/api/divisions/:id', requireAdmin, async (req: any, res) => {
  try {
    res.json(await dbService.deleteDivision(req.params.id, getActorId(req)));
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.get('/api/teams', async (_req, res) => {
  try {
    res.json(await dbService.getTeams());
  } catch (err: any) {
    sendErr(res, err);
  }
});
app.post('/api/teams', requireAdmin, async (req: any, res) => {
  try {
    res.json(await dbService.upsertTeam(req.body, getActorId(req)));
  } catch (err: any) {
    sendErr(res, err);
  }
});
app.delete('/api/teams/:id', requireAdmin, async (req: any, res) => {
  try {
    res.json(await dbService.deleteTeam(req.params.id, getActorId(req)));
  } catch (err: any) {
    sendErr(res, err);
  }
});

// --- SIGNED STORAGE ADAPTER & SAFE IMAGE PROXY ---
const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: storageService.MAX_STORAGE_FILE_BYTES },
  fileFilter: (_req, file, cb) => {
    if (storageService.isAllowedMimeType(file.mimetype)) {
      return cb(null, true);
    }
    return cb(new Error(`Định dạng tệp không được hỗ trợ: ${file.mimetype || 'unknown'}`));
  },
});

const uploadFieldsMiddleware = memoryUpload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'image', maxCount: 1 },
  { name: 'files', maxCount: 10 },
]);

app.post('/api/storage/signed-upload-url', (req: any, res) => {
  try {
    const grant = storageService.createSignedUploadUrl({
      filename: req.body?.filename || req.body?.fileName,
      contentType: req.body?.contentType || req.body?.mimeType,
      entityType: req.body?.entityType || req.body?.type,
      entityId: req.body?.entityId,
      role: req.body?.role,
      ttlSeconds: req.body?.ttlSeconds,
    });
    res.json(grant);
  } catch (err: any) {
    sendErr(res, err, 400);
  }
});

app.get('/api/storage/signed-download-url', (req: any, res) => {
  try {
    const rawKey = String(req.query.key || req.query.url || '').trim();
    if (!rawKey) return res.status(400).json({ error: 'Thiếu tham số key hoặc url' });
    const ttl = parseInt(String(req.query.ttlSeconds || '3600'), 10);
    const signedUrl = storageService.createSignedDownloadUrl(rawKey, ttl);
    res.json({ url: signedUrl, expiresIn: ttl });
  } catch (err: any) {
    sendErr(res, err, 400);
  }
});

const rawBinaryStorageMiddleware = express.raw({
  type: () => true,
  limit: storageService.MAX_STORAGE_FILE_BYTES,
});

const handleSignedStorageUpload = async (req: any, res: any) => {
  try {
    const verification = storageService.verifySignedStorageRequest({
      action: 'upload',
      key: String(req.query.key || ''),
      expires: req.query.expires as string | undefined,
      sig: req.query.sig as string | undefined,
    });
    if (!verification.ok) {
      return res.status((verification as any).statusCode).json({ error: (verification as any).error });
    }

    const contentType = String(req.headers['content-type'] || '').toLowerCase();
    if (contentType.includes('multipart/form-data')) {
      return uploadFieldsMiddleware(req, res, async (err: any) => {
        if (err) {
          const status = err?.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
          return res.status(status).json({ error: err?.message || 'Lỗi tải tệp lên' });
        }
        const filesObj = (req.files || {}) as Record<string, Express.Multer.File[]>;
        const primary =
          req.file ||
          filesObj.file?.[0] ||
          filesObj.image?.[0] ||
          filesObj.files?.[0];
        if (!primary) {
          return res.status(400).json({ error: 'Không có tệp được tải lên' });
        }
        try {
          const stored = await storageService.writeStorageBuffer(verification.storageKey, primary.buffer);
          return res.json({
            ...stored,
            url: stored.accessUrl,
            signedDownloadUrl: storageService.createSignedDownloadUrl(stored.storageKey, 3600),
            filename: primary.originalname,
            mimetype: primary.mimetype,
          });
        } catch (writeErr: any) {
          return sendErr(res, writeErr);
        }
      });
    }

    return rawBinaryStorageMiddleware(req, res, async (err: any) => {
      if (err) {
        const status = err?.type === 'entity.too.large' ? 413 : 400;
        return res.status(status).json({ error: err?.message || 'Lỗi đọc luồng dữ liệu tải lên' });
      }
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ error: 'Nội dung tệp tải lên rỗng.' });
      }
      try {
        const stored = await storageService.writeStorageBuffer(verification.storageKey, req.body);
        return res.json({
          ...stored,
          url: stored.accessUrl,
          signedDownloadUrl: storageService.createSignedDownloadUrl(stored.storageKey, 3600),
        });
      } catch (writeErr: any) {
        return sendErr(res, writeErr);
      }
    });
  } catch (err: any) {
    return sendErr(res, err);
  }
};

app.put('/api/storage/upload', handleSignedStorageUpload);
app.post('/api/storage/upload', handleSignedStorageUpload);

app.get('/api/storage/files/*storageKey', (req: any, res) => {
  try {
    const rawParam = Array.isArray(req.params.storageKey)
      ? req.params.storageKey.join('/')
      : String(req.params.storageKey || '');
    const cleanKey = storageService.sanitizeStorageKey(decodeURIComponent(rawParam));

    const hasSignedParams = Boolean(req.query.sig && req.query.expires);
    if (hasSignedParams) {
      const verified = storageService.verifySignedStorageRequest({
        action: 'download',
        key: cleanKey,
        expires: req.query.expires as string | undefined,
        sig: req.query.sig as string | undefined,
      });
      if (!verified.ok) {
        const errRes = verified as { statusCode: number; error: string };
        return res.status(errRes.statusCode).json({ error: errRes.error });
      }
    } else {
      const queryToken = req.query.token ? `Bearer ${String(req.query.token)}` : undefined;
      const hasJwt = Boolean(req.authUser || dbMod.verifyJwtToken(queryToken));
      if (!hasJwt) {
        return res.status(401).json({ error: 'Yêu cầu JWT hoặc Signed Download URL hợp lệ để truy cập tệp.' });
      }
    }

    const filePath = storageService.resolveStorageFilePath(cleanKey);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return res.status(404).json({ error: 'Storage asset not found' });
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.sendFile(filePath);
  } catch (err: any) {
    return sendErr(res, err);
  }
});

app.post('/api/upload', (req: any, res) => {
  uploadFieldsMiddleware(req, res, async (err: any) => {
    if (err) {
      const status = err?.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      return res.status(status).json({ error: err?.message || 'Lỗi tải tệp lên' });
    }
    const filesObj = (req.files || {}) as Record<string, Express.Multer.File[]>;
    const uploadedFiles: Express.Multer.File[] = [
      ...(filesObj.file || []),
      ...(filesObj.image || []),
      ...(filesObj.files || []),
    ];
    const primary = req.file || uploadedFiles[0];
    if (!primary) {
      return res.status(400).json({ error: 'Không có tệp được tải lên (hỗ trợ field: file, image, files)' });
    }
    try {
      const batch = uploadedFiles.length > 0 ? uploadedFiles : [primary];
      const storedList = await Promise.all(
        batch.map(async (f) => {
          const grant = storageService.createSignedUploadUrl({
            filename: f.originalname,
            contentType: f.mimetype,
            entityType: String(req.body?.entityType || 'GENERAL'),
            role: String(req.body?.role || ''),
          });
          return storageService.writeStorageBuffer(grant.storageKey, f.buffer);
        })
      );
      return res.json({
        url: storedList[0].accessUrl,
        urls: storedList.map((s) => s.accessUrl),
        storageKey: storedList[0].storageKey,
        filename: primary.originalname,
        mimetype: primary.mimetype,
        size: primary.size,
      });
    } catch (writeErr: any) {
      return sendErr(res, writeErr);
    }
  });
});

function normalizeGoogleDriveUrl(inputUrl: string): { primary: string; fallbacks: string[]; fileId?: string } {
  try {
    let fileId = '';
    const cleanUrl = String(inputUrl || '').trim();
    if (cleanUrl.includes('drive.google.com') || cleanUrl.includes('lh3.googleusercontent.com')) {
      const fileMatch = cleanUrl.match(/\/file\/d\/([^/?]+)/);
      const idMatch = cleanUrl.match(/[?&]id=([^&]+)/);
      const dMatch = cleanUrl.match(/\/d\/([^/?]+)/);
      fileId = fileMatch?.[1] || idMatch?.[1] || dMatch?.[1] || '';
    } else if (cleanUrl.includes('/api/media/image/') || cleanUrl.includes('/api/image/') || cleanUrl.includes('/display-image/')) {
      fileId = cleanUrl.split(/[/?]/).filter(Boolean).pop() || '';
    } else if (/^[a-zA-Z0-9_-]{15,}$/.test(cleanUrl)) {
      fileId = cleanUrl;
    }

    if (fileId && /^[a-zA-Z0-9_-]{15,}$/.test(fileId)) {
      return {
        fileId,
        primary: `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`,
        fallbacks: [
          `https://lh3.googleusercontent.com/d/${fileId}`,
          `https://drive.google.com/uc?export=download&confirm=t&id=${fileId}`,
          `https://drive.google.com/uc?export=view&id=${fileId}`
        ]
      };
    }
  } catch {
    // Ignore invalid URL parse
  }
  return { primary: inputUrl, fallbacks: [] };
}

async function fetchUpstreamImage(targetUrl: string, googleToken?: string): Promise<{ ok: boolean; status: number; contentType: string; buf?: Buffer; error?: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);
  try {
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    };
    if (googleToken) {
      headers['Authorization'] = `Bearer ${googleToken}`;
    }
    const upstream = await fetch(targetUrl, {
      redirect: 'follow',
      signal: controller.signal,
      headers,
    });
    if (!upstream.ok) {
      return { ok: false, status: upstream.status, contentType: upstream.headers.get('content-type') || '', error: `Upstream returned ${upstream.status}` };
    }
    const contentType = (upstream.headers.get('content-type') || 'application/octet-stream').toLowerCase();
    if (contentType.includes('text/html') || contentType.includes('application/xhtml+xml')) {
      return { ok: false, status: 502, contentType, error: 'Upstream returned HTML page instead of image binary' };
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    return { ok: true, status: 200, contentType, buf };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return { ok: false, status: 504, contentType: '', error: 'Image upstream request timed out' };
    }
    return { ok: false, status: 502, contentType: '', error: err?.message || 'Failed to fetch upstream image' };
  } finally {
    clearTimeout(timeoutId);
  }
}

const proxyImageHandler = async (req: any, res: any) => {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    let rawUrl = String(req.query.url || req.query.id || req.query.fileId || '').trim();
    if (!rawUrl) return res.status(400).json({ error: 'Missing url or id parameter' });

    const googleToken = String(req.query.google_token || req.headers['x-google-token'] || req.headers['x-goog-token'] || '').trim();

    // Handle local /uploads/ path or full URL pointing to local /uploads/
    let localUploadsPath: string | null = null;
    if (rawUrl.startsWith('/uploads/')) {
      localUploadsPath = rawUrl;
    } else if (/^https?:\/\//i.test(rawUrl)) {
      try {
        const parsed = new URL(rawUrl);
        if ((parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') && parsed.pathname.startsWith('/uploads/')) {
          localUploadsPath = parsed.pathname;
        }
      } catch {
        // Ignore
      }
    }

    if (localUploadsPath) {
      const cleanRel = decodeURIComponent(localUploadsPath.split('?')[0]).replace(/^\/+uploads\/+/, '');
      const resolvedPath = path.resolve(UPLOAD_DIR, cleanRel);
      if (resolvedPath !== UPLOAD_DIR && !resolvedPath.startsWith(UPLOAD_DIR + path.sep)) {
        return res.status(403).json({ error: 'Forbidden image path' });
      }
      if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.sendFile(resolvedPath);
      }
      const placeholderSvg = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="#f1f5f9"/><path d="M160 120h80v60h-80z" fill="none" stroke="#94a3b8" stroke-width="4" rx="6"/><circle cx="182" cy="140" r="6" fill="#94a3b8"/><path d="M166 172l24-22 18 16 14-12 12 18z" fill="#cbd5e1"/><text x="200" y="220" font-family="sans-serif" font-size="14" fill="#64748b" text-anchor="middle">Hình ảnh chưa sẵn sàng</text></svg>`
      );
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(placeholderSvg);
    }

    // Google Drive normalization
    const { primary, fallbacks, fileId } = normalizeGoogleDriveUrl(rawUrl);
    const candidates: string[] = [];

    // If Google Workspace OAuth token is provided and we have fileId, try Google Drive API direct download first
    if (fileId && googleToken) {
      candidates.push(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
    }

    if (primary && (primary.startsWith('http://') || primary.startsWith('https://'))) {
      candidates.push(primary);
    }
    for (const fb of fallbacks) {
      if (!candidates.includes(fb)) candidates.push(fb);
    }

    let result: { ok: boolean; status: number; contentType: string; buf?: Buffer; error?: string } = {
      ok: false,
      status: 502,
      contentType: '',
      buf: undefined,
      error: 'Failed to proxy external image'
    };
    
    for (const candidate of candidates) {
      result = await fetchUpstreamImage(candidate, googleToken);
      if (result.ok && result.buf) {
        break;
      }
    }

    if (!result.ok || !result.buf) {
      const placeholderSvg = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="#f1f5f9"/><path d="M160 120h80v60h-80z" fill="none" stroke="#94a3b8" stroke-width="4" rx="6"/><circle cx="182" cy="140" r="6" fill="#94a3b8"/><path d="M166 172l24-22 18 16 14-12 12 18z" fill="#cbd5e1"/><text x="200" y="220" font-family="sans-serif" font-size="14" fill="#64748b" text-anchor="middle">Không thể tải ảnh từ nguồn</text></svg>`
      );
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(placeholderSvg);
    }
    res.setHeader('Content-Type', result.contentType || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(result.buf);
  } catch (err: any) {
    sendErr(res, err);
  }
};
app.get('/api/proxy-image', proxyImageHandler);
app.get('/api/images/proxy', proxyImageHandler);

// Guard legacy image paths and resolve Google Drive IDs against Vite SPA HTML fallback
app.use(['/display-image', '/api/image', '/api/media/image', '/media/stream'], async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

  const filename = path.basename((req.path || '').split('?')[0]);
  const candidateId = filename || String(req.query.id || req.query.url || '').trim();

  if (candidateId) {
    const resolved = path.resolve(UPLOAD_DIR, candidateId);
    if (resolved.startsWith(UPLOAD_DIR + path.sep) && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.sendFile(resolved);
    }

    // Check if candidateId matches Google Drive ID pattern or contains Drive URL
    if (/^[a-zA-Z0-9_-]{15,}$/.test(candidateId) || candidateId.includes('drive.google.com') || candidateId.includes('lh3.googleusercontent.com')) {
      const googleToken = String(req.query.google_token || req.headers['x-google-token'] || req.headers['x-goog-token'] || '').trim();
      const { primary, fallbacks, fileId } = normalizeGoogleDriveUrl(candidateId);
      const candidates: string[] = [];

      if (fileId && googleToken) {
        candidates.push(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
      }
      if (primary && (primary.startsWith('http://') || primary.startsWith('https://'))) {
        candidates.push(primary);
      }
      for (const fb of fallbacks) {
        if (!candidates.includes(fb)) candidates.push(fb);
      }

      for (const candidate of candidates) {
        const result = await fetchUpstreamImage(candidate, googleToken);
        if (result.ok && result.buf) {
          res.setHeader('Content-Type', result.contentType || 'image/jpeg');
          res.setHeader('Cache-Control', 'public, max-age=86400');
          return res.send(result.buf);
        }
      }

      // Return placeholder SVG gracefully instead of 404
      const placeholderSvg = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect width="400" height="300" fill="#f1f5f9"/><path d="M160 120h80v60h-80z" fill="none" stroke="#94a3b8" stroke-width="4" rx="6"/><circle cx="182" cy="140" r="6" fill="#94a3b8"/><path d="M166 172l24-22 18 16 14-12 12 18z" fill="#cbd5e1"/><text x="200" y="220" font-family="sans-serif" font-size="14" fill="#64748b" text-anchor="middle">Không thể tải ảnh từ nguồn</text></svg>`
      );
      res.setHeader('Content-Type', 'image/svg+xml');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      return res.send(placeholderSvg);
    }
  }
  return res.status(404).json({ error: `Image asset not found: ${req.originalUrl}` });
});

// --- SYSTEM AUDIT & 12-MODULE DIAGNOSTIC ENDPOINTS ---
app.get('/api/system/audit-errors', requireAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string || '50', 10);
    const moduleId = String(req.query.moduleId || 'ALL');
    const statusGroup = String(req.query.statusGroup || 'ALL');
    const search = String(req.query.search || '');
    const result = await dbMod.getApiErrorLogs({ limit, moduleId, statusGroup, search });
    res.json(result);
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.post('/api/system/audit-errors', async (req: any, res) => {
  try {
    const reqPath = String(req.body?.path || '/api/unknown');
    const mod = dbMod.resolveModuleFromPath(reqPath);
    await dbMod.recordApiErrorLog({
      moduleId: req.body?.moduleId || mod.moduleId,
      moduleName: req.body?.moduleName || mod.moduleName,
      method: String(req.body?.method || 'GET'),
      path: reqPath,
      statusCode: Number(req.body?.statusCode || 500),
      errorMessage: String(req.body?.errorMessage || 'Client reported API failure'),
      userId: getActorId(req),
      durationMs: Number(req.body?.durationMs || 0),
      details: req.body?.details || null,
    });
    res.json({ success: true });
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.post('/api/system/probe-modules', requireAdmin, async (_req, res) => {
  try {
    const result = await dbMod.probeAll12Modules();
    res.json(result);
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.delete('/api/system/audit-errors', requireAdmin, async (req: any, res) => {
  try {
    const result = await dbMod.clearApiErrorLogs(getActorId(req));
    res.json(result);
  } catch (err: any) {
    sendErr(res, err);
  }
});

// JSON fallback for missing API endpoints to avoid Vite HTML spa-fallback
app.use('/api', (req, res) => {
  res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.originalUrl}` });
});

async function startServer() {
  try {
    await runMigrations();
  } catch (migErr) {
    console.warn('⚠️ Startup migration warning:', migErr);
  }

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.use((_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  const server = http.createServer(app);
  server.listen(PORT, () => {
    console.log(`🚀 QMS Server v3.1.0 running on http://localhost:${PORT}`);
    dbService.syncSuppliersFromBookings().then((res) => {
      console.log(`📦 Synced supplier contact details from bookings: ${res.updatedCount || 0} updated.`);
    }).catch((err) => {
      console.warn('Failed initial supplier sync:', err);
    });
    dbService.syncMissingInspectionsFromForms().then((res) => {
      console.log(`📋 Synced missing forms -> inspections: ${res.inserted} inserted, ${res.updated} po_number updated.`);
    }).catch((err) => {
      console.warn('Failed initial forms->inspections sync:', err);
    });
    backfillTraceabilityIndex().then((count) => {
      console.log(`🔎 Backfilled inspection_traceability_index: ${count} index entries ensured.`);
    }).catch((err) => {
      console.warn('Failed initial traceability index backfill:', err);
    });
  });
}

startServer();

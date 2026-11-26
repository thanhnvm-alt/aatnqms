import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { fileURLToPath } from 'url';
import * as xlsx from 'xlsx';
import * as dbService from './services/dbService.js';
import * as dbMod from './services/dbModuleService.js';
import * as storageService from './services/storageService.js';
import * as googleDriveSystem from './services/googleDriveSystemService.js';
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
  const isReadMethod = method === 'GET' || method === 'HEAD';
  if (isReadMethod && cleanPath === '/api/health') return true;
  if (method === 'POST' && (cleanPath === '/api/auth/login' || cleanPath === '/api/auth/forgot-password' || cleanPath === '/api/auth/reset-password')) return true;
  if (isReadMethod && cleanPath.startsWith('/api/public/inspections/')) return true;
  if (isReadMethod && (cleanPath === '/api/proxy-image' || cleanPath === '/api/images/proxy')) return true;
  if (isReadMethod && (cleanPath.startsWith('/api/media/image') || cleanPath.startsWith('/api/image') || cleanPath.startsWith('/api/media/') || cleanPath.startsWith('/display-image') || cleanPath.startsWith('/media/stream'))) return true;
  if ((method === 'PUT' || method === 'POST') && cleanPath === '/api/storage/upload') return true;
  if (isReadMethod && cleanPath.startsWith('/api/storage/files/')) return true;
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
    const result = await dbMod.changeUserPassword(userId, req.body?.newPassword, req.body?.currentPassword);
    res.json(result);
  } catch (err: any) {
    sendErr(res, err, 400);
  }
});

app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const result = await dbMod.requestPasswordReset(req.body?.email || req.body?.identifier);
    res.json(result);
  } catch (err: any) {
    sendErr(res, err, 400);
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const identifier = req.body?.identifier || req.body?.username || req.body?.email;
    const result = await dbMod.resetPasswordDirect(identifier, req.body?.newPassword, {
      ip: req.ip || req.socket?.remoteAddress,
      userAgent: req.headers['user-agent'],
    });
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

app.get('/api/export/suppliers', async (req, res) => {
  try {
    const format = String(req.query.format || 'xlsx').toLowerCase();
    const search = String(req.query.search || '');
    const result = await dbService.getSuppliers(search, 10000);
    const suppliers = Array.isArray(result) ? result : (result?.items || []);
    const rows = suppliers.map((s: any) => ({
      'Mã NCC': s.code || s.supplierCode || '',
      'Tên Nhà Cung Cấp': s.name || s.supplierName || '',
      'Loại NCC': s.type || '',
      'Xưởng Phụ Trách': s.workshop || '',
      'Trạng thái': s.status || '',
      'Người liên hệ': s.contactPerson || '',
      'Số điện thoại': s.phone || '',
      'Email': s.email || '',
      'Địa chỉ': s.address || '',
    }));

    if (format === 'csv') {
      let csv = '\uFEFF' + Object.keys(rows[0] || {}).join(',') + '\n';
      for (const r of rows) {
        csv += Object.values(r).map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',') + '\n';
      }
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=AATN_Suppliers_${Date.now()}.csv`);
      return res.send(csv);
    } else {
      const wb = xlsx.utils.book_new();
      const ws = xlsx.utils.json_to_sheet(rows);
      xlsx.utils.book_append_sheet(wb, ws, 'Suppliers');
      const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=AATN_Suppliers_${Date.now()}.xlsx`);
      return res.send(buf);
    }
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

app.get('/api/export/inspections', async (req, res) => {
  try {
    const format = String(req.query.format || 'csv').toLowerCase();
    const items = await dbService.getInspectionsExportRows(req.query, 10000);

    const toExportNumeric = (val: any, zeroIfMissing: boolean): number | '' => {
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        const num = Number(val);
        if (Number.isFinite(num)) return num;
      }
      return zeroIfMissing ? 0 : '';
    };

    const headers = [
      'Mã hồ sơ',
      'Loại phiếu',
      'Mã dự án',
      'Tên dự án',
      'Hạng mục/Mô tả',
      'Mã nhà máy',
      'Headcode',
      'QC kiểm tra',
      'Xưởng',
      'Công đoạn sản xuất',
      'Ngày thực hiện',
      'Trạng thái',
      'SL ĐĐH',
      'SLkiem',
      'SLDat',
      'TLDat',
      'SLLoi',
      'TLLoi',
      'Kết luận/Ghi chú',
      'ĐVT/Unit',
    ];

    const rows = items.map((item: any) => {
      const inspected = toExportNumeric(item.inspectedQuantity ?? item.inspected_qty, true) as number;
      const passed = toExportNumeric(item.passedQuantity ?? item.passed_qty, true) as number;
      const failed = toExportNumeric(item.failedQuantity ?? item.failed_qty, true) as number;
      const passRate = inspected > 0 ? ((passed / inspected) * 100).toFixed(1) + '%' : '';
      const failRate = inspected > 0 ? ((failed / inspected) * 100).toFixed(1) + '%' : '';

      return {
        'Mã hồ sơ': item.id || '',
        'Loại phiếu': item.type || '',
        'Mã dự án': item.ma_ct || item.projectCode || item.projectId || '',
        'Tên dự án': item.ten_ct || item.projectName || '',
        'Hạng mục/Mô tả': item.ten_hang_muc || item.description || item.title || '',
        'Mã nhà máy': item.ma_nha_may || item.factoryOrder || item.poNumber || '',
        'Headcode': item.headcode || '',
        'QC kiểm tra': item.inspectorName || item.created_by || item.qcName || '',
        'Xưởng': item.workshop || '',
        'Công đoạn sản xuất': item.exportStage || item.stage || item.subStage || '',
        'Ngày thực hiện': item.date || item.createdAt || '',
        'Trạng thái': item.status || '',
        'SL ĐĐH': toExportNumeric(item.so_luong_ipo ?? item.orderedQty, false),
        'SLkiem': inspected,
        'SLDat': passed,
        'TLDat': passRate,
        'SLLoi': failed,
        'TLLoi': failRate,
        'Kết luận/Ghi chú': item.exportSummary || item.summary || item.conclusion || item.notes || item.remarks || '',
        'ĐVT/Unit': item.exportUnit || item.dvt || item.unit || item.uom || '',
      };
    });

    if (format === 'csv') {
      let csv = '\uFEFF' + headers.join(',') + '\n';
      for (const r of rows) {
        csv += headers.map(h => `"${String((r as any)[h] ?? '').replace(/"/g, '""')}"`).join(',') + '\n';
      }
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=AATN_Inspections_${Date.now()}.csv`);
      return res.send(csv);
    } else {
      const wb = xlsx.utils.book_new();
      const ws = xlsx.utils.json_to_sheet(rows, { header: headers });
      xlsx.utils.book_append_sheet(wb, ws, 'Inspections');
      const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=AATN_Inspections_${Date.now()}.xlsx`);
      return res.send(buf);
    }
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.get('/api/export/ncrs', async (req, res) => {
  try {
    const format = String(req.query.format || 'xlsx').toLowerCase();
    const result = await dbService.getNcrs(req.query, 1, 10000);
    const items = Array.isArray(result) ? result : (result?.items || []);
    const rows = items.map((n: any) => ({
      'Mã NCR': n.code || n.ncrNumber || n.id || '',
      'Mã Dự Án': n.projectCode || n.projectId || '',
      'Nhà Cung Cấp': n.supplierName || '',
      'Mô tả lỗi': n.description || n.title || '',
      'Trạng thái': n.status || '',
      'Mức độ nghiêm trọng': n.severity || '',
      'Hạn khắc phục': n.dueDate || n.deadline || '',
      'Ngày tạo': n.createdAt || n.date || '',
    }));

    if (format === 'csv') {
      let csv = '\uFEFF' + Object.keys(rows[0] || {}).join(',') + '\n';
      for (const r of rows) {
        csv += Object.values(r).map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',') + '\n';
      }
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=AATN_NCRs_${Date.now()}.csv`);
      return res.send(csv);
    } else {
      const wb = xlsx.utils.book_new();
      const ws = xlsx.utils.json_to_sheet(rows);
      xlsx.utils.book_append_sheet(wb, ws, 'NCRs');
      const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=AATN_NCRs_${Date.now()}.xlsx`);
      return res.send(buf);
    }
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.get('/api/export/defects', async (req, res) => {
  try {
    const format = String(req.query.format || 'xlsx').toLowerCase();
    const result = typeof (dbService as any).getDefects === 'function' ? await (dbService as any).getDefects() : (typeof (dbService as any).getDefectLibrary === 'function' ? await (dbService as any).getDefectLibrary() : []);
    const items = Array.isArray(result) ? result : (result?.items || []);
    const rows = items.map((d: any) => ({
      'Mã Lỗi': d.code || d.defectCode || d.id || '',
      'Tên Lỗi': d.name || d.defectName || d.title || '',
      'Danh mục': d.category || '',
      'Mức độ': d.severity || '',
      'Mô tả': d.description || '',
    }));

    if (format === 'csv') {
      let csv = '\uFEFF' + Object.keys(rows[0] || {}).join(',') + '\n';
      for (const r of rows) {
        csv += Object.values(r).map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',') + '\n';
      }
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=AATN_Defects_${Date.now()}.csv`);
      return res.send(csv);
    } else {
      const wb = xlsx.utils.book_new();
      const ws = xlsx.utils.json_to_sheet(rows);
      xlsx.utils.book_append_sheet(wb, ws, 'Defects');
      const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=AATN_Defects_${Date.now()}.xlsx`);
      return res.send(buf);
    }
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.get('/api/export/materials', async (req, res) => {
  try {
    const format = String(req.query.format || 'xlsx').toLowerCase();
    const result = typeof (dbService as any).getMaterials === 'function' ? await (dbService as any).getMaterials(req.query) : [];
    const items = Array.isArray(result) ? result : (result?.items || []);
    const rows = items.map((m: any) => ({
      'Mã Vật Tư': m.code || m.materialCode || m.id || '',
      'Tên Vật Tư': m.name || m.materialName || '',
      'Đơn vị tính': m.unit || '',
      'Nhà Cung Cấp': m.supplierName || '',
      'Quy cách / Mô tả': m.spec || m.description || '',
    }));

    if (format === 'csv') {
      let csv = '\uFEFF' + Object.keys(rows[0] || {}).join(',') + '\n';
      for (const r of rows) {
        csv += Object.values(r).map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',') + '\n';
      }
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=AATN_Materials_${Date.now()}.csv`);
      return res.send(csv);
    } else {
      const wb = xlsx.utils.book_new();
      const ws = xlsx.utils.json_to_sheet(rows);
      xlsx.utils.book_append_sheet(wb, ws, 'Materials');
      const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=AATN_Materials_${Date.now()}.xlsx`);
      return res.send(buf);
    }
  } catch (err: any) {
    sendErr(res, err);
  }
});

app.get('/api/export/ipo', async (req, res) => {
  try {
    const format = String(req.query.format || 'xlsx').toLowerCase();
    const result = typeof (dbService as any).getIpoData === 'function' ? await (dbService as any).getIpoData(1, 10000, req.query.factoryOrder as string, req.query.maTender as string) : { items: [] };
    const items = Array.isArray(result) ? result : (result?.items || []);
    const rows = items.map((i: any) => ({
      'Factory Order': i.factoryOrder || i.order || '',
      'Mã Tender': i.maTender || i.tender || '',
      'Mã Dự Án': i.idProject || i.projectCode || '',
      'Tên Sản Phẩm': i.productName || i.name || '',
      'Số lượng': i.quantity || '',
      'Trạng thái': i.status || '',
    }));

    if (format === 'csv') {
      let csv = '\uFEFF' + Object.keys(rows[0] || {}).join(',') + '\n';
      for (const r of rows) {
        csv += Object.values(r).map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',') + '\n';
      }
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=AATN_IPO_${Date.now()}.csv`);
      return res.send(csv);
    } else {
      const wb = xlsx.utils.book_new();
      const ws = xlsx.utils.json_to_sheet(rows);
      xlsx.utils.book_append_sheet(wb, ws, 'IPO');
      const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=AATN_IPO_${Date.now()}.xlsx`);
      return res.send(buf);
    }
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

app.get('/api/storage/status', (_req, res) => {
  const status = googleDriveSystem.getSystemDriveConfigStatus();
  res.json({
    provider: 'GOOGLE_DRIVE_SYSTEM_OAUTH',
    configured: status.configured,
    missingEnvCount: status.missing.length,
    hasFolderId: status.hasFolderId,
  });
});

app.post('/api/storage/signed-upload-url', (req: any, res) => {
  try {
    // Fail fast before issuing upload URL if system Google Drive OAuth is unavailable
    googleDriveSystem.assertSystemDriveConfigured();

    const filename = String(req.body?.filename || req.body?.fileName || `upload_${Date.now()}.png`);
    const contentType = String(req.body?.contentType || req.body?.mimeType || 'application/octet-stream');
    const entityType = String(req.body?.entityType || req.body?.type || 'GENERAL');
    const maCt = String(req.body?.ma_ct || req.body?.projectCode || '').trim();
    const role = String(req.body?.role || '').trim();

    const grant = storageService.createSignedUploadUrl({
      filename,
      contentType,
      entityType,
      entityId: req.body?.entityId,
      role,
      ttlSeconds: req.body?.ttlSeconds,
    });

    const metaParams = new URLSearchParams();
    metaParams.set('filename', filename);
    if (entityType) metaParams.set('entityType', entityType);
    if (maCt) metaParams.set('ma_ct', maCt);
    if (role) metaParams.set('role', role);

    res.json({
      ...grant,
      uploadUrl: `${grant.uploadUrl}&${metaParams.toString()}`,
    });
  } catch (err: any) {
    sendErr(res, err, err?.statusCode || 400);
  }
});

app.get('/api/storage/signed-download-url', async (req: any, res) => {
  try {
    const rawKey = String(req.query.key || req.query.url || '').trim();
    if (!rawKey) return res.status(400).json({ error: 'Thiếu tham số key hoặc url' });
    const cleanRaw = storageService.stripTransientMediaUrl(rawKey);
    if (cleanRaw.includes('/api/media/image/') || /^[a-zA-Z0-9_-]{15,}$/.test(cleanRaw)) {
      return res.json({ url: cleanRaw.startsWith('/api/media/image/') ? cleanRaw : `/api/media/image/${cleanRaw}`, expiresIn: 0 });
    }
    if (cleanRaw.startsWith('/api/storage/files/')) {
      const keyOnly = cleanRaw.slice('/api/storage/files/'.length).split('?')[0];
      const migratedId = await storageService.getMigratedDriveFileId(keyOnly).catch(() => null);
      if (migratedId) {
        return res.json({ url: `/api/media/image/${migratedId}`, expiresIn: 0 });
      }
    }
    const ttl = parseInt(String(req.query.ttlSeconds || '3600'), 10);
    const signedUrl = storageService.createSignedDownloadUrl(cleanRaw, ttl);
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

    const entityType = String(req.query.entityType || 'GENERAL');
    const maCt = String(req.query.ma_ct || '').trim();
    const role = String(req.query.role || '').trim();
    const queryFilename = String(req.query.filename || '').trim();

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
          const stored = await googleDriveSystem.uploadBufferToSystemDrive({
            buffer: primary.buffer,
            filename: queryFilename || primary.originalname || path.basename(verification.storageKey),
            mimeType: primary.mimetype || 'application/octet-stream',
            entityType,
            ma_ct: maCt,
            role,
          });
          return res.json({
            success: true,
            fileId: stored.fileId,
            storageKey: stored.storageKey,
            url: stored.url,
            accessUrl: stored.accessUrl,
            signedDownloadUrl: stored.url,
            filename: stored.name,
            mimetype: stored.mimetype,
            size: stored.size,
          });
        } catch (uploadErr: any) {
          return sendErr(res, uploadErr, uploadErr?.statusCode || 502);
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
      const cleanMime = String(req.headers['content-type'] || 'application/octet-stream').split(';')[0].trim();
      if (!storageService.isAllowedMimeType(cleanMime)) {
        return res.status(400).json({ error: `Định dạng tệp không được hỗ trợ: ${cleanMime}` });
      }
      try {
        const stored = await googleDriveSystem.uploadBufferToSystemDrive({
          buffer: req.body,
          filename: queryFilename || path.basename(verification.storageKey),
          mimeType: cleanMime,
          entityType,
          ma_ct: maCt,
          role,
        });
        return res.json({
          success: true,
          fileId: stored.fileId,
          storageKey: stored.storageKey,
          url: stored.url,
          accessUrl: stored.accessUrl,
          signedDownloadUrl: stored.url,
          filename: stored.name,
          mimetype: stored.mimetype,
          size: stored.size,
        });
      } catch (uploadErr: any) {
        return sendErr(res, uploadErr, uploadErr?.statusCode || 502);
      }
    });
  } catch (err: any) {
    return sendErr(res, err);
  }
};

app.put('/api/storage/upload', handleSignedStorageUpload);
app.post('/api/storage/upload', handleSignedStorageUpload);

const inflightLegacyMigrations = new Map<string, Promise<{ ok: boolean; buf?: Buffer; contentType?: string; driveFileId?: string }>>();

async function pullLegacyAssetFromSharedAppToDrive(
  cleanKey: string,
  authJwt?: string
): Promise<{ ok: boolean; buf?: Buffer; contentType?: string; driveFileId?: string }> {
  const existing = inflightLegacyMigrations.get(cleanKey);
  if (existing) return existing;

  const task = (async () => {
    const sharedOrigin = storageService.getAllowedSharedAppOrigin();
    if (!sharedOrigin) {
      return { ok: false };
    }

    const encodedKeyPath = cleanKey.split('/').map((seg) => encodeURIComponent(seg)).join('/');
    const signedPath = storageService.createSignedDownloadUrl(cleanKey, 120);
    const candidateUrls = [
      `${sharedOrigin}${signedPath}`,
      ...(authJwt ? [`${sharedOrigin}/api/storage/files/${encodedKeyPath}?token=${encodeURIComponent(authJwt)}`] : []),
      `${sharedOrigin}/uploads/${encodedKeyPath}`,
    ];

    for (const candidateUrl of candidateUrls) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      try {
        const resp = await fetch(candidateUrl, {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: authJwt ? { Authorization: `Bearer ${authJwt}` } : undefined,
        });
        if (!resp.ok) continue;

        const ct = String(resp.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim().toLowerCase();
        if (ct.includes('text/html') || ct.includes('application/xhtml+xml') || ct.includes('application/json')) {
          continue;
        }
        const buf = Buffer.from(await resp.arrayBuffer());
        if (buf.length === 0 || buf.length > storageService.MAX_STORAGE_FILE_BYTES) {
          continue;
        }

        let driveFileId: string | undefined;
        try {
          if (googleDriveSystem.getSystemDriveConfigStatus().configured) {
            const uploaded = await googleDriveSystem.uploadBufferToSystemDrive({
              buffer: buf,
              filename: path.basename(cleanKey),
              mimeType: ct || 'application/octet-stream',
              entityType: 'MIGRATED_SHARED_ASSET',
            });
            driveFileId = uploaded.fileId;
            await storageService.saveMigratedDriveFileId({
              storageKey: cleanKey,
              driveFileId: uploaded.fileId,
              mimeType: uploaded.mimetype,
              sourceOrigin: sharedOrigin,
            });
          }
        } catch (driveErr: any) {
          console.warn(`[LegacyStorageRecovery] Pulled ${cleanKey} from Shared App but Drive upload failed:`, driveErr?.message || driveErr);
        }

        return { ok: true, buf, contentType: ct || 'application/octet-stream', driveFileId };
      } catch {
        // Try next candidate URL
      } finally {
        clearTimeout(timeoutId);
      }
    }

    return { ok: false };
  })().finally(() => {
    inflightLegacyMigrations.delete(cleanKey);
  });

  inflightLegacyMigrations.set(cleanKey, task);
  return task;
}

app.get('/api/storage/files/*storageKey', async (req: any, res) => {
  try {
    const rawParam = Array.isArray(req.params.storageKey)
      ? req.params.storageKey.join('/')
      : String(req.params.storageKey || '');
    const cleanKey = storageService.sanitizeStorageKey(decodeURIComponent(rawParam));
    const isHead = req.method === 'HEAD';

    const rawQueryToken = String(req.query.token || '').trim();
    const queryTokenBearer = rawQueryToken ? `Bearer ${rawQueryToken}` : undefined;
    const rawAuthHeader = String(req.headers?.authorization || '').trim();
    const bearerJwt = rawQueryToken || (rawAuthHeader.startsWith('Bearer ') ? rawAuthHeader.slice(7).trim() : '');
    const hasJwt = Boolean(req.authUser || dbMod.verifyJwtToken(queryTokenBearer));
    const hasSignedParams = Boolean(req.query.sig && req.query.expires);

    if (!hasJwt) {
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
        return res.status(401).json({ error: 'Yêu cầu JWT hoặc Signed Download URL hợp lệ để truy cập tệp.' });
      }
    }

    const rawBaseName = String(req.query.filename || cleanKey.split('/').pop() || 'attachment')
      .replace(/[\r\n"]/g, '_')
      .trim() || 'attachment';
    const isDownload = req.query.download === '1' || req.query.download === 'true';
    const dispositionType = isDownload ? 'attachment' : 'inline';
    const applyHeaders = (contentType?: string) => {
      if (contentType) {
        res.setHeader('Content-Type', contentType);
      }
      res.setHeader(
        'Content-Disposition',
        `${dispositionType}; filename*=UTF-8''${encodeURIComponent(rawBaseName)}`
      );
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Cache-Control', 'private, max-age=3600');
    };

    // 1. Check local disk first
    const filePath = storageService.resolveStorageFilePath(cleanKey);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      applyHeaders();
      if (isHead) return res.status(200).end();
      return res.sendFile(filePath);
    }

    // 2. Check migrated Drive file mapping in PostgreSQL / memory cache
    const migratedDriveId = await storageService.getMigratedDriveFileId(cleanKey);
    if (migratedDriveId) {
      const driveResult = await resolveDriveFileResponse(migratedDriveId);
      if (driveResult.ok && driveResult.buf) {
        applyHeaders(driveResult.contentType || 'application/octet-stream');
        if (isHead) return res.status(200).end();
        return res.send(driveResult.buf);
      }
      if (driveResult.status && driveResult.status !== 404) {
        return res.status(driveResult.status).json({
          error: driveResult.error || 'Không thể tải tệp đã đồng bộ từ Google Drive',
        });
      }
    }

    // 3. Try pulling temporary file once from allowlisted Shared App origin into System Google Drive
    const bypassNegativeCache = Boolean(req.query._r);
    if (bypassNegativeCache || !storageService.isSharedPullNegativelyCached(cleanKey)) {
      const pulled = await pullLegacyAssetFromSharedAppToDrive(cleanKey, hasJwt ? bearerJwt : undefined);
      if (pulled.ok && pulled.buf) {
        applyHeaders(pulled.contentType || 'application/octet-stream');
        if (isHead) return res.status(200).end();
        return res.send(pulled.buf);
      }
      storageService.markSharedPullNotFound(cleanKey);
    }

    return res.status(404).json({
      error: 'Storage asset not found',
      code: 'LEGACY_LOCAL_FILE_MISSING',
    });
  } catch (err: any) {
    return sendErr(res, err);
  }
});

app.post('/api/upload', (req: any, res) => {
  try {
    googleDriveSystem.assertSystemDriveConfigured();
  } catch (cfgErr: any) {
    return sendErr(res, cfgErr, cfgErr?.statusCode || 503);
  }

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
        batch.map((f) =>
          googleDriveSystem.uploadBufferToSystemDrive({
            buffer: f.buffer,
            filename: f.originalname,
            mimeType: f.mimetype || 'application/octet-stream',
            entityType: String(req.body?.entityType || req.body?.type || 'GENERAL'),
            ma_ct: String(req.body?.ma_ct || req.body?.projectCode || '').trim(),
            role: String(req.body?.role || ''),
          })
        )
      );
      return res.json({
        success: true,
        url: storedList[0].url,
        urls: storedList.map((s) => s.url),
        fileId: storedList[0].fileId,
        storageKey: storedList[0].storageKey,
        filename: primary.originalname,
        mimetype: primary.mimetype,
        size: primary.size,
      });
    } catch (uploadErr: any) {
      return sendErr(res, uploadErr, uploadErr?.statusCode || 502);
    }
  });
});

function isSafeExternalImageUrl(targetUrl: string): boolean {
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (!host) return false;
    if (
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.startsWith('fe80:') ||
      host.startsWith('fc') ||
      host.startsWith('fd')
    ) {
      return false;
    }
    if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) {
      return false;
    }
    const m172 = host.match(/^172\.(\d+)\./);
    if (m172 && Number(m172[1]) >= 16 && Number(m172[1]) <= 31) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

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
      fileId = cleanUrl.split('?')[0].split('/').filter(Boolean).pop() || '';
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

async function resolveDriveFileResponse(fileId: string, explicitToken?: string): Promise<{ ok: boolean; status: number; contentType: string; buf?: Buffer; error?: string }> {
  // 1. Prefer System Google Drive OAuth (transparent to end users)
  const sysResult = await googleDriveSystem.downloadDriveFileWithSystemOAuth(fileId);
  if (sysResult.ok && sysResult.buf) {
    return sysResult;
  }

  // 2. Fallback to optional explicit Google token if provided
  if (explicitToken) {
    const tokenResult = await fetchUpstreamImage(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
      explicitToken
    );
    if (tokenResult.ok && tokenResult.buf) {
      return tokenResult;
    }
  }

  // 3. Fallback to public Google Drive CDN endpoints for publicly shared assets
  const { primary, fallbacks } = normalizeGoogleDriveUrl(fileId);
  const cdnCandidates = [primary, ...fallbacks].filter((u) => u && u.startsWith('http'));
  let lastStatus = sysResult.status || 404;
  let lastError = sysResult.error || 'Google Drive file not accessible';

  for (const candidate of cdnCandidates) {
    const cdnRes = await fetchUpstreamImage(candidate);
    if (cdnRes.ok && cdnRes.buf) {
      return cdnRes;
    }
    if (cdnRes.status === 404) {
      lastStatus = 404;
      lastError = cdnRes.error || 'File not found';
    } else if (lastStatus !== 404) {
      lastStatus = cdnRes.status || 502;
      lastError = cdnRes.error || lastError;
    }
  }

  return {
    ok: false,
    status: lastStatus === 503 ? 502 : lastStatus,
    contentType: '',
    error: lastError,
  };
}

const proxyImageHandler = async (req: any, res: any) => {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    const rawUrl = String(req.query.url || req.query.id || req.query.fileId || '').trim();
    if (!rawUrl) return res.status(400).json({ error: 'Missing url or id parameter' });

    const googleToken = String(req.query.google_token || req.headers['x-google-token'] || req.headers['x-goog-token'] || '').trim();

    // Handle local /uploads/ path
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
      return res.status(404).json({ error: 'Local uploaded image not found' });
    }

    // Google Drive file resolution via System OAuth + CDN fallbacks
    const { fileId } = normalizeGoogleDriveUrl(rawUrl);
    if (fileId) {
      const driveResult = await resolveDriveFileResponse(fileId, googleToken);
      if (driveResult.ok && driveResult.buf) {
        res.setHeader('Content-Type', driveResult.contentType || 'image/jpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.send(driveResult.buf);
      }
      return res.status(driveResult.status || 404).json({
        error: driveResult.error || 'Không thể tải ảnh từ Google Drive',
      });
    }

    // External non-Drive HTTP(S) URL with SSRF protection
    if (!isSafeExternalImageUrl(rawUrl)) {
      return res.status(403).json({ error: 'Blocked unsafe or private image URL' });
    }

    const extResult = await fetchUpstreamImage(rawUrl);
    if (extResult.ok && extResult.buf) {
      res.setHeader('Content-Type', extResult.contentType || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(extResult.buf);
    }

    return res.status(extResult.status || 502).json({
      error: extResult.error || 'Không thể tải ảnh từ nguồn bên ngoài',
    });
  } catch (err: any) {
    sendErr(res, err);
  }
};
app.get('/api/proxy-image', proxyImageHandler);
app.get('/api/images/proxy', proxyImageHandler);

// Serve Google Drive media IDs via System OAuth (transparent to end users) and guard legacy image paths
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

    const { fileId } = normalizeGoogleDriveUrl(candidateId);
    const resolvedDriveId = fileId || (/^[a-zA-Z0-9_-]{15,}$/.test(candidateId) ? candidateId : '');
    if (resolvedDriveId) {
      const googleToken = String(req.query.google_token || req.headers['x-google-token'] || req.headers['x-goog-token'] || '').trim();
      const driveResult = await resolveDriveFileResponse(resolvedDriveId, googleToken);
      if (driveResult.ok && driveResult.buf) {
        res.setHeader('Content-Type', driveResult.contentType || 'image/jpeg');
        if (req.query.download === '1' || req.query.download === 'true') {
          const dlName = String(req.query.filename || resolvedDriveId).replace(/["\r\n]/g, '_');
          res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(dlName)}"`);
        }
        res.setHeader('Cache-Control', 'public, max-age=86400');
        if (req.method === 'HEAD') return res.status(200).end();
        return res.send(driveResult.buf);
      }
      return res.status(driveResult.status || 404).json({
        error: driveResult.error || 'Không thể tải ảnh từ Google Drive',
      });
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

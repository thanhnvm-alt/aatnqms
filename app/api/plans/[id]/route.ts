import { NextRequest } from 'next/server';
import { plansService } from '../../../../services/plansService';
import { PlanUpdateSchema } from '../../../../lib/validations';
import { successResponse, errorResponse, generateRequestId } from '../../../../lib/api-response';
import { ValidationError } from '../../../../lib/errors';

interface RouteParams {
  params: { id: string };
}

const validateId = (idStr: string) => {
  const id = parseInt(idStr);
  if (isNaN(id)) throw new ValidationError("ID không hợp lệ");
  return id;
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  const requestId = generateRequestId();
  try {
    const id = validateId(params.id);
    const plan = await plansService.getPlanById(id);
    return successResponse(plan, 200, { requestId });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const requestId = generateRequestId();
  try {
    const id = validateId(params.id);
    const body = await request.json();

    const validation = PlanUpdateSchema.safeParse(body);
    if (!validation.success) {
      throw new ValidationError("Dữ liệu cập nhật không hợp lệ", validation.error.flatten().fieldErrors);
    }

    const updatedPlan = await plansService.updatePlan(id, validation.data);
    return successResponse(updatedPlan, 200, { requestId });

  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const requestId = generateRequestId();
  try {
    const id = validateId(params.id);
    await plansService.deletePlan(id);
    return successResponse({ message: "Đã xóa thành công" }, 200, { requestId });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
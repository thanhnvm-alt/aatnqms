
import { NextRequest } from 'next/server';
import { plansService } from '@/services/plansService';
import { PlanSchema, PaginationSchema } from '@/lib/validations';
import { successResponse, errorResponse, generateRequestId } from '@/lib/api-response';
import { ValidationError } from '@/lib/errors';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const requestId = generateRequestId();
  try {
    const { searchParams } = new URL(request.url);
    
    // Validate Query Params
    const query = PaginationSchema.safeParse({
      page: searchParams.get('page'),
      limit: searchParams.get('limit'),
      search: searchParams.get('search')
    });

    if (!query.success) {
      throw new ValidationError('Tham số truy vấn không hợp lệ', query.error.flatten());
    }

    const { page, limit, search } = query.data;
    
    // Extract specific filters
    const filterType = searchParams.get('filterType');
    const filterValue = searchParams.get('filterValue');
    
    let filter = undefined;
    if (filterType && filterValue) {
        filter = { type: filterType, value: filterValue };
    }

    const { items, total } = await plansService.getPlans(page, limit, search, filter);

    return successResponse(items, 200, {
      requestId,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    return errorResponse(error, requestId);
  }
}

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();
  try {
    const body = await request.json();

    // Validate Input Body
    const validation = PlanSchema.safeParse(body);
    if (!validation.success) {
      throw new ValidationError("Dữ liệu đầu vào không hợp lệ", validation.error.flatten().fieldErrors);
    }

    const newPlan = await plansService.createPlan(validation.data);

    return successResponse(newPlan, 201, { requestId });

  } catch (error) {
    return errorResponse(error, requestId);
  }
}

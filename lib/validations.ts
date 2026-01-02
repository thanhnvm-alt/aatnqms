
import { z } from 'zod';

export const PlanSchema = z.object({
  headcode: z.string({ required_error: "Headcode là bắt buộc" })
    .min(3, "Headcode phải có ít nhất 3 ký tự")
    .max(50, "Headcode quá dài"),
  
  ma_ct: z.string({ required_error: "Mã công trình là bắt buộc" })
    .min(1, "Mã công trình không được để trống"),
  
  ten_ct: z.string({ required_error: "Tên công trình là bắt buộc" })
    .min(1, "Tên công trình không được để trống"),
  
  ten_hang_muc: z.string({ required_error: "Tên hạng mục là bắt buộc" })
    .min(1, "Tên hạng mục không được để trống"),
  
  dvt: z.string().optional().default('PCS'),
  
  so_luong_ipo: z.coerce.number()
    .min(0, "Số lượng không được âm")
    .default(0),
});

export const PlanUpdateSchema = PlanSchema.partial();

export const PaginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional()
});

export type PlanInput = z.infer<typeof PlanSchema>;

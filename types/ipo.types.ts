
export interface IpoEntity {
  id: string;
  ma_ct: string;
  ten_ct: string;
  ten_hang_muc: string;
  so_luong_ipo: number;
  dvt: string;
  ma_nha_may: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FLAGGED';
  created_at: number; // Unix timestamp
}

export interface IpoListResponse {
  success: boolean;
  data: IpoEntity[];
  meta: {
    total: number;
    timestamp: number;
  };
}

export interface IpoListParams {
  search?: string;
  sortBy?: 'created_at' | 'ma_ct';
  order?: 'asc' | 'desc';
}

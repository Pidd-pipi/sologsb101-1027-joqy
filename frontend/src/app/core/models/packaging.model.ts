/** 容器类型 */
export type ContainerType = '桶装' | '瓶装' | '罐装';

/** 罐装批次 */
export interface Packaging {
  id: string;
  /** 批次号 */
  batchNo: string;
  /** 所属配方 */
  recipeId: string;
  /** 罐装日期 */
  packDate: string;
  /** 容器 */
  container: ContainerType;
  /** 数量 */
  quantity: number;
  /** 二氧化碳体积 */
  carbonationVol: number;
  /** 最终酒精度 %vol */
  abv: number;
}

export const CONTAINER_TYPES: ContainerType[] = ['桶装', '瓶装', '罐装'];

export function createEmptyPackaging(): Omit<Packaging, 'id'> {
  return {
    batchNo: '',
    recipeId: '',
    packDate: new Date().toISOString().slice(0, 10),
    container: '瓶装',
    quantity: 24,
    carbonationVol: 2.4,
    abv: 5.2
  };
}

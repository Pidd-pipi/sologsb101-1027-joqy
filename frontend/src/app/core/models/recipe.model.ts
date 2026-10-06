/** 啤酒风格 */
export type BeerStyle = 'IPA' | '小麦' | '世涛' | '拉格' | '酸啤';

/** 配方：糖化与发酵的顶层工艺定义 */
export interface Recipe {
  id: string;
  /** 配方名称 */
  name: string;
  /** 风格 */
  style: BeerStyle;
  /** 目标初始比重 OG */
  targetOg: number;
  /** 目标终点比重 FG */
  targetFg: number;
  /** 目标苦度 IBU */
  targetIbu: number;
  /** 目标色度 EBC */
  targetEbc: number;
  /** 批次体积 L */
  batchSizeL: number;
}

export const BEER_STYLES: BeerStyle[] = ['IPA', '小麦', '世涛', '拉格', '酸啤'];

export function createEmptyRecipe(): Omit<Recipe, 'id'> {
  return { name: '', style: 'IPA', targetOg: 1.06, targetFg: 1.012, targetIbu: 45, targetEbc: 12, batchSizeL: 20 };
}

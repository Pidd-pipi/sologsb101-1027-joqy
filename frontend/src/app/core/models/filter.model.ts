/** FilterBar 的下拉筛选项 */
export interface FilterSelectOption {
  label: string;
  value: string;
}

/** FilterBar 的下拉筛选配置 */
export interface FilterSelectConfig {
  /** query key，同时作为组件内唯一标识 */
  key: string;
  label: string;
  options: FilterSelectOption[];
  placeholder?: string;
  /** 多选（默认）或单选 */
  multiple?: boolean;
}

/** 筛选模型：keyword + 任意多选 / 单选字段 */
export interface FilterModel {
  keyword: string;
  [key: string]: string | string[] | boolean;
}

/** 把筛选条件序列化为路由 query params */
export function filtersToQueryParams(filters: FilterModel): Record<string, string> {
  const params: Record<string, string> = {};
  Object.entries(filters).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      if (value.length > 0) params[key] = value.join(',');
    } else if (typeof value === 'string') {
      if (value.length > 0) params[key] = value;
    } else if (typeof value === 'boolean' && value) {
      params[key] = '1';
    }
  });
  return params;
}

/** 从路由 query params 还原筛选条件 */
export function queryParamsToFilters(
  params: Record<string, string | undefined>,
  keys: string[]
): FilterModel {
  const filters: FilterModel = { keyword: '' };
  keys.forEach((key) => {
    const raw = params[key];
    if (raw === '1') filters[key] = true;
    else if (typeof raw === 'string' && raw.length > 0) filters[key] = raw.split(',').filter((item) => item.length > 0);
    else filters[key] = [];
  });
  if (typeof params['keyword'] === 'string') filters.keyword = params['keyword'];
  return filters;
}

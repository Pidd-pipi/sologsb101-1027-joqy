/** 发酵读数 feature selectors */
import { createFeatureSelector, createSelector } from '@ngrx/store';
import { GravityTrendService } from '../../services/gravity-trend.service';
import type { ActualsRow, FermentRow } from '../../utils/db';
import { effectiveReadings } from '../../utils/actuals';
import { selectSelectedRecipe } from '../recipe/recipe.selectors';
import { FermentState } from './ferment.reducer';

export const selectFermentState = createFeatureSelector<FermentState>('ferment');

export const selectAllFerments = createSelector(selectFermentState, (state) => state.ferments);
export const selectFermentFilter = createSelector(selectFermentState, (state) => state.filter);
export const selectSelectedBatchNo = createSelector(selectFermentState, (state) => state.batchNo);
export const selectFermentError = createSelector(selectFermentState, (state) => state.error);
export const selectFermentNotice = createSelector(selectFermentState, (state) => state.notice);
export const selectMergeDrafts = createSelector(selectFermentState, (state) => state.drafts);
export const selectActualsMap = createSelector(selectFermentState, (state) => state.actuals);
export const selectStaleRecipeIds = createSelector(selectFermentState, (state) => state.staleRecipeIds);

/** 含双方变体的冲突读数行 */
export const selectConflictRows = createSelector(selectAllFerments, (ferments) =>
  ferments.filter((row) => (row.variants?.length ?? 0) > 1)
);

/** 配方实绩快照（未算过时为 null） */
export const selectActualsForRecipe = (recipeId: string) =>
  createSelector(selectActualsMap, (map): ActualsRow | null => map[recipeId] ?? null);

/** 全部批次号（去重） */
export const selectBatchNumbers = createSelector(selectAllFerments, (ferments) =>
  Array.from(new Set(ferments.map((item) => item.batchNo))).sort()
);

/** 当前选中批次的原始读数行（按日期升序）；冲突行带 variants，表格里展开双方值 */
export const selectCurrentBatchFerments = createSelector(
  selectAllFerments,
  selectSelectedBatchNo,
  (ferments, batchNo) =>
    ferments.filter((item) => item.batchNo === batchNo).sort((a, b) => a.date.localeCompare(b.date))
);

/** 按筛选条件过滤后的读数 */
export const selectFilteredFerments = createSelector(selectAllFerments, selectFermentFilter, (ferments, filter) => {
  const keyword = String(filter['keyword'] ?? '').trim().toLowerCase();
  const states = Array.isArray(filter['states']) ? (filter['states'] as string[]) : [];
  return ferments.filter((item) => {
    const label = `${item.batchNo} ${item.state} ${item.date}`.toLowerCase();
    if (keyword && !label.includes(keyword)) return false;
    if (states.length > 0 && !states.includes(item.state)) return false;
    return true;
  });
});

/** 当前批次的派生指标（冲突时双方值都参与计算） */
export const selectCurrentBatchMetrics = createSelector(
  selectAllFerments,
  selectSelectedBatchNo,
  selectSelectedRecipe,
  (ferments, batchNo, recipe) => {
    const rows = batchNo ? ferments.filter((item) => item.batchNo === batchNo) : ferments;
    const readings = effectiveReadings(rows).map((item) => ({
      id: `${item.batchNo}-${item.date}-${item.savedAt}`,
      batchNo: item.batchNo,
      recipeId: item.recipeId,
      date: item.date,
      gravity: item.gravity,
      tempC: item.tempC,
      diacetylPpm: item.diacetylPpm,
      state: item.state
    }));
    return GravityTrendService.calculate(readings, recipe);
  }
);

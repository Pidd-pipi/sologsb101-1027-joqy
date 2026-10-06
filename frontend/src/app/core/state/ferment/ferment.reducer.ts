/** 发酵读数 feature reducer（读数、配方实绩快照、可续合并草稿） */
import { createReducer, on } from '@ngrx/store';
import type { FilterModel } from '../../models/filter.model';
import type { ActualsRow, FermentRow, MergeDraftRow } from '../../utils/db';
import { FermentActions } from './ferment.actions';

export interface FermentState {
  ferments: FermentRow[];
  /** 配方实绩快照（recipeId → 快照），stale=true 表示读数已变、正在重算 */
  actuals: Record<string, ActualsRow>;
  /** 写入失败后整组回滚留下的草稿 */
  drafts: MergeDraftRow[];
  /** 当前标签页刚改动、实绩已失效的配方 id */
  staleRecipeIds: string[];
  batchNo: string | null;
  filter: FilterModel;
  loading: boolean;
  /** 最近一次保存 / 合并结果的可读提示 */
  notice: string | null;
  error: string | null;
}

export const initialFermentState: FermentState = {
  ferments: [],
  actuals: {},
  drafts: [],
  staleRecipeIds: [],
  batchNo: null,
  filter: { keyword: '', states: [] },
  loading: false,
  notice: null,
  error: null
};

function toActualsMap(rows: ActualsRow[]): Record<string, ActualsRow> {
  return rows.reduce<Record<string, ActualsRow>>((map, row) => {
    map[row.recipeId] = row;
    return map;
  }, {});
}

export const fermentReducer = createReducer(
  initialFermentState,
  on(FermentActions.loadFerments, (state) => ({ ...state, loading: true, error: null })),
  on(FermentActions.loadFermentsSuccess, (state, { ferments, actuals, drafts }) => ({
    ...state,
    ferments,
    actuals: toActualsMap(actuals),
    drafts,
    staleRecipeIds: actuals.filter((row) => row.stale).map((row) => row.recipeId),
    loading: false,
    batchNo: state.batchNo ?? ferments[0]?.batchNo ?? null
  })),
  on(FermentActions.loadFermentsFailure, (state, { error }) => ({ ...state, loading: false, error })),
  on(FermentActions.setFilter, (state, { filter }) => ({ ...state, filter })),
  on(FermentActions.resetFilter, (state) => ({ ...state, filter: { keyword: '', states: [] } })),
  on(FermentActions.selectBatch, (state, { batchNo }) => ({ ...state, batchNo })),
  on(FermentActions.actualsStale, (state, { recipeIds }) => {
    const now = Date.now();
    const actuals = recipeIds.reduce<Record<string, ActualsRow>>(
      (map, recipeId) => {
        const previous = map[recipeId];
        map[recipeId] = {
          recipeId,
          og: previous?.og ?? 0,
          fg: previous?.fg ?? 0,
          abv: previous?.abv ?? 0,
          attenuation: previous?.attenuation ?? 0,
          fermentCount: previous?.fermentCount ?? 0,
          stale: true,
          revision: previous?.revision ?? 1,
          createdAt: previous?.createdAt ?? now,
          updatedAt: now
        };
        return map;
      },
      { ...state.actuals }
    );
    return {
      ...state,
      staleRecipeIds: Array.from(new Set([...state.staleRecipeIds, ...recipeIds])),
      actuals
    };
  }),
  on(FermentActions.submitSuccess, (state, { result }) => ({
    ...state,
    staleRecipeIds: state.staleRecipeIds.filter((id) => !result.affectedRecipeIds.includes(id)),
    notice:
      result.conflicts > 0
        ? `已合并 ${result.upserted} 条读数，其中 ${result.conflicts} 条与另一标签页同改一天，双方值都已保留`
        : `已合并 ${result.upserted} 条读数，配方实绩与罐装酒精度已重算`
  })),
  on(FermentActions.submitFailure, (state, { error }) => ({
    ...state,
    notice: null,
    error: `整组改动已回滚并存为草稿，可稍后继续合并：${error}`
  })),
  on(FermentActions.retryDraft, (state) => ({ ...state, error: null })),
  on(FermentActions.discardDraft, (state, { draftId }) => ({
    ...state,
    drafts: state.drafts.filter((draft) => draft.id !== draftId)
  }))
);

/** 发酵读数 feature reducer */
import { createReducer, on } from '@ngrx/store';
import type { FilterModel } from '../../models/filter.model';
import type { FermentConflictRow, FermentDraftRow, FermentRow } from '../../utils/db';
import { FermentActions } from './ferment.actions';

export interface FermentState {
  ferments: FermentRow[];
  /** 待处理 / 已解决的合并冲突（按批次号 + 日期守住同一份实绩时产生） */
  conflicts: FermentConflictRow[];
  /** 写入失败留下的可继续合并草稿 */
  drafts: FermentDraftRow[];
  batchNo: string | null;
  filter: FilterModel;
  loading: boolean;
  error: string | null;
  /** 一次性提示（冲突产生、草稿留存等），展示后即清除 */
  notice: string | null;
}

export const initialFermentState: FermentState = {
  ferments: [],
  conflicts: [],
  drafts: [],
  batchNo: null,
  filter: { keyword: '', states: [] },
  loading: false,
  error: null,
  notice: null
};

export const fermentReducer = createReducer(
  initialFermentState,
  on(FermentActions.loadFerments, (state) => ({ ...state, loading: true, error: null })),
  on(FermentActions.loadFermentsSuccess, (state, { ferments }) => ({
    ...state,
    ferments,
    loading: false,
    batchNo: state.batchNo ?? ferments[0]?.batchNo ?? null
  })),
  on(FermentActions.loadFermentsFailure, (state, { error }) => ({ ...state, loading: false, error })),
  on(FermentActions.loadSyncSuccess, (state, { conflicts, drafts }) => ({ ...state, conflicts, drafts })),
  on(FermentActions.mutationFailure, (state, { error }) => ({ ...state, error })),
  on(FermentActions.syncNotice, (state, { notice }) => ({ ...state, notice })),
  on(FermentActions.clearNotice, (state) => ({ ...state, notice: null })),
  on(FermentActions.setFilter, (state, { filter }) => ({ ...state, filter })),
  on(FermentActions.resetFilter, (state) => ({ ...state, filter: { keyword: '', states: [] } })),
  on(FermentActions.selectBatch, (state, { batchNo }) => ({ ...state, batchNo }))
);

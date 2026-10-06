/** 罐装批次 feature reducer */
import { createReducer, on } from '@ngrx/store';
import type { FilterModel } from '../../models/filter.model';
import type { PackagingRow } from '../../utils/db';
import { PackagingActions } from './packaging.actions';

export interface PackagingState {
  packagings: PackagingRow[];
  filter: FilterModel;
  /** 保存失败回滚后的提示（整组改动已进草稿） */
  error: string | null;
}

export const initialPackagingState: PackagingState = {
  packagings: [],
  filter: { keyword: '', containers: [] },
  error: null
};

export const packagingReducer = createReducer(
  initialPackagingState,
  on(PackagingActions.loadPackagingsSuccess, (state, { packagings }) => ({ ...state, packagings, error: null })),
  on(PackagingActions.setFilter, (state, { filter }) => ({ ...state, filter })),
  on(PackagingActions.resetFilter, (state) => ({ ...state, filter: { keyword: '', containers: [] } })),
  on(PackagingActions.submitPackaging, (state) => ({ ...state, error: null })),
  on(PackagingActions.submitPackagingSuccess, (state) => ({ ...state, error: null })),
  on(PackagingActions.submitPackagingFailure, (state, { error }) => ({
    ...state,
    error: `罐装批次保存已回滚并存为草稿，可稍后继续合并：${error}`
  }))
);

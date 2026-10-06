/** 罐装批次 feature reducer */
import { createReducer, on } from '@ngrx/store';
import type { FilterModel } from '../../models/filter.model';
import type { PackagingRow } from '../../utils/db';
import { PackagingActions } from './packaging.actions';

export interface PackagingState {
  packagings: PackagingRow[];
  filter: FilterModel;
}

export const initialPackagingState: PackagingState = {
  packagings: [],
  filter: { keyword: '', containers: [] }
};

export const packagingReducer = createReducer(
  initialPackagingState,
  on(PackagingActions.loadPackagingsSuccess, (state, { packagings }) => ({ ...state, packagings })),
  on(PackagingActions.setFilter, (state, { filter }) => ({ ...state, filter })),
  on(PackagingActions.resetFilter, (state) => ({ ...state, filter: { keyword: '', containers: [] } }))
);

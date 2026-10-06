/** 发酵读数 feature reducer */
import { createReducer, on } from '@ngrx/store';
import type { FilterModel } from '../../models/filter.model';
import type { FermentRow } from '../../utils/db';
import { FermentActions } from './ferment.actions';

export interface FermentState {
  ferments: FermentRow[];
  batchNo: string | null;
  filter: FilterModel;
  loading: boolean;
  error: string | null;
}

export const initialFermentState: FermentState = {
  ferments: [],
  batchNo: null,
  filter: { keyword: '', states: [] },
  loading: false,
  error: null
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
  on(FermentActions.setFilter, (state, { filter }) => ({ ...state, filter })),
  on(FermentActions.resetFilter, (state) => ({ ...state, filter: { keyword: '', states: [] } })),
  on(FermentActions.selectBatch, (state, { batchNo }) => ({ ...state, batchNo }))
);

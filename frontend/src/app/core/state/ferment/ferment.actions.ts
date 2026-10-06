/** 发酵读数 feature 的 NgRx actions */
import { createActionGroup, emptyProps, props } from '@ngrx/store';
import type { FilterModel } from '../../models/filter.model';
import type { Ferment } from '../../models/ferment.model';
import type { FermentRow } from '../../utils/db';

export const FermentActions = createActionGroup({
  source: 'Ferment',
  events: {
    'Load Ferments': emptyProps(),
    'Load Ferments Success': props<{ ferments: FermentRow[] }>(),
    'Load Ferments Failure': props<{ error: string }>(),
    'Set Filter': props<{ filter: FilterModel }>(),
    'Reset Filter': emptyProps(),
    'Select Batch': props<{ batchNo: string | null }>(),
    'Create Ferment': props<{ payload: Omit<Ferment, 'id'> }>(),
    'Update Ferment': props<{ id: string; patch: Partial<Ferment> }>(),
    'Delete Ferment': props<{ id: string }>()
  }
});

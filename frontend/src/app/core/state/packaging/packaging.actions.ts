/** 罐装批次 feature 的 NgRx actions */
import { createActionGroup, emptyProps, props } from '@ngrx/store';
import type { FilterModel } from '../../models/filter.model';
import type { Packaging } from '../../models/packaging.model';
import type { PackagingRow } from '../../utils/db';

export const PackagingActions = createActionGroup({
  source: 'Packaging',
  events: {
    'Load Packagings': emptyProps(),
    'Load Packagings Success': props<{ packagings: PackagingRow[] }>(),
    'Set Filter': props<{ filter: FilterModel }>(),
    'Reset Filter': emptyProps(),
    'Create Packaging': props<{ payload: Omit<Packaging, 'id'> }>(),
    'Update Packaging': props<{ id: string; patch: Partial<Packaging> }>(),
    'Delete Packaging': props<{ id: string }>()
  }
});

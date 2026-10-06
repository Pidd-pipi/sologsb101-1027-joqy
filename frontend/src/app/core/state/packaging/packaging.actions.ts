/** 罐装批次 feature 的 NgRx actions（保存经 SyncMergeService 按批次号+日期归并） */
import { createActionGroup, emptyProps, props } from '@ngrx/store';
import type { FilterModel } from '../../models/filter.model';
import type { PackagingUpsert } from '../../models/sync.model';
import type { PackagingRow } from '../../utils/db';

export const PackagingActions = createActionGroup({
  source: 'Packaging',
  events: {
    'Load Packagings': emptyProps(),
    'Load Packagings Success': props<{ packagings: PackagingRow[] }>(),
    'Set Filter': props<{ filter: FilterModel }>(),
    'Reset Filter': emptyProps(),
    /** 按批次号 + 罐装日期归并保存，ABV 由发酵读数当场重算；失败整组回滚并落草稿 */
    'Submit Packaging': props<{ upsert: PackagingUpsert }>(),
    'Submit Packaging Success': emptyProps(),
    'Submit Packaging Failure': props<{ error: string; draftId: string }>(),
    'Delete Packaging': props<{ id: string }>()
  }
});

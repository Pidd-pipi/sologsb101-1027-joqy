/** 发酵读数 feature 的 NgRx actions（读数提交经 SyncMergeService 做三方合并） */
import { createActionGroup, emptyProps, props } from '@ngrx/store';
import type { FilterModel } from '../../models/filter.model';
import type { Ferment } from '../../models/ferment.model';
import type { FermentChange } from '../../models/sync.model';
import type { FermentRow, ActualsRow, MergeDraftRow } from '../../utils/db';
import type { SubmitResult } from '../../services/sync-merge.service';

export const FermentActions = createActionGroup({
  source: 'Ferment',
  events: {
    'Load Ferments': emptyProps(),
    'Load Ferments Success': props<{ ferments: FermentRow[]; actuals: ActualsRow[]; drafts: MergeDraftRow[] }>(),
    'Load Ferments Failure': props<{ error: string }>(),
    'Set Filter': props<{ filter: FilterModel }>(),
    'Reset Filter': emptyProps(),
    'Select Batch': props<{ batchNo: string | null }>(),

    /** 整组提交读数改动（一个表单一组；失败整组回滚并落草稿） */
    'Submit Changes': props<{ changes: FermentChange[] }>(),
    'Submit Success': props<{ result: Extract<SubmitResult, { ok: true }> }>(),
    'Submit Failure': props<{ error: string; draftId: string }>(),
    /** 读数改动后配方实绩失效（提交前发出，页面立即显示「实绩重算中」） */
    'Actuals Stale': props<{ recipeIds: string[] }>(),

    /** 关闭页面重开后接着处理：重新合并草稿 */
    'Retry Draft': props<{ draftId: string }>(),
    'Discard Draft': props<{ draftId: string }>(),
    /** 冲突裁决：选定某一方的值作为唯一实绩 */
    'Resolve Conflict': props<{
      rowId: string;
      chosen: Pick<Ferment, 'gravity' | 'tempC' | 'diacetylPpm' | 'state'>;
    }>(),
    /** 删除冲突行里某一个来源的值（剩一个时自动收敛） */
    'Remove Variant': props<{ rowId: string; sourceId: string }>()
  }
});

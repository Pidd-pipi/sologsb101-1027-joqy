/**
 * 发酵 feature effects：加载发酵读数与罐装批次，并把增删改经合并器写回 IndexedDB。
 * 发酵读数的写入一律走 FermentSyncService：按「批次号 + 日期」合并、
 * 冲突保留双方、同事务重算罐装酒精度、失败回滚并留草稿。
 */
import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store, type Action } from '@ngrx/store';
import { auditTime, catchError, exhaustMap, forkJoin, from, map, of, switchMap, withLatestFrom } from 'rxjs';
import type { Ferment } from '../../models/ferment.model';
import type { FermentMutation } from '../../models/ferment-draft.model';
import { FermentSyncService, type MergeOutcome } from '../../services/ferment-sync.service';
import { RecipeService } from '../../services/recipe.service';
import type { FermentRow } from '../../utils/db';
import { PackagingActions } from '../packaging/packaging.actions';
import { RecipeActions } from '../recipe/recipe.actions';
import { FermentActions } from './ferment.actions';
import { selectAllFerments } from './ferment.selectors';

@Injectable()
export class FermentEffects {
  private readonly actions$ = inject(Actions);
  private readonly store = inject(Store);
  private readonly service = inject(RecipeService);
  private readonly sync = inject(FermentSyncService);

  /** 配方页广播 Reload All 时也一并刷新发酵、罐装、冲突与草稿 */
  reload$ = createEffect(() =>
    this.actions$.pipe(
      ofType(FermentActions.loadFerments, RecipeActions.reloadAll),
      switchMap(() =>
        forkJoin({
          ferments: from(this.service.listFerments()),
          packagings: from(this.service.listPackagings()),
          conflicts: from(this.sync.listConflicts()),
          drafts: from(this.sync.listDrafts())
        }).pipe(
          switchMap((data) => [
            FermentActions.loadFermentsSuccess({ ferments: data.ferments }),
            PackagingActions.loadPackagingsSuccess({ packagings: data.packagings }),
            FermentActions.loadSyncSuccess({ conflicts: data.conflicts, drafts: data.drafts })
          ]),
          catchError((error: unknown) =>
            of(
              FermentActions.loadFermentsFailure({
                error: error instanceof Error ? error.message : '本地数据读取失败'
              })
            )
          )
        )
      )
    )
  );

  /** 跨标签页同步：任一标签页改动实绩相关表后，本标签页立即重载同一份实绩 */
  watch$ = createEffect(() =>
    this.sync.watchChanges().pipe(
      auditTime(200),
      map(() => FermentActions.loadFerments())
    )
  );

  /** 发酵读数的增删改：经合并器按批次号 + 日期并入当前库 */
  fermentMutation$ = createEffect(() =>
    this.actions$.pipe(
      ofType(FermentActions.createFerment, FermentActions.updateFerment, FermentActions.deleteFerment),
      withLatestFrom(this.store.select(selectAllFerments)),
      exhaustMap(([action, ferments]) =>
        from(this.sync.applyMutation(this.toMutation(action, ferments))).pipe(
          switchMap((outcome) => this.outcomeActions(outcome)),
          catchError((error: unknown) =>
            of(
              FermentActions.mutationFailure({
                error: error instanceof Error ? error.message : '保存失败'
              })
            )
          )
        )
      )
    )
  );

  /** 冲突处理与草稿续合 / 丢弃 */
  syncOps$ = createEffect(() =>
    this.actions$.pipe(
      ofType(FermentActions.resolveConflict, FermentActions.retryDraft, FermentActions.discardDraft),
      exhaustMap((action) =>
        from(this.runSyncOp(action)).pipe(
          switchMap((outcome) => this.outcomeActions(outcome)),
          catchError((error: unknown) =>
            of(
              FermentActions.mutationFailure({
                error: error instanceof Error ? error.message : '操作失败'
              })
            )
          )
        )
      )
    )
  );

  /** 罐装批次的增删改（读数改动引起的酒精度重算由合并器在事务内完成） */
  packagingMutation$ = createEffect(() =>
    this.actions$.pipe(
      ofType(
        PackagingActions.createPackaging,
        PackagingActions.updatePackaging,
        PackagingActions.deletePackaging
      ),
      exhaustMap((action) =>
        from(this.persistPackaging(action)).pipe(
          map(() => FermentActions.loadFerments()),
          catchError((error: unknown) =>
            of(
              FermentActions.mutationFailure({
                error: error instanceof Error ? error.message : '保存失败'
              })
            )
          )
        )
      )
    )
  );

  /** 合并结果统一收尾：重载实绩；冲突或失败时给出可读提示 */
  private outcomeActions(outcome: MergeOutcome): Action[] {
    const actions: Action[] = [FermentActions.loadFerments()];
    if (!outcome.ok) {
      actions.push(
        FermentActions.mutationFailure({ error: outcome.error ?? '写入失败' }),
        FermentActions.syncNotice({
          notice: outcome.draftId
            ? '写入失败，整组已回滚；操作已存为草稿，可稍后或重开页面后继续合并'
            : `操作未完成：${outcome.error ?? '未知原因'}`
        })
      );
    } else if (outcome.conflictId) {
      actions.push(
        FermentActions.syncNotice({ notice: '检测到另一标签页改动了同批次同天读数，双方值已保留，请在冲突列表中处理' })
      );
    }
    return actions;
  }

  /** 把页面动作组装成合并器需要的写入意图（基准 updatedAt 用于并发检测） */
  private toMutation(action: Action, ferments: FermentRow[]): FermentMutation {
    const source = this.sync.source();
    if (action.type === FermentActions.createFerment.type) {
      const { payload } = action as unknown as { payload: Omit<Ferment, 'id'> };
      return { kind: 'create', rowId: null, payload, baseUpdatedAt: null, source };
    }
    if (action.type === FermentActions.updateFerment.type) {
      const { id, patch, baseUpdatedAt } = action as unknown as {
        id: string;
        patch: Partial<Ferment>;
        baseUpdatedAt: number | null;
      };
      const base = ferments.find((row) => row.id === id);
      const payload: Omit<Ferment, 'id'> = {
        batchNo: patch.batchNo ?? base?.batchNo ?? '',
        recipeId: patch.recipeId ?? base?.recipeId ?? '',
        date: patch.date ?? base?.date ?? '',
        gravity: patch.gravity ?? base?.gravity ?? 0,
        tempC: patch.tempC ?? base?.tempC ?? 0,
        diacetylPpm: patch.diacetylPpm ?? base?.diacetylPpm ?? 0,
        state: patch.state ?? base?.state ?? '主发酵'
      };
      return { kind: 'update', rowId: id, payload, baseUpdatedAt, source };
    }
    const { id, baseUpdatedAt } = action as unknown as { id: string; baseUpdatedAt: number | null };
    const base = ferments.find((row) => row.id === id);
    const payload: Omit<Ferment, 'id'> | null = base
      ? {
          batchNo: base.batchNo,
          recipeId: base.recipeId,
          date: base.date,
          gravity: base.gravity,
          tempC: base.tempC,
          diacetylPpm: base.diacetylPpm,
          state: base.state
        }
      : null;
    return { kind: 'delete', rowId: id, payload, baseUpdatedAt, source };
  }

  private runSyncOp(action: Action): Promise<MergeOutcome> {
    if (action.type === FermentActions.resolveConflict.type) {
      const { id, choice } = action as unknown as { id: string; choice: 'kept' | 'incoming' };
      return this.sync.resolveConflict(id, choice);
    }
    if (action.type === FermentActions.retryDraft.type) {
      const { id } = action as unknown as { id: string };
      return this.sync.retryDraft(id);
    }
    const { id } = action as unknown as { id: string };
    return this.sync.discardDraft(id);
  }

  private persistPackaging(action: Action): Promise<unknown> {
    const payload = action as unknown as Record<string, unknown>;
    switch (action.type) {
      case PackagingActions.createPackaging.type:
        return this.service.createPackaging(payload['payload'] as never);
      case PackagingActions.updatePackaging.type:
        return this.service.updatePackaging(payload['id'] as string, payload['patch'] as never);
      default:
        return this.service.deletePackaging(payload['id'] as string);
    }
  }
}

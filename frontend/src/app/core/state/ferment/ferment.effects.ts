/**
 * 发酵 feature effects：
 * - 装载发酵读数、配方实绩快照与可续合并草稿
 * - 读数提交经 SyncMergeService 三方合并：整组事务、回滚草稿、实绩失效重算、罐装 ABV 回写
 * - 收到其它标签页的提交通知时重新装载，两个标签页看到同一份实绩
 */
import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { catchError, exhaustMap, forkJoin, from, map, mergeMap, of, switchMap } from 'rxjs';
import { RecipeService } from '../../services/recipe.service';
import { SyncMergeService } from '../../services/sync-merge.service';
import { listActuals, listMergeDrafts } from '../../utils/db';
import { PackagingActions } from '../packaging/packaging.actions';
import { RecipeActions } from '../recipe/recipe.actions';
import { FermentActions } from './ferment.actions';

@Injectable()
export class FermentEffects {
  private readonly actions$ = inject(Actions);
  private readonly store = inject(Store);
  private readonly service = inject(RecipeService);
  private readonly sync = inject(SyncMergeService);

  constructor() {
    // 其它标签页提交后立即重新装载（BroadcastChannel；不支持的浏览器退化为手动刷新 / liveQuery）
    this.sync.onRemoteCommit(() => {
      this.store.dispatch(RecipeActions.reloadAll());
      this.store.dispatch(FermentActions.loadFerments());
    });
  }

  /** 配方页广播 Reload All、本页主动装载、其它标签页提交后：刷新读数 / 实绩 / 草稿 / 罐装 */
  reload$ = createEffect(() =>
    this.actions$.pipe(
      ofType(FermentActions.loadFerments, RecipeActions.reloadAll),
      switchMap(() =>
        forkJoin({
          ferments: from(this.service.listFerments()),
          packagings: from(this.service.listPackagings()),
          actuals: from(listActuals()),
          drafts: from(listMergeDrafts())
        }).pipe(
          switchMap((data) => [
            FermentActions.loadFermentsSuccess({
              ferments: data.ferments,
              actuals: data.actuals,
              drafts: data.drafts
            }),
            PackagingActions.loadPackagingsSuccess({ packagings: data.packagings })
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

  /** 提交读数：走整组合并事务；服务在事务前已把实绩标记失效 */
  submit$ = createEffect(() =>
    this.actions$.pipe(
      ofType(FermentActions.submitChanges),
      exhaustMap((action) =>
        from(this.sync.submitFermentChanges(action.changes)).pipe(
          mergeMap((result) =>
            result.ok
              ? [FermentActions.submitSuccess({ result }), FermentActions.loadFerments()]
              : [
                  FermentActions.submitFailure({ error: result.error, draftId: result.draftId }),
                  FermentActions.loadFerments()
                ]
          )
        )
      )
    )
  );

  /** 实绩失效标记：提交动作一发出就立即落到 store（读数一改，实绩立即失效） */
  markStale$ = createEffect(() =>
    this.actions$.pipe(
      ofType(FermentActions.submitChanges),
      map((action) =>
        FermentActions.actualsStale({
          recipeIds: Array.from(
            new Set(
              action.changes
                .map((change) => change.payload?.recipeId)
                .filter((id): id is string => Boolean(id))
            )
          )
        })
      )
    )
  );

  /** 关掉页面再打开后接着合并草稿 */
  retryDraft$ = createEffect(() =>
    this.actions$.pipe(
      ofType(FermentActions.retryDraft),
      exhaustMap((action) =>
        from(this.sync.retryDraft(action.draftId)).pipe(
          mergeMap((result) =>
            result.ok
              ? [FermentActions.submitSuccess({ result }), FermentActions.loadFerments()]
              : [
                  FermentActions.submitFailure({ error: result.error, draftId: result.draftId }),
                  FermentActions.loadFerments()
                ]
          )
        )
      )
    )
  );

  discardDraft$ = createEffect(() =>
    this.actions$.pipe(
      ofType(FermentActions.discardDraft),
      exhaustMap((action) =>
        from(this.sync.discardDraft(action.draftId)).pipe(map(() => FermentActions.loadFerments()))
      )
    )
  );

  resolveConflict$ = createEffect(() =>
    this.actions$.pipe(
      ofType(FermentActions.resolveConflict),
      exhaustMap((action) =>
        from(this.sync.resolveConflict(action.rowId, action.chosen)).pipe(
          mergeMap((result) =>
            result.ok
              ? [FermentActions.submitSuccess({ result }), FermentActions.loadFerments()]
              : [FermentActions.submitFailure({ error: result.error, draftId: result.draftId })]
          )
        )
      )
    )
  );

  removeVariant$ = createEffect(() =>
    this.actions$.pipe(
      ofType(FermentActions.removeVariant),
      exhaustMap((action) =>
        from(this.sync.removeVariant(action.rowId, action.sourceId)).pipe(
          mergeMap((result) =>
            result.ok
              ? [FermentActions.submitSuccess({ result }), FermentActions.loadFerments()]
              : [FermentActions.submitFailure({ error: result.error, draftId: result.draftId })]
          )
        )
      )
    )
  );

  /** 罐装批次删除仍走原服务；保存改由 packagingSubmit$ 处理 */
  packagingDelete$ = createEffect(() =>
    this.actions$.pipe(
      ofType(PackagingActions.deletePackaging),
      exhaustMap((action) =>
        from(this.service.deletePackaging(action.id)).pipe(
          map(() => FermentActions.loadFerments()),
          catchError((error: unknown) =>
            of(FermentActions.loadFermentsFailure({ error: error instanceof Error ? error.message : '删除失败' }))
          )
        )
      )
    )
  );

  /** 罐装批次保存：按批次号 + 日期归并，ABV 当场由读数重算；失败回滚落草稿 */
  packagingSubmit$ = createEffect(() =>
    this.actions$.pipe(
      ofType(PackagingActions.submitPackaging),
      exhaustMap((action) =>
        from(this.sync.submitPackaging(action.upsert)).pipe(
          mergeMap((result) =>
            result.ok
              ? [PackagingActions.submitPackagingSuccess(), FermentActions.loadFerments()]
              : [
                  PackagingActions.submitPackagingFailure({ error: result.error, draftId: result.draftId }),
                  FermentActions.loadFerments()
                ]
          )
        )
      )
    )
  );
}

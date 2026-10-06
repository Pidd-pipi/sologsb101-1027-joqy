/**
 * FermentSyncService：多标签页安全的发酵实绩合并器。
 *
 * - 配方实绩、发酵读数、罐装批次按「批次号 + 日期」守住同一份实绩：
 *   所有写入先按该键与库中现值比对，未冲突直接合并，冲突则双方值与来源都保留进冲突表。
 * - 任一读数改动后，在同一事务内重算该批次罐装酒精度（OG/FG 取该批次首末读数），
 *   配方实绩由状态流重新加载后立即失效重算。
 * - 整组写入包在一个 Dexie 事务里，失败即整体回滚；回滚后把操作意图写入草稿表，
 *   关掉页面再打开仍能继续合并。
 * - 跨标签页写入用 Web Locks 串行化，避免两个标签页同时读写导致冲突漏检。
 */
import { Injectable } from '@angular/core';
import { liveQuery } from 'dexie';
import { Observable } from 'rxjs';
import type { Ferment } from '../models/ferment.model';
import type { FermentConflictSide, FermentConflictState } from '../models/ferment-conflict.model';
import type { FermentMutation } from '../models/ferment-draft.model';
import { abvFromGravity } from '../utils/brew';
import { db, ROW_REVISION, type FermentConflictRow, type FermentDraftRow, type FermentRow } from '../utils/db';
import { clientId, createId } from '../utils/uuid';

/** 一次合并的结果 */
export interface MergeOutcome {
  ok: boolean;
  /** 产生了待处理冲突 */
  conflictId?: string;
  /** 写入失败后留下的草稿 id */
  draftId?: string;
  error?: string;
}

/** 跨标签页串行化用的锁名 */
const MERGE_LOCK = 'gbbrewhouse-ferment-merge';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

@Injectable({ providedIn: 'root' })
export class FermentSyncService {
  /** 当前标签页来源标识 */
  source(): string {
    return clientId();
  }

  /* ------------------------------ 查询 ------------------------------ */

  async listConflicts(): Promise<FermentConflictRow[]> {
    const rows = await db.fermentConflicts.toArray();
    return rows.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async listDrafts(): Promise<FermentDraftRow[]> {
    const rows = await db.fermentDrafts.toArray();
    return rows.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * 监听实绩相关四张表的变化（含其他标签页的写入，Dexie liveQuery 跨标签页广播），
   * 供 effects 触发整组重载，保证两个标签页看到同一份实绩。
   */
  watchChanges(): Observable<void> {
    return new Observable<void>((subscriber) => {
      const inner = liveQuery(async () => {
        await Promise.all([
          db.ferments.toArray(),
          db.packagings.toArray(),
          db.fermentConflicts.toArray(),
          db.fermentDrafts.toArray()
        ]);
        return true;
      }).subscribe({
        next: () => subscriber.next(),
        error: (error: unknown) => subscriber.error(error)
      });
      return () => inner.unsubscribe();
    });
  }

  /* --------------------------- 合并写入 --------------------------- */

  /**
   * 把一次写入意图并入当前库：
   * 未冲突的读数直接合并；同一批次同一天被另一来源改过则保留双方值与来源；
   * 随后同事务重算罐装酒精度。任一步失败整组回滚并留下草稿。
   */
  async applyMutation(mutation: FermentMutation): Promise<MergeOutcome> {
    try {
      let conflictId: string | undefined;
      await this.withLock(async () => {
        await db.transaction('rw', [db.ferments, db.packagings, db.fermentConflicts], async () => {
          const affectedBatches = new Set<string>();
          const now = Date.now();

          if (mutation.kind === 'create' && mutation.payload) {
            const target = mutation.payload;
            affectedBatches.add(target.batchNo);
            const existing = await this.findByKey(target.batchNo, target.date);
            if (!existing) {
              await db.ferments.put(this.stamp({ ...target, source: mutation.source }, now));
            } else if (!this.sameReading(existing, target)) {
              // 另一标签页已补录同一天的不同值：保留双方
              conflictId = await this.recordConflict(existing, { source: mutation.source, at: now, value: target });
            }
            // 同值补录：幂等合并，什么都不做
          } else if (mutation.kind === 'update' && mutation.rowId && mutation.payload) {
            const target = mutation.payload;
            affectedBatches.add(target.batchNo);
            const current = await db.ferments.get(mutation.rowId);
            if (!current) {
              // 另一标签页已删除该行：保留「已删除」与本次修改双方
              conflictId = await this.recordConflict(null, { source: mutation.source, at: now, value: target });
            } else {
              affectedBatches.add(current.batchNo);
              const stale = mutation.baseUpdatedAt !== null && current.updatedAt !== mutation.baseUpdatedAt;
              if (stale && !this.sameReading(current, target)) {
                // 另一标签页已抢先改过同一行且值不同：保留双方
                conflictId = await this.recordConflict(current, { source: mutation.source, at: now, value: target });
              } else {
                // 键被改到了另一天/另一个批次：检查是否撞上已有读数
                const collision = await this.findByKey(target.batchNo, target.date, mutation.rowId);
                if (collision && !this.sameReading(collision, target)) {
                  conflictId = await this.recordConflict(collision, {
                    source: mutation.source,
                    at: now,
                    value: target
                  });
                } else {
                  await db.ferments.put({ ...current, ...target, source: mutation.source, updatedAt: now });
                  if (collision) await db.ferments.delete(collision.id); // 同值去重，键下只留一行
                }
              }
            }
          } else if (mutation.kind === 'delete' && mutation.rowId) {
            const current = await db.ferments.get(mutation.rowId);
            if (current) {
              affectedBatches.add(current.batchNo);
              const stale = mutation.baseUpdatedAt !== null && current.updatedAt !== mutation.baseUpdatedAt;
              if (stale) {
                // 另一标签页已改过该行：保留它的值与本次删除意图双方
                conflictId = await this.recordConflict(current, { source: mutation.source, at: now, value: null });
              } else {
                await db.ferments.delete(mutation.rowId);
              }
            }
          }

          // 任一读数改动后：同事务重算受影响批次的罐装酒精度，配方实绩随状态流重载立即失效
          for (const batchNo of affectedBatches) {
            await this.recomputeBatchAbv(batchNo);
          }
        });
      });
      return { ok: true, conflictId };
    } catch (error) {
      // 事务已整体回滚；把操作意图留成草稿，稍后（甚至重开页面后）可继续合并
      const draftId = await this.saveDraft(mutation, error);
      return { ok: false, draftId, error: errorMessage(error) };
    }
  }

  /** 处理冲突：采用其中一侧的值，标记已解决，并重算该批次罐装酒精度 */
  async resolveConflict(id: string, choice: 'kept' | 'incoming'): Promise<MergeOutcome> {
    try {
      await this.withLock(async () => {
        await db.transaction('rw', [db.ferments, db.packagings, db.fermentConflicts], async () => {
          const conflict = await db.fermentConflicts.get(id);
          if (!conflict || conflict.state !== '待处理') return;
          const chosen = choice === 'incoming' ? conflict.incoming : conflict.kept;
          const canonical = await this.findByKey(conflict.batchNo, conflict.date);
          const now = Date.now();
          if (chosen.value === null) {
            if (canonical) await db.ferments.delete(canonical.id);
          } else {
            const row: FermentRow = {
              ...chosen.value,
              source: chosen.source,
              id: canonical?.id ?? createId('ferment'),
              revision: ROW_REVISION,
              createdAt: canonical?.createdAt ?? now,
              updatedAt: now
            };
            await db.ferments.put(row);
          }
          await db.fermentConflicts.update(id, {
            state: '已解决' satisfies FermentConflictState,
            resolvedChoice: choice,
            updatedAt: now
          } as never);
          await this.recomputeBatchAbv(conflict.batchNo);
        });
      });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: errorMessage(error) };
    }
  }

  /** 继续合并草稿：重新执行原写入意图；成功（或已生成新草稿）后移除旧草稿 */
  async retryDraft(id: string): Promise<MergeOutcome> {
    const draft = await db.fermentDrafts.get(id);
    if (!draft) return { ok: false, error: '草稿不存在或已被处理' };
    const outcome = await this.applyMutation(draft);
    if (outcome.ok || outcome.draftId) {
      await db.fermentDrafts.delete(id);
    }
    return outcome;
  }

  /** 丢弃草稿 */
  async discardDraft(id: string): Promise<MergeOutcome> {
    try {
      await db.fermentDrafts.delete(id);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: errorMessage(error) };
    }
  }

  /* --------------------------- 内部实现 --------------------------- */

  /** 按「批次号 + 日期」找库中现行读数（excludeId 用于更新时排除自身） */
  private async findByKey(batchNo: string, date: string, excludeId?: string): Promise<FermentRow | undefined> {
    const rows = await db.ferments.where('batchNo').equals(batchNo).toArray();
    return rows.find((row) => row.date === date && row.id !== excludeId);
  }

  /** 两条读数的实绩值是否一致（来源与行元数据不参与比较） */
  private sameReading(row: FermentRow, value: Omit<Ferment, 'id'>): boolean {
    return (
      row.batchNo === value.batchNo &&
      row.recipeId === value.recipeId &&
      row.date === value.date &&
      Number(row.gravity) === Number(value.gravity) &&
      Number(row.tempC) === Number(value.tempC) &&
      Number(row.diacetylPpm) === Number(value.diacetylPpm) &&
      row.state === value.state
    );
  }

  /** 记录冲突：库中保留一侧与后到一侧的值和来源都完整落库 */
  private async recordConflict(
    keptRow: FermentRow | null,
    incoming: FermentConflictSide
  ): Promise<string> {
    const now = Date.now();
    const kept: FermentConflictSide = keptRow
      ? {
          source: keptRow.source ?? '早前数据',
          at: keptRow.updatedAt,
          value: {
            batchNo: keptRow.batchNo,
            recipeId: keptRow.recipeId,
            date: keptRow.date,
            gravity: keptRow.gravity,
            tempC: keptRow.tempC,
            diacetylPpm: keptRow.diacetylPpm,
            state: keptRow.state
          }
        }
      : { source: '另一标签页', at: now, value: null };
    const anchor = kept.value ?? incoming.value;
    const id = createId('conflict');
    const row: FermentConflictRow = {
      id,
      batchNo: anchor?.batchNo ?? '',
      recipeId: anchor?.recipeId ?? '',
      date: anchor?.date ?? '',
      kept,
      incoming,
      state: '待处理',
      revision: ROW_REVISION,
      createdAt: now,
      updatedAt: now
    };
    await db.fermentConflicts.put(row);
    return id;
  }

  /** 由该批次现行读数重算罐装酒精度：OG 取首日读数，FG 取末日读数 */
  private async recomputeBatchAbv(batchNo: string): Promise<void> {
    const rows = (await db.ferments.where('batchNo').equals(batchNo).toArray()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    if (rows.length === 0) return;
    const abv = abvFromGravity(rows[0].gravity, rows[rows.length - 1].gravity);
    const packs = await db.packagings.where('batchNo').equals(batchNo).toArray();
    const now = Date.now();
    for (const pack of packs) {
      if (Number(pack.abv) !== abv) {
        await db.packagings.update(pack.id, { abv, updatedAt: now } as never);
      }
    }
  }

  /** 写入失败草稿：整组回滚后把操作意图独立落库（不参与已回滚的事务） */
  private async saveDraft(mutation: FermentMutation, error: unknown): Promise<string | undefined> {
    try {
      const now = Date.now();
      const id = createId('draft');
      const row: FermentDraftRow = {
        ...mutation,
        id,
        batchNo: mutation.payload?.batchNo ?? '',
        recipeId: mutation.payload?.recipeId ?? '',
        date: mutation.payload?.date ?? '',
        error: errorMessage(error),
        state: '待合并',
        revision: ROW_REVISION,
        createdAt: now,
        updatedAt: now
      };
      await db.fermentDrafts.put(row);
      return id;
    } catch {
      return undefined;
    }
  }

  /** 跨标签页串行化合并：有 Web Locks 就用锁，没有则尽力而为 */
  private withLock<T>(task: () => Promise<T>): Promise<T> {
    const locks = (navigator as Navigator & { locks?: { request: (n: string, cb: () => Promise<T>) => Promise<T> } })
      .locks;
    if (!locks) return task();
    return locks.request(MERGE_LOCK, task);
  }

  private stamp(value: Omit<Ferment, 'id'>, now: number): FermentRow {
    return { ...value, id: createId('ferment'), revision: ROW_REVISION, createdAt: now, updatedAt: now };
  }
}

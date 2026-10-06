/**
 * SyncMergeService：跨标签页守住同一份实绩的核心。
 *
 * 规则：
 * - 发酵读数的自然键是「批次号 + 日期」；未冲突的读数直接合并进同一行。
 * - 两个标签页同时修改同一批次某天的读数且值不同时，双方的值与来源都保留在 row.variants。
 * - 每次提交是一个 Dexie 事务：任一读数写入失败整组回滚，同时把整组改动落到 mergeDrafts 草稿表，
 *   草稿自带时间戳独立持久化，关掉页面再打开仍可重新合并。
 * - 读数一旦改动（提交前即标记），相关配方的实绩快照立即置为 stale 并在同一事务内重算，
 *   同批次罐装批次的 ABV 也在同一事务内按新读数回写。
 */
import { Injectable } from '@angular/core';
import type { Ferment } from '../models/ferment.model';
import type { FermentChange, FermentVariant, MergeDraft, PackagingUpsert, RecipeActuals, SyncSource } from '../models/sync.model';
import {
  db,
  deleteMergeDraft,
  getMergeDraft,
  putMergeDraft,
  ROW_REVISION,
  type ActualsRow,
  type FermentRow,
  type MergeDraftRow,
  type PackagingRow
} from '../utils/db';
import { abvForBatch, recipeActuals } from '../utils/actuals';
import { createId } from '../utils/uuid';

const SOURCE_STORAGE_KEY = 'gbbrewhouse-tab-source';
const SOURCE_SEQ_KEY = 'gbbrewhouse-tab-seq';
const CHANNEL_NAME = 'gbbrewhouse-sync';
const LEGACY_SOURCE: SyncSource = { sourceId: 'legacy', sourceLabel: '历史记录' };

export interface SubmitSuccess {
  ok: true;
  upserted: number;
  deleted: number;
  conflicts: number;
  affectedRecipeIds: string[];
  affectedBatchNos: string[];
}

export interface SubmitFailure {
  ok: false;
  draftId: string;
  error: string;
}

export type SubmitResult = SubmitSuccess | SubmitFailure;

type MergeableFields = Pick<Ferment, 'gravity' | 'tempC' | 'diacetylPpm' | 'state'>;

function fieldsOf(row: FermentRow): MergeableFields {
  return { gravity: row.gravity, tempC: row.tempC, diacetylPpm: row.diacetylPpm, state: row.state };
}

function fieldsEqual(a: MergeableFields, b: MergeableFields): boolean {
  return a.gravity === b.gravity && a.tempC === b.tempC && a.diacetylPpm === b.diacetylPpm && a.state === b.state;
}

function variantFromRow(row: FermentRow): FermentVariant {
  return {
    sourceId: row.sourceId ?? LEGACY_SOURCE.sourceId,
    sourceLabel: row.sourceLabel ?? LEGACY_SOURCE.sourceLabel,
    gravity: row.gravity,
    tempC: row.tempC,
    diacetylPpm: row.diacetylPpm,
    state: row.state,
    savedAt: row.updatedAt ?? 0
  };
}

type SyncMessage =
  | { type: 'ferment-committed' }
  | { type: 'packaging-committed' }
  | { type: 'draft-saved' }
  | { type: 'draft-resolved' };

@Injectable({ providedIn: 'root' })
export class SyncMergeService {
  private source: SyncSource | null = null;
  private channel: BroadcastChannel | null = null;

  /** 当前标签页的来源身份（sessionStorage：刷新保留、关闭后不污染新标签页） */
  getSource(): SyncSource {
    if (this.source) return this.source;
    const existing = sessionStorage.getItem(SOURCE_STORAGE_KEY);
    if (existing) {
      this.source = JSON.parse(existing) as SyncSource;
      return this.source;
    }
    let seq = 1;
    try {
      seq = Number(localStorage.getItem(SOURCE_SEQ_KEY) ?? '1') || 1;
      localStorage.setItem(SOURCE_SEQ_KEY, String(seq + 1));
    } catch {
      seq = Math.floor(Math.random() * 26) + 1;
    }
    const label = `标签页 ${String.fromCharCode(64 + Math.min(seq, 26))}${seq > 26 ? seq : ''}`;
    this.source = { sourceId: createId('tab'), sourceLabel: label };
    try {
      sessionStorage.setItem(SOURCE_STORAGE_KEY, JSON.stringify(this.source));
    } catch {
      // 隐私模式下 sessionStorage 不可用时退化为内存身份
    }
    return this.source;
  }

  /** 监听其它标签页的提交事件（liveQuery 之外的显式刷新通道，不支持时静默退化为手动刷新） */
  onRemoteCommit(handler: () => void): () => void {
    if (typeof BroadcastChannel === 'undefined') return () => undefined;
    if (!this.channel) this.channel = new BroadcastChannel(CHANNEL_NAME);
    const listener = (event: MessageEvent<SyncMessage>) => {
      if (event.data.type === 'ferment-committed' || event.data.type === 'packaging-committed') handler();
    };
    this.channel.addEventListener('message', listener);
    return () => this.channel?.removeEventListener('message', listener);
  }

  private post(message: SyncMessage): void {
    try {
      this.channel?.postMessage(message);
    } catch {
      // 跨标签页通知失败不影响落库
    }
  }

  /* ---------------------------- 发酵读数提交 ---------------------------- */

  /**
   * 整组提交读数改动：全部成功才生效；任一失败整组回滚并留下可续合并草稿。
   * @param draftId 重试既有草稿时传入，成功后删除该草稿
   */
  async submitFermentChanges(changes: FermentChange[], draftId?: string): Promise<SubmitResult> {
    const source = this.getSource();
    const affected = this.collectAffected(changes);
    // 读数即将改动：配方实绩先置为失效（独立事务，主事务回滚后 stale 仍如实反映「有待重算的提交」）
    await this.markActualsStale(affected.recipeIds).catch(() => undefined);

    try {
      const result = await db.transaction('rw', [db.ferments, db.packagings, db.actuals], async () => {
        const allRows = await db.ferments.toArray();
        const byId = new Map(allRows.map((row) => [row.id, row]));
        const byKey = new Map<string, FermentRow>();
        for (const row of allRows) byKey.set(`${row.batchNo} ${row.date}`, row);

        let upserted = 0;
        let deleted = 0;
        let conflicts = 0;

        for (const change of changes) {
          if (change.op === 'delete' && change.id) {
            await db.ferments.delete(change.id);
            byId.delete(change.id);
            deleted += 1;
            continue;
          }
          const outcome = await this.mergeUpsert(change, source, byId, byKey);
          if (outcome === 'created' || outcome === 'updated') upserted += 1;
          if (outcome === 'conflict') {
            upserted += 1;
            conflicts += 1;
          }
        }

        await this.recomputeActualsAndAbv(affected.recipeIds, affected.batchNos);
        return { upserted, deleted, conflicts } satisfies Pick<
          SubmitSuccess,
          'upserted' | 'deleted' | 'conflicts'
        >;
      });

      if (draftId) await deleteMergeDraft(draftId).catch(() => undefined);
      this.post({ type: 'ferment-committed' });
      return { ok: true, ...result, affectedRecipeIds: affected.recipeIds, affectedBatchNos: affected.batchNos };
    } catch (error) {
      // 主事务已整体回滚：读数仍是旧值，按当前数据把实绩从「失效」恢复，避免重开页面后一直显示重算中
      await db.transaction('rw', [db.ferments, db.packagings, db.actuals], async () => {
        await this.recomputeActualsAndAbv(affected.recipeIds, affected.batchNos);
      }).catch(() => undefined);
      // 把整组改动另存为可续处理草稿（独立事务，不随主事务回滚）
      const saved = await this.saveDraft(
        {
          kind: 'ferment',
          source,
          changes,
          summary: this.fermentSummary(changes),
          lastError: error instanceof Error ? error.message : '写入失败'
        },
        draftId
      );
      this.post({ type: 'draft-saved' });
      return { ok: false, draftId: saved.id, error: saved.lastError };
    }
  }

  /** 三方合并单条 upsert，返回合并结果 */
  private async mergeUpsert(
    change: FermentChange,
    source: SyncSource,
    byId: Map<string, FermentRow>,
    byKey: Map<string, FermentRow>
  ): Promise<'created' | 'updated' | 'conflict' | 'unchanged'> {
    const payload = change.payload;
    if (!payload) return 'unchanged';
    const now = Date.now();
    const key = `${payload.batchNo} ${payload.date}`;
    const byIdRow = change.id ? byId.get(change.id) : undefined;
    const existing = byIdRow ?? byKey.get(key);

    // 编辑时改了批次号/日期：原自然键的行保留对方的实绩，本次值落到新自然键（双方值都不丢）
    if (!existing || (byIdRow && `${byIdRow.batchNo} ${byIdRow.date}` !== key)) {
      const row: FermentRow = {
        ...payload,
        id: change.id && !byIdRow ? change.id : createId('ferment'),
        revision: ROW_REVISION,
        createdAt: now,
        updatedAt: now,
        sourceId: source.sourceId,
        sourceLabel: source.sourceLabel,
        baseRevision: change.base?.revision
      };
      await this.putRow(row, byId, byKey);
      return 'created';
    }

    const mine: MergeableFields = {
      gravity: payload.gravity,
      tempC: payload.tempC,
      diacetylPpm: payload.diacetylPpm,
      state: payload.state
    };
    const otherVariant = (existing.variants ?? [])
      .filter((variant) => variant.sourceId !== source.sourceId)
      .sort((a, b) => b.savedAt - a.savedAt)[0];
    const theirs: MergeableFields = otherVariant
      ? { gravity: otherVariant.gravity, tempC: otherVariant.tempC, diacetylPpm: otherVariant.diacetylPpm, state: otherVariant.state }
      : fieldsOf(existing);
    const base = change.base?.snapshot;

    // 双方最终改成同一个值：自动收敛（仅移除与我同值的来源；若还有第三方不同值则继续保留为冲突）
    if (fieldsEqual(mine, theirs)) {
      const otherVariants = (existing.variants ?? []).filter(
        (variant) =>
          variant.sourceId !== source.sourceId &&
          !fieldsEqual(mine, {
            gravity: variant.gravity,
            tempC: variant.tempC,
            diacetylPpm: variant.diacetylPpm,
            state: variant.state
          })
      );
      const converged: FermentRow = {
        ...existing,
        ...payload,
        variants: otherVariants.length > 0 ? otherVariants : undefined,
        sourceId: source.sourceId,
        sourceLabel: source.sourceLabel,
        baseRevision: change.base?.revision ?? existing.baseRevision,
        updatedAt: now
      };
      await this.putRow(converged, byId, byKey);
      return otherVariants.length > 0 ? 'conflict' : 'updated';
    }

    // 三方合并：对方未动基线 → 直接快进；我方相对基线无变化 → 不覆盖
    if (base) {
      const theyChanged =
        existing.revision !== (change.base?.revision ?? existing.revision) ||
        Boolean(otherVariant) ||
        !fieldsEqual(theirs, base);
      const iChanged = !fieldsEqual(mine, base);
      if (!iChanged) return 'unchanged';
      if (!theyChanged) {
        const fastForward: FermentRow = {
          ...existing,
          ...payload,
          variants: undefined,
          sourceId: source.sourceId,
          sourceLabel: source.sourceLabel,
          baseRevision: change.base?.revision,
          revision: existing.revision + 1,
          updatedAt: now
        };
        await this.putRow(fastForward, byId, byKey);
        return 'updated';
      }
    }

    // 真正的冲突（或无基线的同键并发补录）：双方值与来源都保留
    const variants: FermentVariant[] = existing.variants && existing.variants.length > 0
      ? existing.variants.filter((variant) => variant.sourceId !== source.sourceId)
      : [variantFromRow(existing)];
    variants.push({
      sourceId: source.sourceId,
      sourceLabel: source.sourceLabel,
      gravity: mine.gravity,
      tempC: mine.tempC,
      diacetylPpm: mine.diacetylPpm,
      state: mine.state,
      savedAt: now
    });

    // 主值保留对方（非本来源）最近一次的值，绝不被整条盖掉
    const keepTheirs = variants
      .filter((variant) => variant.sourceId !== source.sourceId)
      .sort((a, b) => b.savedAt - a.savedAt)[0];
    const next: FermentRow = {
      ...existing,
      gravity: keepTheirs ? keepTheirs.gravity : existing.gravity,
      tempC: keepTheirs ? keepTheirs.tempC : existing.tempC,
      diacetylPpm: keepTheirs ? keepTheirs.diacetylPpm : existing.diacetylPpm,
      state: keepTheirs ? keepTheirs.state : existing.state,
      sourceId: keepTheirs ? keepTheirs.sourceId : existing.sourceId,
      sourceLabel: keepTheirs ? keepTheirs.sourceLabel : existing.sourceLabel,
      variants,
      revision: existing.revision + 1,
      baseRevision: change.base?.revision ?? existing.baseRevision,
      updatedAt: now
    };
    await this.putRow(next, byId, byKey);
    return 'conflict';
  }

  private async putRow(row: FermentRow, byId: Map<string, FermentRow>, byKey: Map<string, FermentRow>): Promise<void> {
    await db.ferments.put(row);
    byId.set(row.id, row);
    byKey.set(`${row.batchNo} ${row.date}`, row);
  }

  /** 同事务内重算受影响配方的实绩快照，并按新读数回写同批次罐装批次 ABV */
  private async recomputeActualsAndAbv(recipeIds: string[], batchNos: string[]): Promise<void> {
    const allRows = await db.ferments.toArray();
    const now = Date.now();

    for (const recipeId of recipeIds) {
      if (!recipeId) continue;
      const computed = recipeActuals(allRows, recipeId);
      const previous = await db.actuals.get(recipeId);
      const row: ActualsRow = {
        recipeId,
        og: computed.og,
        fg: computed.fg,
        abv: computed.abv,
        attenuation: computed.attenuation,
        fermentCount: computed.fermentCount,
        stale: false,
        updatedAt: now,
        revision: previous ? previous.revision + 1 : ROW_REVISION,
        createdAt: previous?.createdAt ?? now
      };
      await db.actuals.put(row);
    }

    if (batchNos.length > 0) {
      const batches = await db.packagings.where('batchNo').anyOf(batchNos).toArray();
      for (const packaging of batches) {
        const abv = abvForBatch(allRows, packaging.batchNo);
        if (abv > 0 && abv !== packaging.abv) {
          await db.packagings.update(packaging.id, { abv, updatedAt: now } as never);
        }
      }
    }
  }

  /** 读数改动前先把相关配方实绩置为失效（独立短事务，失败不阻塞提交） */
  private async markActualsStale(recipeIds: string[]): Promise<void> {
    if (recipeIds.length === 0) return;
    const now = Date.now();
    await db.transaction('rw', [db.actuals], async () => {
      for (const recipeId of recipeIds) {
        if (!recipeId) continue;
        const previous = await db.actuals.get(recipeId);
        const base: ActualsRow = previous ?? {
          recipeId,
          og: 0,
          fg: 0,
          abv: 0,
          attenuation: 0,
          fermentCount: 0,
          stale: false,
          updatedAt: now,
          revision: ROW_REVISION,
          createdAt: now
        };
        await db.actuals.put({ ...base, stale: true, updatedAt: now });
      }
    });
  }

  private collectAffected(changes: FermentChange[]): { recipeIds: string[]; batchNos: string[] } {
    const recipeIds = new Set<string>();
    const batchNos = new Set<string>();
    for (const change of changes) {
      if (change.payload) {
        recipeIds.add(change.payload.recipeId);
        batchNos.add(change.payload.batchNo);
      }
    }
    return { recipeIds: [...recipeIds], batchNos: [...batchNos] };
  }

  private fermentSummary(changes: FermentChange[]): string {
    const upserts = changes.filter((change) => change.op === 'upsert');
    const deletes = changes.length - upserts.length;
    const batches = new Set(upserts.map((change) => change.payload?.batchNo).filter(Boolean));
    const days = new Set(
      upserts.map((change) => `${change.payload?.batchNo ?? ''} ${change.payload?.date ?? ''}`)
    );
    return `发酵读数 ${days.size} 条（批次 ${[...batches].join('、') || '—'}${deletes > 0 ? `，删除 ${deletes} 条` : ''}）`;
  }

  /* ---------------------------- 罐装批次提交 ---------------------------- */

  /**
   * 罐装批次按「批次号 + 罐装日期」与既有记录归并，ABV 始终由该批次发酵读数当场重算。
   * 失败时同样留下可续合并草稿。
   */
  async submitPackaging(upsert: PackagingUpsert, draftId?: string): Promise<SubmitResult> {
    const source = this.getSource();
    try {
      const outcome = await db.transaction('rw', [db.packagings, db.ferments], async () => {
        const now = Date.now();
        const allFerments = await db.ferments.toArray();
        const recomputed = abvForBatch(allFerments, upsert.payload.batchNo);
        const abv = recomputed > 0 ? recomputed : upsert.payload.abv;

        const sameBatch = await db.packagings.where('batchNo').equals(upsert.payload.batchNo).toArray();
        const byId = upsert.id ? sameBatch.find((row) => row.id === upsert.id) ?? (await db.packagings.get(upsert.id)) : undefined;
        const sameDay = sameBatch.find((row) => row.packDate === upsert.payload.packDate);
        const existing = byId ?? sameDay;

        if (!existing) {
          const row: PackagingRow = {
            ...upsert.payload,
            abv,
            id: createId('packaging'),
            revision: ROW_REVISION,
            createdAt: now,
            updatedAt: now
          };
          await db.packagings.put(row);
          return { upserted: 1, deleted: 0, conflicts: 0 } as const;
        }

        // 同批次同日：直接合并；按 id 命中但日期改到了另一天：保留原行、另建一条
        if (byId && sameDay === undefined && byId.packDate !== upsert.payload.packDate && sameBatch.length > 0) {
          const row: PackagingRow = {
            ...upsert.payload,
            abv,
            id: createId('packaging'),
            revision: ROW_REVISION,
            createdAt: now,
            updatedAt: now
          };
          await db.packagings.put(row);
          return { upserted: 1, deleted: 0, conflicts: 0 } as const;
        }

        await db.packagings.update(existing.id, {
          ...upsert.payload,
          abv,
          revision: existing.revision + 1,
          updatedAt: now
        } as never);
        return { upserted: 1, deleted: 0, conflicts: 0 } as const;
      });

      if (draftId) await deleteMergeDraft(draftId).catch(() => undefined);
      this.post({ type: 'packaging-committed' });
      return {
        ok: true,
        ...outcome,
        affectedRecipeIds: [upsert.payload.recipeId],
        affectedBatchNos: [upsert.payload.batchNo]
      };
    } catch (error) {
      const saved = await this.saveDraft(
        {
          kind: 'packaging',
          source,
          packaging: upsert,
          summary: `罐装批次 ${upsert.payload.batchNo}（${upsert.payload.packDate} · ${upsert.payload.container} ×${upsert.payload.quantity}）`,
          lastError: error instanceof Error ? error.message : '写入失败'
        },
        draftId
      );
      this.post({ type: 'draft-saved' });
      return { ok: false, draftId: saved.id, error: saved.lastError };
    }
  }

  /* ---------------------------- 草稿与冲突处理 ---------------------------- */

  listDrafts(): Promise<MergeDraftRow[]> {
    return db.mergeDrafts
      .toArray()
      .then((rows) => rows.sort((a, b) => b.updatedAt - a.updatedAt));
  }

  /** 关掉页面再打开后接着合并：按草稿类型重新提交整组改动 */
  async retryDraft(draftId: string): Promise<SubmitResult> {
    const draft = await getMergeDraft(draftId);
    if (!draft) return { ok: false, draftId, error: '草稿不存在或已被处理' };
    if (draft.kind === 'ferment') {
      return this.submitFermentChanges(draft.changes ?? [], draftId);
    }
    if (draft.packaging) {
      return this.submitPackaging(draft.packaging, draftId);
    }
    await deleteMergeDraft(draftId);
    return { ok: false, draftId, error: '草稿内容缺失，已丢弃' };
  }

  async discardDraft(draftId: string): Promise<void> {
    await deleteMergeDraft(draftId);
    this.post({ type: 'draft-resolved' });
  }

  /** 删除冲突行中某一个来源的值；剩一个值时自动收敛为唯一主值，再重算下游 */
  async removeVariant(rowId: string, sourceId: string): Promise<SubmitResult> {
    try {
      const affected = await db.transaction('rw', [db.ferments, db.packagings, db.actuals], async () => {
        const row = await db.ferments.get(rowId);
        if (!row) return { recipeIds: [] as string[], batchNos: [] as string[] };
        const remaining = (row.variants ?? []).filter((variant) => variant.sourceId !== sourceId);
        if (remaining.length === 1) {
          const only = remaining[0];
          await db.ferments.update(rowId, {
            gravity: only.gravity,
            tempC: only.tempC,
            diacetylPpm: only.diacetylPpm,
            state: only.state,
            sourceId: only.sourceId,
            sourceLabel: only.sourceLabel,
            variants: undefined,
            revision: row.revision + 1,
            updatedAt: Date.now()
          } as never);
        } else {
          await db.ferments.update(rowId, {
            variants: remaining,
            revision: row.revision + 1,
            updatedAt: Date.now()
          } as never);
        }
        await this.recomputeActualsAndAbv([row.recipeId], [row.batchNo]);
        return { recipeIds: [row.recipeId], batchNos: [row.batchNo] };
      });
      this.post({ type: 'ferment-committed' });
      return {
        ok: true,
        upserted: 1,
        deleted: 0,
        conflicts: 0,
        affectedRecipeIds: affected.recipeIds,
        affectedBatchNos: affected.batchNos
      };
    } catch (error) {
      return { ok: false, draftId: '', error: error instanceof Error ? error.message : '删除冲突值失败' };
    }
  }

  /** 裁决一条冲突读数：选定一个值作为唯一实绩，清空双方变体并重算下游 */
  async resolveConflict(rowId: string, chosen: MergeableFields): Promise<SubmitResult> {
    const source = this.getSource();
    try {
      const affected = await db.transaction('rw', [db.ferments, db.packagings, db.actuals], async () => {
        const row = await db.ferments.get(rowId);
        if (!row) return { recipeIds: [] as string[], batchNos: [] as string[] };
        const recipeIds = [row.recipeId];
        const batchNos = [row.batchNo];
        await db.ferments.update(rowId, {
          ...chosen,
          variants: undefined,
          sourceId: source.sourceId,
          sourceLabel: `${source.sourceLabel} 裁决`,
          revision: row.revision + 1,
          updatedAt: Date.now()
        } as never);
        await this.recomputeActualsAndAbv(recipeIds, batchNos);
        return { recipeIds, batchNos };
      });
      this.post({ type: 'ferment-committed' });
      return {
        ok: true,
        upserted: 1,
        deleted: 0,
        conflicts: 0,
        affectedRecipeIds: affected.recipeIds,
        affectedBatchNos: affected.batchNos
      };
    } catch (error) {
      // 裁决本身是单条操作，失败时不重复写读数草稿，仅返回错误，由页面提示重试
      return { ok: false, draftId: '', error: error instanceof Error ? error.message : '冲突处理失败' };
    }
  }

  private async saveDraft(
    init: {
      kind: MergeDraft['kind'];
      source: SyncSource;
      changes?: FermentChange[];
      packaging?: PackagingUpsert;
      summary: string;
      lastError: string;
    },
    reuseDraftId?: string
  ): Promise<MergeDraftRow> {
    const now = Date.now();
    let previous: MergeDraftRow | undefined;
    if (reuseDraftId) previous = await getMergeDraft(reuseDraftId).catch(() => undefined);
    const draft: MergeDraftRow = {
      id: previous?.id ?? reuseDraftId ?? createId('draft'),
      kind: init.kind,
      source: init.source,
      changes: init.changes,
      packaging: init.packaging,
      summary: init.summary,
      lastError: init.lastError,
      attempts: (previous?.attempts ?? 0) + 1,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now
    };
    await putMergeDraft(draft);
    return draft;
  }
}

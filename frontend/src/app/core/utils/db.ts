/**
 * IndexedDB 持久化层（Dexie 封装）
 * - 数据库名 gbbrewhouse-db，数据结构版本号 version(1) 与 upgrade() 迁移逻辑
 * - 配方 / 麦芽 / 酒花 / 糖化步 / 煮沸投加 / 发酵读数 / 罐装批次 七张表分表存储
 * - 首次打开自动播种互相引用的演示数据，保证每个页面打开都有内容
 */
import Dexie, { type Table } from 'dexie';
import type { Recipe } from '../models/recipe.model';
import type { Malt } from '../models/malt.model';
import type { Hop } from '../models/hop.model';
import type { MashStep } from '../models/mash-step.model';
import type { BoilAdd } from '../models/boil-add.model';
import type { Ferment } from '../models/ferment.model';
import type { Packaging } from '../models/packaging.model';
import type { FermentVariant, MergeDraft, RecipeActuals } from '../models/sync.model';
import { nowIso } from './uuid';
import { seedDatabase } from './seed';

/** 数据库名 */
export const DB_NAME = 'gbbrewhouse-db';

/** 当前数据结构版本号（每次调整字段结构必须 +1 并补迁移） */
export const DB_SCHEMA_VERSION = 2;

/** 行结构修订号 */
export const ROW_REVISION = 2;

export interface Revisioned {
  revision: number;
  createdAt: number;
  updatedAt: number;
}

export type RecipeRow = Recipe & Revisioned;
export type MaltRow = Malt & Revisioned;
export type HopRow = Hop & Revisioned;
export type MashStepRow = MashStep & Revisioned;
export type BoilAddRow = BoilAdd & Revisioned;
/**
 * 发酵读数行：按「批次号 + 日期」守同一份实绩。
 * 两个标签页把同一天读数改成不同值时，双方的值与来源都保留在 variants 中，主值不再被覆盖。
 */
export type FermentRow = Ferment &
  Revisioned & {
    /** 最近一次写入该主值的来源 */
    sourceId?: string;
    sourceLabel?: string;
    /** 冲突时同时保留的双方值（非空时实绩计算以 variants 为准，主值仅作展示） */
    variants?: FermentVariant[];
    /** 该行进入编辑时的修订号（三方合并基线） */
    baseRevision?: number;
  };
export type PackagingRow = Packaging & Revisioned;
/** 配方实绩快照表行（recipeId 为主键，读数变动后立即失效并重算） */
export type ActualsRow = RecipeActuals & Revisioned;
/** 可续合并草稿（自带 createdAt / updatedAt，无需 Revisioned） */
export type MergeDraftRow = MergeDraft;

class GbBrewhouseDatabase extends Dexie {
  recipes!: Table<RecipeRow, string>;
  malts!: Table<MaltRow, string>;
  hops!: Table<HopRow, string>;
  mashSteps!: Table<MashStepRow, string>;
  boilAdds!: Table<BoilAddRow, string>;
  ferments!: Table<FermentRow, string>;
  packagings!: Table<PackagingRow, string>;
  /** 配方实绩快照：recipeId 为主键，读数改动后 stale=true，重算后清回 false */
  actuals!: Table<ActualsRow, string>;
  /** 保存失败后整组回滚留下的可续合并草稿 */
  mergeDrafts!: Table<MergeDraftRow, string>;

  constructor() {
    super(DB_NAME);

    this.version(1)
      .stores({
        recipes: 'id, name, style, targetOg, updatedAt',
        malts: 'id, recipeId, name, ebc, type, updatedAt',
        hops: 'id, recipeId, name, alphaPct, form, updatedAt',
        mashSteps: 'id, recipeId, seq, state, updatedAt',
        boilAdds: 'id, recipeId, atMin, purpose, updatedAt',
        ferments: 'id, recipeId, batchNo, date, state, updatedAt',
        packagings: 'id, recipeId, batchNo, packDate, container, updatedAt'
      })
      .upgrade(async (tx) => {
        // v1 结构迁移：为历史行补齐行修订号与时间戳；新建库时各表为空，迁移天然幂等
        const tableNames = ['recipes', 'malts', 'hops', 'mashSteps', 'boilAdds', 'ferments', 'packagings'];
        for (const name of tableNames) {
          await tx
            .table(name)
            .toCollection()
            .modify((row: Record<string, unknown>) => {
              row.revision = 1;
              if (typeof row.createdAt !== 'number') row.createdAt = Date.now();
              if (typeof row.updatedAt !== 'number') row.updatedAt = row.createdAt;
            });
        }
      });

    // v2：新增配方实绩快照表与可续合并草稿表；发酵行在读写层惰性补齐来源字段，无需改表结构
    this.version(2).stores({
      actuals: 'recipeId, stale, updatedAt',
      mergeDrafts: 'id, kind, sourceId, updatedAt'
    });
  }
}

export const db = new GbBrewhouseDatabase();

/** 初始化 Promise 缓存：并发调用共享同一次「打开 + 按需播种」，避免重复灌入演示数据 */
let initPromise: Promise<void> | null = null;

/** 打开数据库：首次使用时灌入演示数据（幂等：表非空不播；并发调用复用同一 Promise） */
export function initDatabase(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      await db.open();
      if ((await db.recipes.count()) === 0) {
        await seedDatabase();
      }
    })().catch((error: unknown) => {
      initPromise = null;
      throw error;
    });
  }
  return initPromise;
}

/* ------------------------------ 配方 ------------------------------ */

export async function listRecipes(): Promise<RecipeRow[]> {
  const rows = await db.recipes.toArray();
  return rows.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
}

/** 删除配方：级联删除麦芽、酒花、糖化步、煮沸投加、发酵读数、罐装批次与实绩快照 */
export async function removeRecipe(id: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.recipes, db.malts, db.hops, db.mashSteps, db.boilAdds, db.ferments, db.packagings, db.actuals, db.mergeDrafts],
    async () => {
      await db.malts.where('recipeId').equals(id).delete();
      await db.hops.where('recipeId').equals(id).delete();
      await db.mashSteps.where('recipeId').equals(id).delete();
      await db.boilAdds.where('recipeId').equals(id).delete();
      await db.ferments.where('recipeId').equals(id).delete();
      await db.packagings.where('recipeId').equals(id).delete();
      await db.actuals.where('recipeId').equals(id).delete();
      // 该配方相关的发酵合并草稿一并清掉，避免指向已删除配方
      const draftIds = (await db.mergeDrafts.toArray())
        .filter((draft) => draft.changes?.some((change) => change.payload?.recipeId === id))
        .map((draft) => draft.id);
      if (draftIds.length > 0) await db.mergeDrafts.bulkDelete(draftIds);
      await db.recipes.delete(id);
    }
  );
}

/* ---------------------------- 配方实绩快照 ---------------------------- */

export function listActuals(): Promise<ActualsRow[]> {
  return db.actuals.toArray();
}

export function getActuals(recipeId: string): Promise<ActualsRow | undefined> {
  return db.actuals.get(recipeId);
}

export async function putActuals(row: ActualsRow): Promise<void> {
  await db.actuals.put(row);
}

/* ----------------------------- 合并草稿 ----------------------------- */

export function listMergeDrafts(): Promise<MergeDraftRow[]> {
  return db.mergeDrafts.toArray().then((rows) => rows.sort((a, b) => b.updatedAt - a.updatedAt));
}

export function getMergeDraft(id: string): Promise<MergeDraftRow | undefined> {
  return db.mergeDrafts.get(id);
}

export async function putMergeDraft(draft: MergeDraftRow): Promise<void> {
  await db.mergeDrafts.put(draft);
}

export function deleteMergeDraft(id: string): Promise<void> {
  return db.mergeDrafts.delete(id);
}

/* --------------------------- 整库导入导出 --------------------------- */

export interface DatabaseSnapshot {
  name: string;
  schemaVersion: number;
  exportedAt: string;
  recipes: Recipe[];
  malts: Malt[];
  hops: Hop[];
  mashSteps: MashStep[];
  boilAdds: BoilAdd[];
  ferments: Ferment[];
  packagings: Packaging[];
}

function stripRow<T extends Revisioned>(row: T): Omit<T, keyof Revisioned> {
  const copy = { ...row } as Record<string, unknown>;
  delete copy.revision;
  delete copy.createdAt;
  delete copy.updatedAt;
  return copy as Omit<T, keyof Revisioned>;
}

export async function exportSnapshot(): Promise<DatabaseSnapshot> {
  const [recipes, malts, hops, mashSteps, boilAdds, ferments, packagings] = await Promise.all([
    db.recipes.toArray(),
    db.malts.toArray(),
    db.hops.toArray(),
    db.mashSteps.toArray(),
    db.boilAdds.toArray(),
    db.ferments.toArray(),
    db.packagings.toArray()
  ]);
  return {
    name: DB_NAME,
    schemaVersion: DB_SCHEMA_VERSION,
    exportedAt: nowIso(),
    recipes: recipes.map(stripRow),
    malts: malts.map(stripRow),
    hops: hops.map(stripRow),
    mashSteps: mashSteps.map(stripRow),
    boilAdds: boilAdds.map(stripRow),
    ferments: ferments.map(stripRow),
    packagings: packagings.map(stripRow)
  };
}

function stamp<T>(row: T): T & Revisioned {
  const now = Date.now();
  return { ...row, revision: ROW_REVISION, createdAt: now, updatedAt: now };
}

export async function importSnapshot(snapshot: DatabaseSnapshot): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.recipes,
      db.malts,
      db.hops,
      db.mashSteps,
      db.boilAdds,
      db.ferments,
      db.packagings,
      db.actuals,
      db.mergeDrafts
    ],
    async () => {
      await Promise.all([
        db.recipes.clear(),
        db.malts.clear(),
        db.hops.clear(),
        db.mashSteps.clear(),
        db.boilAdds.clear(),
        db.ferments.clear(),
        db.packagings.clear(),
        // 实绩快照与合并草稿不随备份导入：实绩由当前读数重算，草稿需由酿酒师重新提交
        db.actuals.clear(),
        db.mergeDrafts.clear()
      ]);
      await db.recipes.bulkPut(snapshot.recipes.map(stamp));
      await db.malts.bulkPut(snapshot.malts.map(stamp));
      await db.hops.bulkPut(snapshot.hops.map(stamp));
      await db.mashSteps.bulkPut(snapshot.mashSteps.map(stamp));
      await db.boilAdds.bulkPut(snapshot.boilAdds.map(stamp));
      await db.ferments.bulkPut(snapshot.ferments.map(stamp));
      await db.packagings.bulkPut(snapshot.packagings.map(stamp));
    }
  );
}

/** 清空全部数据并重新灌入演示数据 */
export async function resetDatabase(): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.recipes,
      db.malts,
      db.hops,
      db.mashSteps,
      db.boilAdds,
      db.ferments,
      db.packagings,
      db.actuals,
      db.mergeDrafts
    ],
    async () => {
      await Promise.all([
        db.recipes.clear(),
        db.malts.clear(),
        db.hops.clear(),
        db.mashSteps.clear(),
        db.boilAdds.clear(),
        db.ferments.clear(),
        db.packagings.clear(),
        db.actuals.clear(),
        db.mergeDrafts.clear()
      ]);
    }
  );
  await seedDatabase();
}

/** 各表行数统计 */
export async function countAll(): Promise<Record<string, number>> {
  const [recipes, malts, hops, mashSteps, boilAdds, ferments, packagings, actuals, mergeDrafts] = await Promise.all([
    db.recipes.count(),
    db.malts.count(),
    db.hops.count(),
    db.mashSteps.count(),
    db.boilAdds.count(),
    db.ferments.count(),
    db.packagings.count(),
    db.actuals.count(),
    db.mergeDrafts.count()
  ]);
  return { recipes, malts, hops, mashSteps, boilAdds, ferments, packagings, actuals, mergeDrafts };
}

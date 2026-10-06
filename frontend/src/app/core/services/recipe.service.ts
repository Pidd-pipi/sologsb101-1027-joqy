/**
 * RecipeService：配方及其从属数据（麦芽 / 酒花 / 糖化步 / 煮沸投加 / 发酵 / 罐装）的读写收口。
 * 全部读写走 IdbTableService → Dexie → IndexedDB。
 */
import { Injectable, inject } from '@angular/core';
import type { Recipe } from '../models/recipe.model';
import type { Malt } from '../models/malt.model';
import type { Hop } from '../models/hop.model';
import type { MashStep } from '../models/mash-step.model';
import type { BoilAdd } from '../models/boil-add.model';
import type { Ferment } from '../models/ferment.model';
import type { Packaging } from '../models/packaging.model';
import {
  db,
  removeRecipe,
  ROW_REVISION,
  type BoilAddRow,
  type FermentRow,
  type HopRow,
  type MaltRow,
  type MashStepRow,
  type PackagingRow,
  type RecipeRow
} from '../utils/db';
import { createId } from '../utils/uuid';
import { IdbTableService } from './idb-table.service';

@Injectable({ providedIn: 'root' })
export class RecipeService {
  private readonly idb = inject(IdbTableService);

  /* ------------------------------ 配方 ------------------------------ */

  listRecipes(): Promise<RecipeRow[]> {
    return db.recipes.toArray().then((rows) => rows.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN')));
  }

  async createRecipe(payload: Omit<Recipe, 'id'>): Promise<string> {
    const row = this.idb.buildRow(payload, 'recipe') as RecipeRow;
    await db.recipes.put(row);
    return row.id;
  }

  updateRecipe(id: string, patch: Partial<Recipe>): Promise<void> {
    return this.idb.update(db.recipes, id, patch);
  }

  deleteRecipe(id: string): Promise<void> {
    return removeRecipe(id);
  }

  /* ------------------------------ 麦芽 ------------------------------ */

  listMalts(): Promise<MaltRow[]> {
    return db.malts.toArray();
  }

  async createMalt(payload: Omit<Malt, 'id'>): Promise<string> {
    const row = { ...payload, id: createId('malt'), revision: ROW_REVISION, createdAt: Date.now(), updatedAt: Date.now() };
    await db.malts.put(row);
    return row.id;
  }

  updateMalt(id: string, patch: Partial<Malt>): Promise<void> {
    return this.idb.update(db.malts, id, patch);
  }

  deleteMalt(id: string): Promise<void> {
    return this.idb.remove(db.malts, id);
  }

  /* ------------------------------ 酒花 ------------------------------ */

  listHops(): Promise<HopRow[]> {
    return db.hops.toArray();
  }

  async createHop(payload: Omit<Hop, 'id'>): Promise<string> {
    const row = { ...payload, id: createId('hop'), revision: ROW_REVISION, createdAt: Date.now(), updatedAt: Date.now() };
    await db.hops.put(row);
    return row.id;
  }

  updateHop(id: string, patch: Partial<Hop>): Promise<void> {
    return this.idb.update(db.hops, id, patch);
  }

  deleteHop(id: string): Promise<void> {
    return this.idb.remove(db.hops, id);
  }

  /* ----------------------------- 糖化步 ----------------------------- */

  listMashSteps(): Promise<MashStepRow[]> {
    return db.mashSteps.toArray().then((rows) => rows.sort((a, b) => a.seq - b.seq));
  }

  async createMashStep(payload: Omit<MashStep, 'id' | 'seq'>): Promise<string> {
    const existing = await db.mashSteps.where('recipeId').equals(payload.recipeId).toArray();
    const seq = existing.reduce((max, row) => Math.max(max, row.seq), 0) + 1;
    const row = {
      ...payload,
      seq,
      id: createId('mash'),
      revision: ROW_REVISION,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    await db.mashSteps.put(row);
    return row.id;
  }

  updateMashStep(id: string, patch: Partial<MashStep>): Promise<void> {
    return this.idb.update(db.mashSteps, id, patch);
  }

  deleteMashStep(id: string): Promise<void> {
    return this.idb.remove(db.mashSteps, id);
  }

  /** 拖拽调序后按新顺序批量写回 seq */
  async reorderMashSteps(orderedIds: string[]): Promise<void> {
    await db.transaction('rw', [db.mashSteps], async () => {
      for (let index = 0; index < orderedIds.length; index += 1) {
        await db.mashSteps.update(orderedIds[index], { seq: index + 1, updatedAt: Date.now() } as never);
      }
    });
  }

  /* ---------------------------- 煮沸投加 ---------------------------- */

  listBoilAdds(): Promise<BoilAddRow[]> {
    return db.boilAdds.toArray();
  }

  async createBoilAdd(payload: Omit<BoilAdd, 'id'>): Promise<string> {
    const row = { ...payload, id: createId('boil'), revision: ROW_REVISION, createdAt: Date.now(), updatedAt: Date.now() };
    await db.boilAdds.put(row);
    return row.id;
  }

  updateBoilAdd(id: string, patch: Partial<BoilAdd>): Promise<void> {
    return this.idb.update(db.boilAdds, id, patch);
  }

  deleteBoilAdd(id: string): Promise<void> {
    return this.idb.remove(db.boilAdds, id);
  }

  /* ---------------------------- 发酵读数 ---------------------------- */

  listFerments(): Promise<FermentRow[]> {
    return db.ferments.toArray().then((rows) => rows.sort((a, b) => a.date.localeCompare(b.date)));
  }

  async createFerment(payload: Omit<Ferment, 'id'>): Promise<string> {
    const row = {
      ...payload,
      id: createId('ferment'),
      revision: ROW_REVISION,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    await db.ferments.put(row);
    return row.id;
  }

  updateFerment(id: string, patch: Partial<Ferment>): Promise<void> {
    return this.idb.update(db.ferments, id, patch);
  }

  deleteFerment(id: string): Promise<void> {
    return this.idb.remove(db.ferments, id);
  }

  /* ---------------------------- 罐装批次 ---------------------------- */

  listPackagings(): Promise<PackagingRow[]> {
    return db.packagings.toArray().then((rows) => rows.sort((a, b) => b.packDate.localeCompare(a.packDate)));
  }

  async createPackaging(payload: Omit<Packaging, 'id'>): Promise<string> {
    const row = {
      ...payload,
      id: createId('packaging'),
      revision: ROW_REVISION,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    await db.packagings.put(row);
    return row.id;
  }

  updatePackaging(id: string, patch: Partial<Packaging>): Promise<void> {
    return this.idb.update(db.packagings, id, patch);
  }

  deletePackaging(id: string): Promise<void> {
    return this.idb.remove(db.packagings, id);
  }
}

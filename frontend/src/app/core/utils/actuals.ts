/**
 * 配方实绩派生：以「批次号 + 日期」为自然键归并读数后计算 OG / FG / ABV。
 * 冲突读数（同一批次同一天存在双方变体）取各来源最近一次保存的值全部参与，
 * 保证任何一个标签页的补录或修正都不会被另一边整条盖掉。
 */
import type { FermentState } from '../models/ferment.model';
import type { FermentRow } from './db';
import { abvFromGravity, apparentAttenuation } from './brew';

/** 归并后的读数（冲突时一条自然键可能对应多条，来自不同来源） */
export interface EffectiveReading {
  batchNo: string;
  recipeId: string;
  date: string;
  gravity: number;
  tempC: number;
  diacetylPpm: number;
  state: FermentState;
  /** 该自然键上同时保留的不同来源值个数（1 表示无冲突） */
  variantCount: number;
  savedAt: number;
}

/** 一个批次的实绩 */
export interface BatchActuals {
  batchNo: string;
  og: number;
  fg: number;
  abv: number;
  attenuation: number;
  readingCount: number;
  /** 是否存在双方同时修改同一天读数的情况 */
  hasConflicts: boolean;
}

/** 参与实绩计算的字段（行主值或冲突变体都满足） */
interface ReadingLike {
  batchNo: string;
  recipeId: string;
  date: string;
  gravity: number;
  tempC: number;
  diacetylPpm: number;
  state: FermentState;
  sourceId: string;
  savedAt: number;
}

function naturalKey(batchNo: string, date: string): string {
  return `${batchNo} ${date}`;
}

/** 把发酵行展开成按自然键归并的有效读数（含冲突双方值） */
export function effectiveReadings(rows: FermentRow[]): EffectiveReading[] {
  const groups = new Map<string, ReadingLike[]>();
  for (const row of rows) {
    const readings: ReadingLike[] = [];
    if (row.variants && row.variants.length > 0) {
      for (const variant of row.variants) {
        readings.push({
          batchNo: row.batchNo,
          recipeId: row.recipeId,
          date: row.date,
          gravity: variant.gravity,
          tempC: variant.tempC,
          diacetylPpm: variant.diacetylPpm,
          state: variant.state,
          sourceId: variant.sourceId,
          savedAt: variant.savedAt
        });
      }
    } else {
      readings.push({
        batchNo: row.batchNo,
        recipeId: row.recipeId,
        date: row.date,
        gravity: row.gravity,
        tempC: row.tempC,
        diacetylPpm: row.diacetylPpm,
        state: row.state,
        sourceId: `base:${row.id}`,
        savedAt: row.updatedAt ?? 0
      });
    }
    const key = naturalKey(row.batchNo, row.date);
    const list = groups.get(key);
    if (list) list.push(...readings);
    else groups.set(key, readings);
  }

  const result: EffectiveReading[] = [];
  for (const list of groups.values()) {
    // 同一自然键、同一来源多次保存只取最新一次；不同来源的值全部保留
    const latestBySource = new Map<string, ReadingLike>();
    for (const reading of list) {
      const prev = latestBySource.get(reading.sourceId);
      if (!prev || reading.savedAt >= prev.savedAt) latestBySource.set(reading.sourceId, reading);
    }
    const merged = [...latestBySource.values()];
    for (const reading of merged) {
      result.push({
        batchNo: reading.batchNo,
        recipeId: reading.recipeId,
        date: reading.date,
        gravity: reading.gravity,
        tempC: reading.tempC,
        diacetylPpm: reading.diacetylPpm,
        state: reading.state,
        variantCount: merged.length,
        savedAt: reading.savedAt
      });
    }
  }
  return result;
}

/** 计算单个批次的实绩（OG=最早日期读数，FG=最晚日期读数；同一天多个值取均值） */
export function batchActuals(readings: EffectiveReading[], batchNo: string): BatchActuals {
  const rows = readings
    .filter((item) => item.batchNo === batchNo)
    .sort((a, b) => a.date.localeCompare(b.date) || a.savedAt - b.savedAt);
  if (rows.length === 0) {
    return { batchNo, og: 0, fg: 0, abv: 0, attenuation: 0, readingCount: 0, hasConflicts: false };
  }

  const firstDate = rows[0].date;
  const lastDate = rows[rows.length - 1].date;
  const avgOf = (date: string, pick: (row: EffectiveReading) => number): number => {
    const sameDay = rows.filter((item) => item.date === date);
    const value = sameDay.reduce((sum, item) => sum + pick(item), 0) / sameDay.length;
    return Number(value.toFixed(4));
  };

  const og = avgOf(firstDate, (item) => item.gravity);
  const fg = avgOf(lastDate, (item) => item.gravity);
  return {
    batchNo,
    og,
    fg,
    abv: abvFromGravity(og, fg),
    attenuation: apparentAttenuation(og, fg),
    readingCount: rows.length,
    hasConflicts: rows.some((item) => item.variantCount > 1)
  };
}

/** 某批次按发酵读数回算出的最终酒精度（罐装页用） */
export function abvForBatch(rows: FermentRow[], batchNo: string): number {
  return batchActuals(effectiveReadings(rows), batchNo).abv;
}

/** 配方维度实绩：该配方全部批次归并后的 OG / FG / ABV */
export function recipeActuals(
  rows: FermentRow[],
  recipeId: string
): { og: number; fg: number; abv: number; attenuation: number; fermentCount: number; hasConflicts: boolean } {
  const readings = effectiveReadings(rows.filter((item) => item.recipeId === recipeId));
  if (readings.length === 0) {
    return { og: 0, fg: 0, abv: 0, attenuation: 0, fermentCount: 0, hasConflicts: false };
  }
  const sorted = [...readings].sort((a, b) => a.date.localeCompare(b.date) || a.savedAt - b.savedAt);
  const firstDate = sorted[0].date;
  const lastDate = sorted[sorted.length - 1].date;
  const avgOf = (date: string, pick: (row: EffectiveReading) => number): number => {
    const sameDay = sorted.filter((item) => item.date === date);
    return Number((sameDay.reduce((sum, item) => sum + pick(item), 0) / sameDay.length).toFixed(4));
  };
  const og = avgOf(firstDate, (item) => item.gravity);
  const fg = avgOf(lastDate, (item) => item.gravity);
  return {
    og,
    fg,
    abv: abvFromGravity(og, fg),
    attenuation: apparentAttenuation(og, fg),
    fermentCount: readings.length,
    hasConflicts: readings.some((item) => item.variantCount > 1)
  };
}

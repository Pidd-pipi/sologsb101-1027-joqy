/**
 * IdbTableService：Dexie 表增删改查与 Observable 流封装（等价参考模板的 useIdbTable()）。
 * 被全部页面与 effects 消费，页面不直接触碰 Dexie 实例。
 */
import { Injectable } from '@angular/core';
import { liveQuery, type Table } from 'dexie';
import { Observable } from 'rxjs';
import { countAll, ROW_REVISION } from '../utils/db';
import { createId } from '../utils/uuid';

export interface IdbRecord {
  id: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface StampedRow {
  id: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
}

/** 默认排序：最近更新的排前面 */
function defaultCompare<T extends IdbRecord>(a: T, b: T): number {
  return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
}

@Injectable({ providedIn: 'root' })
export class IdbTableService {
  /** 响应式订阅一张表（Dexie liveQuery → Observable） */
  watch<T extends IdbRecord>(table: Table<T, string>, compare?: (a: T, b: T) => number): Observable<T[]> {
    const comparator = compare ?? defaultCompare;
    return new Observable<T[]>((subscriber) => {
      const subscription = liveQuery(async () => [...(await table.toArray())].sort(comparator)).subscribe({
        next: (rows) => subscriber.next(rows as T[]),
        error: (error: unknown) => subscriber.error(error)
      });
      return () => subscription.unsubscribe();
    });
  }

  /** 一次性读取整表 */
  list<T extends IdbRecord>(table: Table<T, string>): Promise<T[]> {
    return table.toArray() as Promise<T[]>;
  }

  async get<T extends IdbRecord>(table: Table<T, string>, id: string): Promise<T | undefined> {
    return table.get(id) as Promise<T | undefined>;
  }

  /** 组装一行带 id / 修订号 / 时间戳的记录 */
  buildRow<T extends object>(payload: T, prefix: string): T & StampedRow {
    const now = Date.now();
    return { ...payload, id: createId(prefix), revision: ROW_REVISION, createdAt: now, updatedAt: now } as T & StampedRow;
  }

  async put<T extends IdbRecord>(table: Table<T, string>, row: T): Promise<void> {
    await table.put(row);
  }

  async update<T extends IdbRecord>(table: Table<T, string>, id: string, patch: Partial<T>): Promise<void> {
    await table.update(id, { ...patch, updatedAt: Date.now() } as never);
  }

  async remove<T extends IdbRecord>(table: Table<T, string>, id: string): Promise<void> {
    await table.delete(id);
  }

  async count<T extends IdbRecord>(table: Table<T, string>): Promise<number> {
    return table.count();
  }

  /** 各表行数统计（页脚与概览徽标使用） */
  async countAll(): Promise<Record<string, number>> {
    return countAll();
  }
}

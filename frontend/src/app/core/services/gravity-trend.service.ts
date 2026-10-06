/**
 * GravityTrendService：用 RxJS combineLatest 派生比重序列、表观发酵度与收得率。
 * 被发酵页、罐装页与配方台账消费。
 */
import { Injectable } from '@angular/core';
import { combineLatest, map, type Observable } from 'rxjs';
import type { Ferment } from '../models/ferment.model';
import { DIACETYL_THRESHOLD } from '../models/ferment.model';
import type { Recipe } from '../models/recipe.model';
import { abvFromGravity, apparentAttenuation, isOverTemp, potentialAbv } from '../utils/brew';

/** 单个趋势点 */
export interface GravityPoint {
  date: string;
  gravity: number;
  tempC: number;
  diacetylPpm: number;
  /** 相对上一条读数的比重日下降速率 */
  declinePerDay: number;
  overTemp: boolean;
}

/** 派生指标 */
export interface GravityMetrics {
  points: GravityPoint[];
  og: number;
  fg: number;
  abv: number;
  attenuation: number;
  potential: number;
  overTempDays: number;
  diacetylCleared: boolean;
  avgDeclinePerDay: number;
  /** 发酵是否停滞（末尾两次下降均 < 0.002） */
  stuck: boolean;
}

const EMPTY_METRICS: GravityMetrics = {
  points: [],
  og: 0,
  fg: 0,
  abv: 0,
  attenuation: 0,
  potential: 0,
  overTempDays: 0,
  diacetylCleared: false,
  avgDeclinePerDay: 0,
  stuck: false
};

@Injectable({ providedIn: 'root' })
export class GravityTrendService {
  /** 由读数流构建趋势点序列 */
  buildTrend(ferments$: Observable<Ferment[]>): Observable<GravityPoint[]> {
    return ferments$.pipe(
      map((rows) => {
        const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
        return sorted.map((row, index) => {
          const prev = index > 0 ? sorted[index - 1] : null;
          const days = prev ? (new Date(row.date).getTime() - new Date(prev.date).getTime()) / 86400000 : 0;
          const declinePerDay = prev && days > 0 ? Number(((prev.gravity - row.gravity) / days).toFixed(4)) : 0;
          return {
            date: row.date,
            gravity: row.gravity,
            tempC: row.tempC,
            diacetylPpm: row.diacetylPpm,
            declinePerDay,
            overTemp: isOverTemp(row.tempC)
          };
        });
      })
    );
  }

  /** 用 combineLatest 把「读数 + 配方」派生成完整指标 */
  combine(ferments$: Observable<Ferment[]>, recipe$: Observable<Recipe | null>): Observable<GravityMetrics> {
    return combineLatest([ferments$, recipe$]).pipe(
      map(([ferments, recipe]) => GravityTrendService.calculate(ferments, recipe))
    );
  }

  /** 纯函数实现：便于单元测试与模板内直接调用 */
  static calculate(ferments: Ferment[], recipe: Recipe | null): GravityMetrics {
    if (ferments.length === 0 && !recipe) return { ...EMPTY_METRICS };
    const sorted = [...ferments].sort((a, b) => a.date.localeCompare(b.date));
    const points: GravityPoint[] = sorted.map((row, index) => {
      const prev = index > 0 ? sorted[index - 1] : null;
      const days = prev ? (new Date(row.date).getTime() - new Date(prev.date).getTime()) / 86400000 : 0;
      return {
        date: row.date,
        gravity: row.gravity,
        tempC: row.tempC,
        diacetylPpm: row.diacetylPpm,
        declinePerDay: prev && days > 0 ? Number(((prev.gravity - row.gravity) / days).toFixed(4)) : 0,
        overTemp: isOverTemp(row.tempC)
      };
    });
    const og = sorted.length > 0 ? sorted[0].gravity : (recipe?.targetOg ?? 0);
    const fg = sorted.length > 0 ? sorted[sorted.length - 1].gravity : (recipe?.targetFg ?? 0);
    const tail = points.slice(-2);
    const declines = points.slice(1).map((item) => item.declinePerDay);
    const latestDiacetyl = sorted.length > 0 ? sorted[sorted.length - 1].diacetylPpm : 0;

    return {
      points,
      og,
      fg,
      abv: abvFromGravity(og, fg),
      attenuation: apparentAttenuation(og, fg),
      potential: potentialAbv(og),
      overTempDays: points.filter((item) => item.overTemp).length,
      diacetylCleared: sorted.length > 0 && latestDiacetyl < DIACETYL_THRESHOLD,
      avgDeclinePerDay:
        declines.length > 0 ? Number((declines.reduce((sum, item) => sum + item, 0) / declines.length).toFixed(4)) : 0,
      stuck: tail.length === 2 && tail.every((item) => item.declinePerDay > 0 && item.declinePerDay < 0.002)
    };
  }
}

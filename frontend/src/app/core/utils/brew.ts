/**
 * 酿造计算工具：比重与糖度换算、IBU / 色度 / 酒精度计算与单位换算
 * 被配方台账、辅料库、煮沸页、发酵页与罐装页共同消费。
 */

/** 糖度（°Bx）→ 比重 */
export function brixToSg(brix: number): number {
  const safe = Math.max(0, Math.min(40, brix));
  return Number((1 + safe / (258.6 - (safe / 258.2) * 227.1)).toFixed(4));
}

/** 比重 → 糖度（°Bx） */
export function sgToBrix(sg: number): number {
  let low = 0;
  let high = 40;
  for (let i = 0; i < 40; i += 1) {
    const mid = (low + high) / 2;
    if (brixToSg(mid) < sg) low = mid;
    else high = mid;
  }
  return Number(((low + high) / 2).toFixed(2));
}

/** 比重点数（OG 1.052 → 52） */
export function gravityPoints(sg: number): number {
  return Math.round((sg - 1) * 1000);
}

/** 表观发酵度 % */
export function apparentAttenuation(og: number, fg: number): number {
  if (og <= 1) return 0;
  return Number((((og - fg) / (og - 1)) * 100).toFixed(1));
}

/** 酒精度 %vol（由 OG / FG 估算） */
export function abvFromGravity(og: number, fg: number): number {
  return Number((Math.max(0, (og - fg) * 131.25)).toFixed(2));
}

/** 潜在酒精度 */
export function potentialAbv(sg: number): number {
  return Number((Math.max(0, (sg - 1) * 131.25)).toFixed(2));
}

/** 总投料量 kg（按批次体积与目标 OG 粗算，1 kg 麦芽约贡献 300 比重点·L） */
export function totalGrainKg(batchSizeL: number, targetOg: number, efficiency = 0.72): number {
  const points = gravityPoints(targetOg) * batchSizeL;
  const result = points / (300 * efficiency);
  return Number(Math.max(0, result).toFixed(2));
}

/** 按占比计算某条麦芽的投料量 kg */
export function maltAmountKg(totalKg: number, ratioPct: number): number {
  return Number(((totalKg * ratioPct) / 100).toFixed(2));
}

/** 配方加权平均色度 EBC */
export function weightedEbc(malts: Array<{ ebc: number; ratioPct: number }>): number {
  const totalRatio = malts.reduce((sum, item) => sum + item.ratioPct, 0);
  if (totalRatio === 0) return 0;
  return Number((malts.reduce((sum, item) => sum + item.ebc * item.ratioPct, 0) / totalRatio).toFixed(1));
}

/** 色度偏差（实算 - 目标） */
export function ebcDeviation(malts: Array<{ ebc: number; ratioPct: number }>, targetEbc: number): number {
  return Number((weightedEbc(malts) - targetEbc).toFixed(1));
}

/**
 * Tinseth 简化版 IBU 估算
 * @param alphaPct α 酸百分比
 * @param amountG  用量 g
 * @param atMin    煮沸剩余分钟
 * @param batchSizeL 批次体积 L
 * @param og       麦汁比重
 */
export function estimateIbu(alphaPct: number, amountG: number, atMin: number, batchSizeL: number, og: number): number {
  if (batchSizeL <= 0 || amountG <= 0) return 0;
  const utilization = Math.min(0.35, 0.18 + atMin / 300);
  const gravityFactor = og > 1.05 ? 1 + (og - 1.05) : 1;
  const ibu = (alphaPct / 100) * amountG * 1000 * utilization;
  return Number(Math.max(0, ibu / (batchSizeL * gravityFactor)).toFixed(1));
}

/** 由投放时点推导用途 */
export function purposeByAtMin(atMin: number): '苦味' | '风味' | '香气' {
  if (atMin >= 45) return '苦味';
  if (atMin >= 15) return '风味';
  return '香气';
}

/** 投加时点 → 倒计时文本 */
export function countdownText(atMin: number): string {
  return `还剩 ${atMin} 分钟`;
}

/** 色度 → 展示用色块颜色 */
export function ebcColor(ebc: number): string {
  if (ebc <= 6) return '#f0e2a8';
  if (ebc <= 12) return '#e0b64f';
  if (ebc <= 20) return '#c98a34';
  if (ebc <= 35) return '#8f5a25';
  if (ebc <= 60) return '#5a3620';
  return '#2c1b13';
}

/** 是否超温 */
export function isOverTemp(tempC: number): boolean {
  return tempC > 24;
}

/** 收得率（罐装数量 / 批次体积，L） */
export function packagingYield(batchSizeL: number, packagedL: number): number {
  if (batchSizeL <= 0) return 0;
  return Number(((packagedL / batchSizeL) * 100).toFixed(1));
}

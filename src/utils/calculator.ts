export interface SongInfo {
  /** 歌曲定数 */
  constant: number;
  /** 歌曲名称 */
  name?: string;
}

export interface ScoreResult {
  /** 得分 */
  score: number;
  /** 准确率 */
  accuracy: number;
  /** Perfect 数量 */
  perfect: number;
  /** Great 数量 */
  great: number;
  /** Good 数量 */
  good: number;
  /** Bad 数量 */
  bad: number;
  /** Miss 数量 */
  miss: number;
  /** 总 note 数 */
  totalNotes: number;
}

export interface RatingResult {
  /** 单曲 Rating */
  rating: number;
  /** 评级 (S++, S+, S, A, B, C, D, F) */
  rank: string;
  /** 是否 FC */
  isFC: boolean;
  /** 是否 AP */
  isAP: boolean;
}

const NOTE_WEIGHTS = {
  perfect: 1.0,
  great: 0.7,
  good: 0.3,
  bad: 0.0,
  miss: 0.0
};

const RANK_THRESHOLDS = {
  'S++': 1_000_000,
  'S+': 990_000,
  S: 970_000,
  A: 940_000,
  B: 900_000,
  C: 850_000,
  D: 800_000,
  F: 0
};

export function calculateScore(result: ScoreResult): number {
  const totalWeight =
    result.perfect * NOTE_WEIGHTS.perfect +
    result.great * NOTE_WEIGHTS.great +
    result.good * NOTE_WEIGHTS.good +
    result.bad * NOTE_WEIGHTS.bad +
    result.miss * NOTE_WEIGHTS.miss;

  const maxWeight = result.totalNotes * NOTE_WEIGHTS.perfect;

  return Math.floor((totalWeight / maxWeight) * 1_000_000);
}

export function calculateAccuracy(result: ScoreResult): number {
  const score = result.score || calculateScore(result);
  return (score / 1_000_000) * 100;
}

export function getRank(score: number): string {
  for (const [rank, threshold] of Object.entries(RANK_THRESHOLDS)) {
    if (score >= threshold) {
      return rank;
    }
  }
  return 'F';
}

// 计算单曲 Rating (V3 版本)
export function calculateSingleRating(constant: number, score: number): number {
  if (constant < 0.001) return 0;
  if (score >= 1_000_000) return constant + 1.5;
  if (score >= 850_000) return constant + (score - 850_000) / 100_000;
  if (score >= 700_000) {
    return Math.max(
      0,
      constant * (0.5 + (score - 700_000) / 300_000) + (score - 850_000) / 100_000
    );
  }
  if (score >= 600_000) {
    return Math.max(0, ((constant - 3) * (score - 600_000)) / 200_000);
  }
  return 0;
}

export function calculateRating(song: SongInfo, result: ScoreResult): RatingResult {
  const score = result.score || calculateScore(result);
  const rank = getRank(score);
  const rating = calculateSingleRating(song.constant, score);
  const isFC = result.bad === 0 && result.miss === 0;
  const isAP = result.perfect === result.totalNotes;

  return {
    rating: Math.round(rating * 100000) / 100000, // 保留五位小数
    rank,
    isFC,
    isAP
  };
}

// 计算 Best 20 平均 Rating (Milthm 使用 B20)

export function calculateAverageRating(ratings: number[]): number {
  if (ratings.length === 0) return 0;

  const best20 = [...ratings].sort((a, b) => b - a).slice(0, 20);
  const sum = best20.reduce((acc, r) => acc + r, 0);
  return sum / 20;
}

// 从存档 JSON 解析歌曲成绩数据
export interface SaveDataScore {
  chart_id: string;
  score: number;
  accuracy: number;
  perfect_count: number;
  good_count: number;
  bad_count: number;
  miss_count: number;
  played_at: string;
  // V3 存档额外字段
  isV3?: boolean;
  bestLevel?: number;
  achievedStatus?: number[];
}

export function parseSaveData(saveContent: string): SaveDataScore[] {
  try {
    const data = JSON.parse(saveContent);

    const mapRecord = (record: any, isV3: boolean): SaveDataScore => ({
      chart_id: String(record.BeatmapID || '').trim(),
      score: record.BestScore || 0,
      accuracy: record.BestAccuracy || 0,
      perfect_count: 0,
      good_count: 0,
      bad_count: 0,
      miss_count: 0,
      played_at: '',
      isV3,
      bestLevel: record.BestLevel,
      achievedStatus: record.AchievedStatus || []
    });

    // milthm 6.0: prefer SongRecordsV3 only; legacy SongRecords if V3 absent
    if (Array.isArray(data.SongRecordsV3) && data.SongRecordsV3.length > 0) {
      return data.SongRecordsV3.map((r: any) => mapRecord(r, true));
    }
    if (Array.isArray(data.SongRecords)) {
      return data.SongRecords.map((r: any) => mapRecord(r, false));
    }
    return [];
  } catch (error) {
    console.error('解析存档数据失败', error);
    return [];
  }
}


export interface FeedCacheData {
  rawRss: string; // For multiple feeds, this will be concatenated XMLs
  summary: string;
  timestamp: number;
  originalUrls: string[]; // Changed from originalUrl: string
}

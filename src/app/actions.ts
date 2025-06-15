"use server";

import { summarizeRssFeed, type SummarizeRssFeedInput } from '@/ai/flows/summarize-rss-feed';

export interface ProcessRssFeedResult {
  currentFeed: string;
  summary: string;
  timestamp: number;
  originalUrl: string;
}

export async function processRssFeed(feedUrl: string, previousFeedContent?: string): Promise<ProcessRssFeedResult> {
  try {
    const response = await fetch(feedUrl, { cache: 'no-store' }); // Always fetch fresh
    if (!response.ok) {
      throw new Error(`Failed to fetch RSS feed: ${response.statusText}`);
    }
    const currentFeed = await response.text();

    const aiInput: SummarizeRssFeedInput = {
      currentFeed,
    };
    if (previousFeedContent) {
      aiInput.previousFeed = previousFeedContent;
    }

    const aiResult = await summarizeRssFeed(aiInput);

    return {
      currentFeed,
      summary: aiResult.summary,
      timestamp: Date.now(),
      originalUrl: feedUrl,
    };
  } catch (error) {
    console.error("Error processing RSS feed:", error);
    // Rethrow a more generic error or a specific error object
    if (error instanceof Error) {
        throw new Error(`Could not process RSS feed: ${error.message}`);
    }
    throw new Error("An unknown error occurred while processing the RSS feed.");
  }
}

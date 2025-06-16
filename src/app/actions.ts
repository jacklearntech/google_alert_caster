
"use server";

import { summarizeRssFeed, type SummarizeRssFeedInput } from '@/ai/flows/summarize-rss-feed';

export interface ProcessRssFeedResult {
  mergedFeedContent: string; // Renamed from currentFeed, stores concatenated XMLs
  summary: string;
  timestamp: number;
  originalUrls: string[]; // Changed from originalUrl: string
}

const MULTI_FEED_XML_SEPARATOR = "\n\n<!-- FEED SEPARATOR -->\n\n";

export async function processRssFeed(
  feedUrls: string | string[], // Can be a single URL string or an array of URL strings
  previousFeedContent?: string 
): Promise<ProcessRssFeedResult> {
  const urlsArray = Array.isArray(feedUrls) ? feedUrls : [feedUrls];
  const isSingleFeed = urlsArray.length === 1;

  try {
    const fetchPromises = urlsArray.map(url => 
      fetch(url, { cache: 'no-store' }) // Always fetch fresh
        .then(async response => {
          if (!response.ok) {
            let errorBody = '';
            try {
              errorBody = await response.text();
            } catch (parseError) { /* Ignore */ }
            const errorMessage = errorBody ? errorBody.substring(0, 200) : response.statusText;
            throw new Error(`Failed to fetch ${url}: ${response.status} ${errorMessage}`);
          }
          return response.text();
        })
    );

    const allFeedContents = await Promise.all(fetchPromises);
    
    // For rawRss to be downloaded/viewed, concatenate all XMLs separated by a comment
    const mergedFeedContentForUser = allFeedContents.join(MULTI_FEED_XML_SEPARATOR);
    // For AI, also send the concatenated string of XMLs
    const feedContentForAI = allFeedContents.join("\n\n");


    const aiInput: SummarizeRssFeedInput = {
      currentFeed: feedContentForAI, // AI gets the concatenated content
    };

    // Only provide previousFeed if it's a single feed and previous content exists
    if (isSingleFeed && previousFeedContent) {
      aiInput.previousFeed = previousFeedContent;
    }

    const aiResult = await summarizeRssFeed(aiInput);

    return {
      mergedFeedContent: mergedFeedContentForUser,
      summary: aiResult.summary,
      timestamp: Date.now(),
      originalUrls: urlsArray,
    };
  } catch (error) {
    console.error("Error processing RSS feed(s):", error);
    if (error instanceof Error) {
        throw new Error(`Could not process RSS feed(s): ${error.message}`);
    }
    throw new Error("An unknown error occurred while processing the RSS feed(s).");
  }
}


"use server";

import { summarizeRssFeed, type SummarizeRssFeedInput } from '@/ai/flows/summarize-rss-feed';

export interface ProcessRssFeedResult {
  mergedFeedContent: string; 
  summary: string;
  timestamp: number;
  originalUrls: string[]; 
}

export async function processRssFeed(
  feedUrls: string | string[], 
  previousFeedContent?: string 
): Promise<ProcessRssFeedResult> {
  const urlsArray = Array.isArray(feedUrls) ? feedUrls : [feedUrls];
  const isSingleFeed = urlsArray.length === 1;

  try {
    const fetchPromises = urlsArray.map(url => 
      fetch(url, { cache: 'no-store' }) 
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
    
    let mergedFeedContentForUser: string;

    if (allFeedContents.length > 1) {
      let baseXml = allFeedContents[0];
      const entriesToMerge: string[] = [];

      for (let i = 1; i < allFeedContents.length; i++) {
        const subsequentFeedContent = allFeedContents[i];
        const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
        let match;
        while ((match = entryRegex.exec(subsequentFeedContent)) !== null) {
          entriesToMerge.push(match[0]); 
        }
      }

      if (entriesToMerge.length > 0) {
        const feedCloseTagRegex = /<\/feed\s*>/i; 
        const match = feedCloseTagRegex.exec(baseXml);

        if (match) {
          const feedCloseTagIndex = match.index;
          mergedFeedContentForUser = 
            baseXml.substring(0, feedCloseTagIndex) +
            entriesToMerge.join('\n') + 
            '\n' + 
            baseXml.substring(feedCloseTagIndex);
        } else {
          console.warn("Could not find closing </feed> tag in base XML for merging. Appending entries as a fallback.");
          mergedFeedContentForUser = baseXml + '\n' + entriesToMerge.join('\n');
        }
      } else {
        mergedFeedContentForUser = baseXml;
      }
    } else if (allFeedContents.length === 1) {
      mergedFeedContentForUser = allFeedContents[0];
    } else {
      mergedFeedContentForUser = ""; 
    }
    
    // Clean up Google redirect links in the mergedFeedContentForUser (for display/download)
    // Specifically targets <link>CONTENT</link> tags.
    mergedFeedContentForUser = mergedFeedContentForUser.replace(/<link>([^<]+)<\/link>/g, (match, linkContent) => {
      const googleRedirectPrefix = 'https://www.google.com/url?rct=j&amp;sa=t&amp;url=';
      if (linkContent.startsWith(googleRedirectPrefix)) {
        const actualUrl = linkContent.substring(googleRedirectPrefix.length);
        return `<link>${actualUrl}</link>`;
      }
      // If the link does not start with the specific Google redirect prefix, return it unchanged.
      return match; 
    });
    
    const feedContentForAI = allFeedContents.join("\n\n");

    const aiInput: SummarizeRssFeedInput = {
      currentFeed: feedContentForAI, 
    };

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


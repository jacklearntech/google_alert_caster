
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

      // Extract <entry>...</entry> blocks from subsequent feeds
      for (let i = 1; i < allFeedContents.length; i++) {
        const subsequentFeedContent = allFeedContents[i];
        const entryRegex = /<entry>[\s\S]*?<\/entry>/g; // Use non-greedy match
        let match;
        while ((match = entryRegex.exec(subsequentFeedContent)) !== null) {
          entriesToMerge.push(match[0]);
        }
      }

      if (entriesToMerge.length > 0) {
        // Find the closing </feed> tag in the base XML
        const feedCloseTagRegex = /<\/feed\s*>/i;
        const match = feedCloseTagRegex.exec(baseXml);

        if (match) {
          const feedCloseTagIndex = match.index;
          mergedFeedContentForUser =
            baseXml.substring(0, feedCloseTagIndex) +
            '\n' + // Add a newline for separation
            entriesToMerge.join('\n') + // Join new entries with newlines
            '\n' + // Add a newline before the closing tag
            baseXml.substring(feedCloseTagIndex);
        } else {
          // Fallback if </feed> tag is not found (shouldn't happen with valid Atom feeds)
          console.warn("Could not find closing </feed> tag in base XML for merging. Appending entries as a fallback.");
          mergedFeedContentForUser = baseXml + '\n' + entriesToMerge.join('\n');
        }
      } else {
        mergedFeedContentForUser = baseXml; // Only one feed's content, or others had no entries
      }
    } else if (allFeedContents.length === 1) {
      mergedFeedContentForUser = allFeedContents[0];
    } else {
      mergedFeedContentForUser = ""; // No feeds provided
    }

    // Clean up Google redirect links and tracking parameters in the mergedFeedContentForUser
    const googleRedirectPrefixXML = 'https://www.google.com/url?rct=j&amp;sa=t&amp;url=';
    const trackingSuffixPattern = /&amp;ct=ga&amp;cd[\s\S]*/;
    
    mergedFeedContentForUser = mergedFeedContentForUser.replace(
      /(<link[^>]*?href=")([^"]*)(")/g,
      (match, g1OpeningTagAndHref, hrefValue, g3ClosingQuote) => {
        let newHrefValue = hrefValue;

        // Step 1: Remove Google redirect prefix if present
        if (newHrefValue.startsWith(googleRedirectPrefixXML)) {
          newHrefValue = newHrefValue.substring(googleRedirectPrefixXML.length);
        }

        // Step 2: Remove tracking suffix if present
        const suffixMatchIndex = newHrefValue.indexOf('&amp;ct=ga&amp;cd');
        if (suffixMatchIndex !== -1) {
          newHrefValue = newHrefValue.substring(0, suffixMatchIndex);
        }
        
        return `${g1OpeningTagAndHref}${newHrefValue}${g3ClosingQuote}`;
      }
    );

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

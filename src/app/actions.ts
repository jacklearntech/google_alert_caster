
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

    // Clean up Google redirect links in the mergedFeedContentForUser (for display/download)
    // Targets href attributes of <link> tags.
    const googleRedirectPrefixToReplace = 'https://www.google.com/url?rct=j&amp;sa=t&amp;url=';
    
    mergedFeedContentForUser = mergedFeedContentForUser.replace(
      // Regex to capture:
      // g1: Start of the link tag up to href=" (e.g., <link rel="alternate" href=")
      // g2: The content of the href attribute (the URL)
      // g3: The closing quote of the href attribute (")
      /(<link[^>]*?href=")([^"]*)(")/g,
      (match, g1, g2, g3) => {
        const hrefValue = g2; // g2 is the URL itself
        if (hrefValue.startsWith(googleRedirectPrefixToReplace)) {
          const newHrefValue = hrefValue.substring(googleRedirectPrefixToReplace.length);
          return `${g1}${newHrefValue}${g3}`; // Reconstruct with the modified href value
        }
        return match; // No change if prefix not found
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

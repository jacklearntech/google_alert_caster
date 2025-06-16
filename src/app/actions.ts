
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
        // Extract <entry>...</entry> blocks. Using [\s\S]*? for multiline content.
        const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
        let match;
        while ((match = entryRegex.exec(subsequentFeedContent)) !== null) {
          entriesToMerge.push(match[0]); // match[0] is the full <entry>...</entry>
        }
      }

      if (entriesToMerge.length > 0) {
        // Find the closing tag of the main feed element (e.g., </feed>)
        // Google Alerts RSS uses <feed> as the root.
        const feedCloseTagRegex = /<\/feed\s*>/i; // Case-insensitive, allows for optional space before >
        const match = feedCloseTagRegex.exec(baseXml);

        if (match) {
          const feedCloseTagIndex = match.index;
          mergedFeedContentForUser = 
            baseXml.substring(0, feedCloseTagIndex) +
            entriesToMerge.join('\n') + // Add a newline between merged entries for readability
            '\n' + // Ensure newline before the closing tag
            baseXml.substring(feedCloseTagIndex);
        } else {
          console.warn("Could not find closing </feed> tag in base XML for merging. Appending entries as a fallback.");
          // Fallback: if </feed> not found, append to the end of the base XML.
          mergedFeedContentForUser = baseXml + '\n' + entriesToMerge.join('\n');
        }
      } else {
        // No entries found in subsequent feeds, use the base XML as is.
        mergedFeedContentForUser = baseXml;
      }
    } else if (allFeedContents.length === 1) {
      mergedFeedContentForUser = allFeedContents[0];
    } else {
      // No feeds fetched, result in empty string.
      mergedFeedContentForUser = ""; 
    }
    
    // Clean up links in the mergedFeedContentForUser (for display/download)
    // For links like <link>PREAMBLE&url=ACTUAL_URL...</link>, change to <link>ACTUAL_URL...</link>
    mergedFeedContentForUser = mergedFeedContentForUser.replace(/<link>([^<]+)<\/link>/g, (match, linkContent) => {
      const urlParamIndex = linkContent.indexOf('&url=');
      if (urlParamIndex !== -1) {
        const actualUrl = linkContent.substring(urlParamIndex + '&url='.length);
        if (actualUrl.startsWith('http')) {
          return `<link>${actualUrl}</link>`;
        }
      }
      return match; 
    });
    
    // For AI, send the simple concatenation of XMLs
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


"use server";

import { summarizeRssFeed, type SummarizeRssFeedInput } from '@/ai/flows/summarize-rss-feed';

export interface ProcessRssFeedResult {
  mergedFeedContent: string;
  summary: string;
  timestamp: number;
  originalUrls: string[];
}

function getHostname(url: string): string {
  try {
    // Decode XML entities like &amp; before parsing with new URL()
    const decodedUrl = url.replace(/&amp;/g, '&')
                          .replace(/&lt;/g, '<')
                          .replace(/&gt;/g, '>')
                          .replace(/&quot;/g, '"')
                          .replace(/&apos;/g, "'");
    const parsedUrl = new URL(decodedUrl);
    return parsedUrl.hostname;
  } catch (e) {
    // Fallback for potentially malformed URLs after cleaning
    const domainMatch = url.match(/^(?:https?:\/\/)?(?:[^@\n]+@)?(?:www\.)?([^:\/\n?]+)/im);
    if (domainMatch && domainMatch[1]) {
        return domainMatch[1];
    }
    return 'unknown';
  }
}

export async function processRssFeed(
  feedUrls: string | string[],
  previousFeedContent?: string
): Promise<ProcessRssFeedResult> {
  const urlsArray = Array.isArray(feedUrls) ? feedUrls : [feedUrls];
  const isSingleFeed = urlsArray.length === 1;

  const googleRedirectPrefixXML = 'https://www.google.com/url?rct=j&amp;sa=t&amp;url=';

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
        const entryRegex = /<entry>[\s\S]*?<\/entry>/g; 
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
            '\n' + 
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

    // Step 1: Add <sourcename> to each entry
    mergedFeedContentForUser = mergedFeedContentForUser.replace(/<entry>[\s\S]*?<\/entry>/g, (entryMatch) => {
      let modifiedEntry = entryMatch;
      const linkTagRegex = /<link[^>]*?href="([^"]*)"[^>]*?\/>/;
      const linkMatch = modifiedEntry.match(linkTagRegex);

      if (linkMatch && linkMatch[1]) {
          let hrefValue = linkMatch[1]; 

          // Clean hrefValue temporarily for hostname extraction
          let tempCleanedHref = hrefValue;
          if (tempCleanedHref.startsWith(googleRedirectPrefixXML)) {
              tempCleanedHref = tempCleanedHref.substring(googleRedirectPrefixXML.length);
          }
          const suffixMatchIndex = tempCleanedHref.indexOf('&amp;ct=ga&amp;cd');
          if (suffixMatchIndex !== -1) {
              tempCleanedHref = tempCleanedHref.substring(0, suffixMatchIndex);
          }

          const hostname = getHostname(tempCleanedHref);
          const sourceNameTag = `<sourcename>${hostname}</sourcename>`;
          
          // Insert sourcenameTag after the full matched link tag linkMatch[0]
          modifiedEntry = modifiedEntry.replace(linkMatch[0], linkMatch[0] + sourceNameTag);
      }
      return modifiedEntry;
    });
    
    // Step 2: Clean up Google redirect links and tracking parameters in the mergedFeedContentForUser HREFs
    mergedFeedContentForUser = mergedFeedContentForUser.replace(
      /(<link[^>]*?href=")([^"]*)(")/g,
      (match, g1OpeningTagAndHref, hrefValue, g3ClosingQuote) => {
        let newHrefValue = hrefValue;

        if (newHrefValue.startsWith(googleRedirectPrefixXML)) {
          newHrefValue = newHrefValue.substring(googleRedirectPrefixXML.length);
        }

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

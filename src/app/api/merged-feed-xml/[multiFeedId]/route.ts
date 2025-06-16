
import { type NextRequest, NextResponse } from 'next/server';

const MULTI_FEED_SEPARATOR = '_|||_'; // Ensure this matches client-side definitions

export async function GET(
  request: NextRequest,
  { params }: { params: { multiFeedId: string } }
) {
  const { multiFeedId } = params;
  if (!multiFeedId) {
    return NextResponse.json({ error: 'Multi-Feed ID is required' }, { status: 400 });
  }

  let decodedMultiFeedId: string;
  try {
    // Decode the entire multiFeedId first
    decodedMultiFeedId = decodeURIComponent(multiFeedId);
  } catch (e) {
    return NextResponse.json({ error: 'Invalid Multi-Feed ID encoding' }, { status: 400 });
  }

  // Then split by the separator
  const urlsArray = decodedMultiFeedId.includes(MULTI_FEED_SEPARATOR)
    ? decodedMultiFeedId.split(MULTI_FEED_SEPARATOR)
    : [decodedMultiFeedId]; // Though for "merged", it should always have the separator if multiple

  if (urlsArray.length === 0 || urlsArray.every(url => !url.trim())) {
    return NextResponse.json({ error: 'No feed URLs found in Multi-Feed ID' }, { status: 400 });
  }

  try {
    const fetchPromises = urlsArray.map(url =>
      fetch(url, { cache: 'no-store' }) 
        .then(async response => {
          if (!response.ok) {
            let errorBody = '';
            try { errorBody = await response.text(); } catch (parseError) { /* Ignore */ }
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
            '\n' + 
            entriesToMerge.join('\n') + 
            '\n' + 
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
      mergedFeedContentForUser = "<?xml version='1.0' encoding='UTF-8'?><feed xmlns='http://www.w3.org/2005/Atom'><title>Empty Feed</title></feed>";
    }

    // Clean up Google redirect links and tracking parameters in the mergedFeedContentForUser
    const googleRedirectPrefixWithAmp = 'https://www.google.com/url?rct=j&amp;sa=t&amp;url=';
    
    mergedFeedContentForUser = mergedFeedContentForUser.replace(
        /(<link[^>]*?href=")([^"]*)(")/g,
        (match, g1OpeningTagAndHref, hrefValue, g3ClosingQuote) => {
            let newHrefValue = hrefValue;

            // Step 1: Remove Google redirect prefix if present
            if (newHrefValue.startsWith(googleRedirectPrefixWithAmp)) {
              newHrefValue = newHrefValue.substring(googleRedirectPrefixWithAmp.length);
            }
    
            // Step 2: Remove tracking suffix if present
            const suffixMatchIndex = newHrefValue.indexOf('&amp;ct=ga&amp;cd');
            if (suffixMatchIndex !== -1) {
              newHrefValue = newHrefValue.substring(0, suffixMatchIndex);
            }
            
            return `${g1OpeningTagAndHref}${newHrefValue}${g3ClosingQuote}`;
        }
    );

    return new NextResponse(mergedFeedContentForUser, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'no-store, max-age=0, must-revalidate',
      },
    });

  } catch (error) {
    console.error('Error fetching/merging feeds for merged XML endpoint:', error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: `Failed to retrieve merged feed XML: ${message}` }, { status: 500 });
  }
}

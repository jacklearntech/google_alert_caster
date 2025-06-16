
import { type NextRequest, NextResponse } from 'next/server';

const MULTI_FEED_SEPARATOR = '_|||_'; 

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
    decodedMultiFeedId = decodeURIComponent(multiFeedId);
  } catch (e) {
    return NextResponse.json({ error: 'Invalid Multi-Feed ID encoding' }, { status: 400 });
  }

  const urlsArray = decodedMultiFeedId.includes(MULTI_FEED_SEPARATOR)
    ? decodedMultiFeedId.split(MULTI_FEED_SEPARATOR)
    : [decodedMultiFeedId]; 

  if (urlsArray.length === 0 || urlsArray.every(url => !url.trim())) {
    return NextResponse.json({ error: 'No feed URLs found in Multi-Feed ID' }, { status: 400 });
  }

  const googleRedirectPrefixXML = 'https://www.google.com/url?rct=j&amp;sa=t&amp;url=';

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
      mergedFeedContentForUser = "<?xml version='1.0' encoding='UTF-8'?><feed xmlns='http://www.w3.org/2005/Atom'><title>Empty Feed</title></feed>";
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

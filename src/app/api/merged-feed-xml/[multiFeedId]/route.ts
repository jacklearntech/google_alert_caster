
import { type NextRequest, NextResponse } from 'next/server';
import { analyzeArticleSentiment } from '@/ai/flows/analyze-article-sentiment'; // Import the new flow

const MULTI_FEED_SEPARATOR = '_|||_'; 

function getHostname(url: string): string {
  try {
    const decodedUrl = url.replace(/&amp;/g, '&')
                          .replace(/&lt;/g, '<')
                          .replace(/&gt;/g, '>')
                          .replace(/&quot;/g, '"')
                          .replace(/&apos;/g, "'");
    const parsedUrl = new URL(decodedUrl);
    return parsedUrl.hostname;
  } catch (e) {
    const domainMatch = url.match(/^(?:https?:\/\/)?(?:[^@\n]+@)?(?:www\.)?([^:\/\n?]+)/im);
    if (domainMatch && domainMatch[1]) {
        return domainMatch[1];
    }
    return 'unknown';
  }
}

function stripHtmlAndDecode(html: string): string {
  if (!html) return '';
  let text = html;
  text = text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));
  text = text.replace(/<[^>]*>?/gm, '');
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

async function postProcessUserFeedXmlForApi(xmlString: string): Promise<string> {
  let processedXml = xmlString;
  const googleRedirectPrefixXML = 'https://www.google.com/url?rct=j&amp;sa=t&amp;url=';

  const entryRegex = /<entry>[\s\S]*?<\/entry>/g;
  const entries = [];
  let match;
  while ((match = entryRegex.exec(processedXml)) !== null) {
    let entryXml = match[0];

    // 1. Sentiment Analysis
    const titleMatch = entryXml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const articleTitle = titleMatch ? stripHtmlAndDecode(titleMatch[1]) : 'No title';
    
    let articleContent = 'No content';
    const contentTagMatch = entryXml.match(/<content[^>]*>([\s\S]*?)<\/content>/i);
    if (contentTagMatch && contentTagMatch[1]) {
        articleContent = stripHtmlAndDecode(contentTagMatch[1]);
    } else {
        const summaryMatch = entryXml.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i);
        if (summaryMatch && summaryMatch[1]) {
            articleContent = stripHtmlAndDecode(summaryMatch[1]);
        }
    }

    try {
        const sentimentResult = await analyzeArticleSentiment({ title: articleTitle, content: articleContent });
        const sentimentTag = `<sentiment>${sentimentResult.sentiment}</sentiment>`;
        
        const updatedTagMatch = /<\/updated>/i;
        if (updatedTagMatch.test(entryXml)) {
            entryXml = entryXml.replace(updatedTagMatch, `$&${sentimentTag}`);
        } else {
             const idTagMatch = /<\/id>/i;
             if (idTagMatch.test(entryXml)) {
                entryXml = entryXml.replace(idTagMatch, `$&${sentimentTag}`);
             } else {
                entryXml = entryXml.replace(/(<\/entry>)/i, `${sentimentTag}$1`);
             }
        }
    } catch (e) {
        console.warn(`Sentiment analysis failed for article in API route: ${articleTitle}`, e);
    }
    
    // 2. Add <sourcename>
    const linkTagRegex = /<link[^>]*?href="([^"]*)"[^>]*?\/>/;
    const linkMatch = entryXml.match(linkTagRegex);
    if (linkMatch && linkMatch[1]) {
        let hrefValue = linkMatch[1];
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
        if(linkMatch[0]){
             entryXml = entryXml.replace(linkMatch[0], linkMatch[0] + sourceNameTag);
        }
    }
    entries.push(entryXml);
  }

  if (entries.length > 0) {
    let currentEntryIndex = 0;
    processedXml = processedXml.replace(entryRegex, () => entries[currentEntryIndex++]);
  }
  
  // 3. Clean up Google redirect links and tracking parameters in HREFs
  processedXml = processedXml.replace(
      /(<link[^>]*?href=")([^"]*)(")/g,
      (matchHref, g1OpeningTagAndHref, hrefValue, g3ClosingQuote) => {
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
  return processedXml;
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
        let matchEntry;
        while ((matchEntry = entryRegex.exec(subsequentFeedContent)) !== null) {
          entriesToMerge.push(matchEntry[0]);
        }
      }
      if (entriesToMerge.length > 0) {
        const feedCloseTagRegex = /<\/feed\s*>/i;
        const matchFeedClose = feedCloseTagRegex.exec(baseXml);
        if (matchFeedClose) {
          const feedCloseTagIndex = matchFeedClose.index;
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
    
    // Post-process the merged XML
    mergedFeedContentForUser = await postProcessUserFeedXmlForApi(mergedFeedContentForUser);

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

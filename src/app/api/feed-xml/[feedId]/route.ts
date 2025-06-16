
import { type NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { feedId: string } }
) {
  const { feedId } = params;
  if (!feedId) {
    return NextResponse.json({ error: 'Feed ID is required' }, { status: 400 });
  }

  let decodedUrl: string;
  try {
    decodedUrl = decodeURIComponent(feedId);
  } catch (e) {
    return NextResponse.json({ error: 'Invalid Feed ID encoding' }, { status: 400 });
  }

  try {
    const response = await fetch(decodedUrl, { cache: 'no-store' }); 
    if (!response.ok) {
      // Try to get more detailed error from response body if possible, otherwise use statusText
      let errorBody = '';
      try {
        errorBody = await response.text();
      } catch (parseError) {
        // Ignore if can't parse body
      }
      const errorMessage = errorBody ? errorBody.substring(0, 500) : response.statusText; // Limit error message length
      throw new Error(`Failed to fetch RSS feed: ${response.status} ${errorMessage}`);
    }
    const xmlText = await response.text();
    
    return new NextResponse(xmlText, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'no-store, max-age=0, must-revalidate', // Ensure fresh content
      },
    });
  } catch (error) {
    console.error('Error fetching feed for XML endpoint:', error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: `Failed to retrieve feed XML: ${message}` }, { status: 500 });
  }
}

"use client";

import { useEffect, useState, useCallback } from 'react';
import { processRssFeed, type ProcessRssFeedResult } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import type { FeedCacheData } from '@/types';
import { Loader2, RefreshCw, Download, AlertTriangle, FileText, Info, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface FeedDetailClientProps {
  feedId: string; // This is the encoded URL
}

const FEED_CACHE_PREFIX = 'rss_cache_';
const CACHE_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

export default function FeedDetailClient({ feedId }: FeedDetailClientProps) {
  const [feedData, setFeedData] = useState<FeedCacheData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const decodedUrl = decodeURIComponent(feedId);

  const getCacheKey = useCallback(() => `${FEED_CACHE_PREFIX}${feedId}`, [feedId]);

  const loadData = useCallback(async (forceRefresh = false) => {
    setIsLoading(true);
    setError(null);

    // Try to load from localStorage first
    if (!forceRefresh) {
      try {
        const cachedItem = localStorage.getItem(getCacheKey());
        if (cachedItem) {
          const parsedCache: FeedCacheData = JSON.parse(cachedItem);
          if (Date.now() - parsedCache.timestamp < CACHE_EXPIRY_MS) {
            setFeedData(parsedCache);
            setIsLoading(false);
            return;
          }
          // Cache expired, set it as previous data for AI summary
          setFeedData(parsedCache); // keep showing old data while refreshing
        }
      } catch (e) {
        console.warn("Failed to load or parse cache", e);
        localStorage.removeItem(getCacheKey()); // Clear corrupted cache
      }
    }

    // Fetch new data
    try {
      const previousRssContent = feedData?.rawRss; // Use current feedData as previous if available
      const result = await processRssFeed(decodedUrl, previousRssContent);
      const newFeedCacheData: FeedCacheData = {
        rawRss: result.currentFeed,
        summary: result.summary,
        timestamp: result.timestamp,
        originalUrl: result.originalUrl,
      };
      setFeedData(newFeedCacheData);
      localStorage.setItem(getCacheKey(), JSON.stringify(newFeedCacheData));
      if (forceRefresh) {
        toast({ title: "Success", description: "Feed refreshed and summarized." });
      }
    } catch (e: any) {
      console.error("Error processing feed:", e);
      const errorMessage = e.message || "An unknown error occurred.";
      setError(errorMessage);
      toast({
        title: "Error",
        description: `Failed to process feed: ${errorMessage}`,
        variant: "destructive",
      });
      // If refresh fails, keep old data if available, otherwise clear
      if (!feedData && !localStorage.getItem(getCacheKey())) {
         setFeedData(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, [decodedUrl, getCacheKey, toast, feedData]); // feedData dependency is important for previousRssContent

  useEffect(() => {
    if (decodedUrl) {
      loadData();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decodedUrl]); // Only run on initial decodedUrl availability

  const handleRefresh = () => {
    loadData(true);
  };

  const handleDownloadXml = () => {
    if (!feedData) return;
    const blob = new Blob([feedData.rawRss], { type: 'application/xml;charset=utf-8' });
    const link = document.createElement('a');
    const urlFileName = feedData.originalUrl.substring(feedData.originalUrl.lastIndexOf('/') + 1) || 'feed';
    const safeFileName = urlFileName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    link.href = URL.createObjectURL(blob);
    link.download = `${safeFileName}.xml`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  if (isLoading && !feedData) { // Show full page loader only if no data is present yet
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <Loader2 className="h-16 w-16 animate-spin text-primary mb-4" />
        <p className="text-xl font-semibold font-body">Fetching and summarizing feed...</p>
        <p className="text-muted-foreground font-body">This may take a moment.</p>
      </div>
    );
  }

  if (error && !feedData) { // Show error prominently if no data could be loaded at all
    return (
      <Card className="shadow-lg border-destructive">
        <CardHeader>
          <CardTitle className="flex items-center text-destructive font-headline">
            <AlertTriangle className="mr-2 h-6 w-6" />
            Error Loading Feed
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="font-body">{error}</p>
        </CardContent>
        <CardFooter>
           <Button onClick={handleRefresh} variant="destructive" disabled={isLoading}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Try Again
          </Button>
        </CardFooter>
      </Card>
    );
  }
  
  // If feedData is null after trying (e.g. initial error and no cache), something is wrong.
  // This state should ideally be covered by the error block above if it was an initial load error.
  // If it's null for other reasons, show a simpler message.
  if (!feedData) {
     return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
            <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
            <p className="text-xl font-semibold font-body">Could not load feed data.</p>
            <p className="text-muted-foreground font-body">Please try refreshing or check the URL.</p>
             <Button onClick={handleRefresh} variant="default" className="mt-4" disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Refresh
            </Button>
        </div>
     );
  }


  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="font-headline text-2xl break-all flex items-center">
            <Info className="mr-3 h-7 w-7 text-primary flex-shrink-0" />
            {feedData.originalUrl}
          </CardTitle>
          {feedData.timestamp && (
            <CardDescription className="font-body text-sm flex items-center">
              <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
              Last updated: {formatDistanceToNow(new Date(feedData.timestamp), { addSuffix: true })}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
           <Button onClick={handleRefresh} variant="outline" className="mr-2" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {!isLoading && <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
          <Button onClick={handleDownloadXml} variant="outline" disabled={!feedData.rawRss}>
            <Download className="mr-2 h-4 w-4" />
            Download Cached XML
          </Button>
        </CardContent>
      </Card>

      {error && ( // Display non-critical errors (e.g. refresh failed but old data shown)
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Refresh Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="font-headline flex items-center">
             <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2 h-6 w-6 text-primary"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>
            AI Summary
          </CardTitle>
          <CardDescription className="font-body">
            Key information from the RSS feed, highlighting new or changed items.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && !feedData.summary && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
          {feedData.summary ? (
            <div className="prose prose-sm max-w-none font-body dark:prose-invert" dangerouslySetInnerHTML={{ __html: feedData.summary.replace(/\n/g, '<br />') }} />
          ) : (
            !isLoading && <p className="text-muted-foreground font-body">No summary available.</p>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="font-headline flex items-center">
            <FileText className="mr-2 h-6 w-6 text-primary" />
            Cached RSS Data (XML)
          </CardTitle>
          <CardDescription className="font-body">
            The raw XML content of the cached RSS feed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && !feedData.rawRss && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
          {feedData.rawRss ? (
            <ScrollArea className="h-72 w-full rounded-md border p-4 bg-muted/50">
              <pre className="text-xs font-code whitespace-pre-wrap break-all">{feedData.rawRss}</pre>
            </ScrollArea>
          ) : (
             !isLoading && <p className="text-muted-foreground font-body">No XML data available.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Minimal components for Alert as ShadCN Alert is more for banners
const Alert: React.FC<{variant?: "default" | "destructive", children: React.ReactNode}> = ({variant, children}) => {
  const baseClasses = "relative w-full rounded-lg border p-4";
  const variantClasses = variant === "destructive" ? "border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive" : "bg-background text-foreground";
  return <div role="alert" className={`${baseClasses} ${variantClasses}`}>{children}</div>
}
const AlertTitle: React.FC<{children: React.ReactNode}> = ({children}) => <h5 className="mb-1 font-medium leading-none tracking-tight font-headline">{children}</h5>
const AlertDescription: React.FC<{children: React.ReactNode}> = ({children}) => <div className="text-sm [&_p]:leading-relaxed font-body">{children}</div>

// Minimal ScrollArea for pre tag
const ScrollArea: React.FC<{className?: string, children: React.ReactNode}> = ({className, children}) => {
  return <div className={`relative overflow-auto ${className}`}>{children}</div>
}


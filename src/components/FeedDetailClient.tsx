
"use client";

import { useEffect, useState, useCallback } from 'react';
import { processRssFeed, type ProcessRssFeedResult } from '@/app/actions';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import type { FeedCacheData } from '@/types';
import { Loader2, RefreshCw, Download, AlertTriangle, FileText, Info, Clock, ExternalLink, List, Sparkles } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { cn } from "@/lib/utils";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";


interface FeedDetailClientProps {
  feedId: string; // This can be a single encoded URL or multiple, where '|' in separator might be encoded
}

const FEED_CACHE_PREFIX = 'rss_cache_';
const CACHE_EXPIRY_MS = 60 * 60 * 1000; // 1 hour
const MULTI_FEED_SEPARATOR = '_|||_'; // Must match RssInputClient and new API route

export default function FeedDetailClient({ feedId }: FeedDetailClientProps) {
  const [feedData, setFeedData] = useState<FeedCacheData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const [decodedUrls, setDecodedUrls] = useState<string[]>([]);
  const [isMultiFeed, setIsMultiFeed] = useState(false);

  useEffect(() => {
    if (feedId) {
      const fullyDecodedFeedId = decodeURIComponent(feedId); 

      const urls = fullyDecodedFeedId.includes(MULTI_FEED_SEPARATOR)
        ? fullyDecodedFeedId.split(MULTI_FEED_SEPARATOR) 
        : [fullyDecodedFeedId]; 
      setDecodedUrls(urls);
      setIsMultiFeed(urls.length > 1);
    }
  }, [feedId]);

  const getCacheKey = useCallback(() => {
    if (decodedUrls.length === 0) return null;
    const keyContent = isMultiFeed ? [...decodedUrls].sort().join(',') : decodedUrls[0];
    return `${FEED_CACHE_PREFIX}${encodeURIComponent(keyContent)}`;
  }, [decodedUrls, isMultiFeed]);

  const loadData = useCallback(async (forceRefresh = false) => {
    if (decodedUrls.length === 0) {
        setIsLoading(false);
        return;
    }
    
    setIsLoading(true);
    setError(null);
    const cacheKey = getCacheKey();
    if (!cacheKey) {
        setIsLoading(false);
        return;
    }


    if (!forceRefresh) {
      try {
        const cachedItem = localStorage.getItem(cacheKey);
        if (cachedItem) {
          const parsedCache: FeedCacheData = JSON.parse(cachedItem);
          if (Date.now() - parsedCache.timestamp < CACHE_EXPIRY_MS) {
            setFeedData(parsedCache);
            setIsLoading(false);
            return;
          }
          setFeedData(parsedCache); 
        }
      } catch (e) {
        console.warn("Failed to load or parse cache", e);
        localStorage.removeItem(cacheKey);
      }
    }

    try {
      const previousRssContent = isMultiFeed ? undefined : feedData?.rawRss;
      const result = await processRssFeed(isMultiFeed ? decodedUrls : decodedUrls[0], previousRssContent);
      
      const newFeedCacheData: FeedCacheData = {
        rawRss: result.mergedFeedContent,
        summary: result.summary,
        timestamp: result.timestamp,
        originalUrls: result.originalUrls,
      };
      setFeedData(newFeedCacheData);
      localStorage.setItem(cacheKey, JSON.stringify(newFeedCacheData));
      if (forceRefresh) {
        toast({ title: "Success", description: "Feed(s) refreshed and summarized." });
      }
    } catch (e: any) {
      console.error("Error processing feed(s):", e);
      const errorMessage = e.message || "An unknown error occurred.";
      setError(errorMessage);
      toast({
        title: "Error",
        description: `Failed to process feed(s): ${errorMessage}`,
        variant: "destructive",
      });
      if (!feedData && !localStorage.getItem(cacheKey)) {
         setFeedData(null);
      }
    } finally {
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decodedUrls, getCacheKey, toast, isMultiFeed]);

  useEffect(() => {
    if (decodedUrls.length > 0) {
      loadData();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decodedUrls]); 

  const handleRefresh = () => {
    loadData(true);
  };

  const handleDownloadXml = () => {
    if (!feedData?.rawRss) return;
    const blob = new Blob([feedData.rawRss], { type: 'application/xml;charset=utf-8' });
    const link = document.createElement('a');
    const fileName = isMultiFeed ? 'merged_feeds' : (feedData.originalUrls[0].substring(feedData.originalUrls[0].lastIndexOf('/') + 1) || 'feed');
    const safeFileName = fileName.replace(/[^a-z0-9_.-]/gi, '_').toLowerCase();
    link.href = URL.createObjectURL(blob);
    link.download = `${safeFileName}.xml`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  if (isLoading && !feedData) { 
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
        <Loader2 className="h-16 w-16 animate-spin text-primary mb-4" />
        <p className="text-xl font-semibold font-body">Fetching and summarizing feed(s)...</p>
        <p className="text-muted-foreground font-body">This may take a moment.</p>
      </div>
    );
  }

  if (error && !feedData) { 
    return (
      <Card className="shadow-lg border-destructive">
        <CardHeader>
          <CardTitle className="flex items-center text-destructive font-headline">
            <AlertTriangle className="mr-2 h-6 w-6" />
            Error Loading Feed(s)
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
  
  if (!feedData) {
     return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
            <AlertTriangle className="h-16 w-16 text-destructive mb-4" />
            <p className="text-xl font-semibold font-body">Could not load feed data.</p>
            <p className="text-muted-foreground font-body">Please try refreshing or check the URL(s).</p>
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
          <div className="flex items-center">
            {isMultiFeed ? <List className="mr-3 h-7 w-7 text-primary flex-shrink-0" /> : <Info className="mr-3 h-7 w-7 text-primary flex-shrink-0" /> }
            <CardTitle className="font-headline text-2xl">
              {isMultiFeed ? `${feedData.originalUrls.length} Feed(s) Summary` : <span className="break-all">{feedData.originalUrls[0]}</span>}
            </CardTitle>
          </div>
          {isMultiFeed && feedData.originalUrls.length > 0 && (
             <Accordion type="single" collapsible className="w-full pt-2">
              <AccordionItem value="item-1">
                <AccordionTrigger className="text-sm text-muted-foreground hover:no-underline">View all {feedData.originalUrls.length} source URLs</AccordionTrigger>
                <AccordionContent>
                  <ul className="list-disc pl-5 space-y-1 max-h-48 overflow-y-auto">
                    {feedData.originalUrls.map((url, index) => (
                      <li key={index} className="text-xs break-all">
                        <a href={url} target="_blank" rel="noopener noreferrer" className="hover:underline text-primary">
                          {url}
                        </a>
                      </li>
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}
          {feedData.timestamp && (
            <CardDescription className="font-body text-sm flex items-center pt-1">
              <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
              Last updated: {formatDistanceToNow(new Date(feedData.timestamp), { addSuffix: true })}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-2 sm:space-y-0 sm:flex sm:flex-wrap sm:gap-2 items-center">
           <Button onClick={handleRefresh} variant="outline" disabled={isLoading} className="w-full sm:w-auto">
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {!isLoading && <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
          <Button onClick={handleDownloadXml} variant="outline" disabled={!feedData.rawRss} className="w-full sm:w-auto">
            <Download className="mr-2 h-4 w-4" />
            Download {isMultiFeed ? "Merged XML Source" : "Cached XML"}
          </Button>
          {isMultiFeed && (
            <Link
              href={`/api/merged-feed-xml/${feedId}`}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "w-full sm:w-auto",
                (!feedData.rawRss || isLoading) && "opacity-50 cursor-not-allowed pointer-events-none"
              )}
              aria-disabled={!feedData.rawRss || isLoading}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              View Merged XML
            </Link>
          )}
          {!isMultiFeed && ( 
            <Link
              href={`/api/feed-xml/${feedId}`} 
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "w-full sm:w-auto",
                (!feedData.rawRss || isLoading) && "opacity-50 cursor-not-allowed pointer-events-none"
              )}
              aria-disabled={!feedData.rawRss || isLoading}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              View Raw XML
            </Link>
          )}
        </CardContent>
      </Card>

      {error && ( 
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Refresh Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="font-headline flex items-center">
            <Sparkles className="mr-2 h-6 w-6 text-primary" />
            AI Summary
          </CardTitle>
          <CardDescription className="font-body">
            Key information from the RSS feed(s){isMultiFeed ? "" : ", highlighting new or changed items"}.
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
            Cached {isMultiFeed ? "Merged Source Data (XMLs)" : "RSS Data (XML)"} 
          </CardTitle>
          <CardDescription className="font-body">
            {isMultiFeed 
              ? "The merged raw XML content of the cached RSS feeds."
              : "The raw XML content of the cached RSS feed."
            }
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


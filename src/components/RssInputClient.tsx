
"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { LinkIcon, Loader2, PlusCircle, MinusCircle } from 'lucide-react';

const MAX_FEEDS = 100;
const MULTI_FEED_SEPARATOR = '_|||_';

export default function RssInputClient() {
  const [rssUrls, setRssUrls] = useState<string[]>(['']);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleUrlChange = (index: number, value: string) => {
    const newUrls = [...rssUrls];
    newUrls[index] = value;
    setRssUrls(newUrls);
  };

  const addFeedInput = () => {
    if (rssUrls.length < MAX_FEEDS) {
      setRssUrls([...rssUrls, '']);
    } else {
      toast({
        title: "Limit Reached",
        description: `You can add a maximum of ${MAX_FEEDS} RSS feeds.`,
        variant: "default",
      });
    }
  };

  const removeFeedInput = (index: number) => {
    if (rssUrls.length > 1) {
      const newUrls = rssUrls.filter((_, i) => i !== index);
      setRssUrls(newUrls);
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);

    const validUrls = rssUrls.map(url => url.trim()).filter(url => {
      if (!url) return false;
      try {
        new URL(url);
        return true;
      } catch (_) {
        return false;
      }
    });

    if (validUrls.length === 0) {
      toast({
        title: "Error",
        description: "Please enter at least one valid RSS URL.",
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    if (validUrls.length !== rssUrls.filter(url => url.trim()).length) {
         toast({
            title: "Warning",
            description: "Some invalid URLs were ignored.",
            variant: "default",
         });
    }
    
    let feedId;
    if (validUrls.length === 1) {
      feedId = encodeURIComponent(validUrls[0]);
    } else {
      feedId = validUrls.map(url => encodeURIComponent(url)).join(MULTI_FEED_SEPARATOR);
    }
    
    router.push(`/feed/${feedId}`);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {rssUrls.map((url, index) => (
        <div key={index} className="flex items-center space-x-2">
          <div className="relative flex-grow">
            <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              type="url"
              placeholder="https://www.google.com/alerts/feeds/..."
              value={url}
              onChange={(e) => handleUrlChange(index, e.target.value)}
              className="pl-10 font-body"
              aria-label={`RSS Feed URL ${index + 1}`}
              disabled={isLoading}
            />
          </div>
          {rssUrls.length > 1 && (
            <Button type="button" variant="ghost" size="icon" onClick={() => removeFeedInput(index)} disabled={isLoading} aria-label="Remove feed">
              <MinusCircle className="h-5 w-5 text-destructive" />
            </Button>
          )}
        </div>
      ))}
      <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
        <Button type="button" variant="outline" onClick={addFeedInput} disabled={isLoading || rssUrls.length >= MAX_FEEDS} className="w-full sm:w-auto">
          <PlusCircle className="mr-2 h-4 w-4" />
          Add Feed
        </Button>
        <Button type="submit" className="w-full sm:flex-grow bg-accent hover:bg-accent/90 text-accent-foreground font-body" disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            `Fetch & Summarize ${rssUrls.filter(u => u.trim()).length || 0} Feed(s)`
          )}
        </Button>
      </div>
       {rssUrls.length >= MAX_FEEDS && (
        <p className="text-xs text-muted-foreground text-center">Maximum number of feeds reached ({MAX_FEEDS}).</p>
      )}
    </form>
  );
}

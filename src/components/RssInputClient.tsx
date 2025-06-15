"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { LinkIcon, Loader2 } from 'lucide-react';

export default function RssInputClient() {
  const [rssUrl, setRssUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    if (!rssUrl.trim()) {
      toast({
        title: "Error",
        description: "RSS URL cannot be empty.",
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    try {
      // Basic URL validation
      new URL(rssUrl);
    } catch (_) {
      toast({
        title: "Error",
        description: "Invalid URL format.",
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }
    
    // Encode the URL to be part of the path
    // Using a simpler encoding, btoa might have issues with some characters in URLs for path segments
    const feedId = encodeURIComponent(rssUrl);
    router.push(`/feed/${feedId}`);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="relative">
        <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          type="url"
          placeholder="https://www.google.com/alerts/feeds/..."
          value={rssUrl}
          onChange={(e) => setRssUrl(e.target.value)}
          className="pl-10 font-body"
          aria-label="RSS Feed URL"
          disabled={isLoading}
        />
      </div>
      <Button type="submit" className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-body" disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Processing...
          </>
        ) : (
          "Fetch & Summarize"
        )}
      </Button>
    </form>
  );
}

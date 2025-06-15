import FeedDetailClient from '@/components/FeedDetailClient';
import { Rss } from 'lucide-react';
import Link from 'next/link';

interface FeedPageProps {
  params: {
    feedId: string;
  };
}

export default function FeedPage({ params }: FeedPageProps) {
  const { feedId } = params;

  // It's generally better to decode on the client side if the ID is complex,
  // or ensure it's a safe string for server-side processing.
  // Here, feedId is passed to the client component which will decode it.

  return (
    <div className="flex flex-col min-h-screen">
      <header className="bg-card border-b p-4 shadow-sm">
        <div className="container mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-primary hover:opacity-80 transition-opacity">
            <Rss className="w-8 h-8" />
            <h1 className="text-2xl font-headline font-bold">Alert Caster</h1>
          </Link>
        </div>
      </header>
      <main className="flex-grow container mx-auto p-4 md:p-8">
        <FeedDetailClient feedId={feedId} />
      </main>
      <footer className="py-6 text-center text-sm text-muted-foreground border-t">
        <p>&copy; {new Date().getFullYear()} Alert Caster. All rights reserved.</p>
      </footer>
    </div>
  );
}


import RssInputClient from '@/components/RssInputClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Rss } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <header className="mb-8 text-center">
        <div className="flex items-center justify-center mb-2">
          <Rss className="w-12 h-12 text-primary" />
          <h1 className="text-4xl font-headline font-bold ml-3">Alert Caster</h1>
        </div>
        <p className="text-muted-foreground font-body">
          Enter one or more Google Alerts RSS feed URLs (up to 100) to cache content and get an AI summary.
        </p>
      </header>
      <main className="w-full max-w-lg">
        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle className="font-headline">RSS Feed Input</CardTitle>
            <CardDescription className="font-body">
              Paste your Google Alerts RSS feed link(s) below. Add more feeds using the button.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RssInputClient />
          </CardContent>
        </Card>
      </main>
      <footer className="mt-12 text-center text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} Alert Caster. All rights reserved.</p>
      </footer>
    </div>
  );
}

'use server';
/**
 * @fileOverview Summarizes an RSS feed and highlights new or changed items compared to the previous fetch.
 *
 * - summarizeRssFeed - A function that handles the RSS feed summarization process.
 * - SummarizeRssFeedInput - The input type for the summarizeRssFeed function.
 * - SummarizeRssFeedOutput - The return type for the summarizeRssFeed function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SummarizeRssFeedInputSchema = z.object({
  currentFeed: z.string().describe('The current RSS feed content.'),
  previousFeed: z.string().optional().describe('The previous RSS feed content, if available.'),
});
export type SummarizeRssFeedInput = z.infer<typeof SummarizeRssFeedInputSchema>;

const SummarizeRssFeedOutputSchema = z.object({
  summary: z.string().describe('A summary of the current RSS feed, highlighting new or changed items.'),
});
export type SummarizeRssFeedOutput = z.infer<typeof SummarizeRssFeedOutputSchema>;

export async function summarizeRssFeed(input: SummarizeRssFeedInput): Promise<SummarizeRssFeedOutput> {
  return summarizeRssFeedFlow(input);
}

const prompt = ai.definePrompt({
  name: 'summarizeRssFeedPrompt',
  input: {schema: SummarizeRssFeedInputSchema},
  output: {schema: SummarizeRssFeedOutputSchema},
  prompt: `You are an AI assistant that summarizes RSS feeds, highlighting new or changed items compared to the previous feed.

Current RSS Feed:
{{{currentFeed}}}

{{#if previousFeed}}
Previous RSS Feed:
{{{previousFeed}}}
{{/if}}

Summary:`,
});

const summarizeRssFeedFlow = ai.defineFlow(
  {
    name: 'summarizeRssFeedFlow',
    inputSchema: SummarizeRssFeedInputSchema,
    outputSchema: SummarizeRssFeedOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);

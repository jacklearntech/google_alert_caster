
'use server';
/**
 * @fileOverview Summarizes one or more RSS feeds. If a single feed's previous version is provided, it highlights changes.
 *
 * - summarizeRssFeed - A function that handles the RSS feed summarization process.
 * - SummarizeRssFeedInput - The input type for the summarizeRssFeed function.
 * - SummarizeRssFeedOutput - The return type for the summarizeRssFeed function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SummarizeRssFeedInputSchema = z.object({
  currentFeed: z.string().describe('The current RSS feed content. This might be a single feed or multiple feeds concatenated together.'),
  previousFeed: z.string().optional().describe('The previous RSS feed content, if available (only for single feed comparison).'),
});
export type SummarizeRssFeedInput = z.infer<typeof SummarizeRssFeedInputSchema>;

const SummarizeRssFeedOutputSchema = z.object({
  summary: z.string().describe('A summary of the current RSS feed(s). If a previous version of a single feed was provided, this summary should highlight new or changed items.'),
});
export type SummarizeRssFeedOutput = z.infer<typeof SummarizeRssFeedOutputSchema>;

export async function summarizeRssFeed(input: SummarizeRssFeedInput): Promise<SummarizeRssFeedOutput> {
  return summarizeRssFeedFlow(input);
}

const prompt = ai.definePrompt({
  name: 'summarizeRssFeedPrompt',
  input: {schema: SummarizeRssFeedInputSchema},
  output: {schema: SummarizeRssFeedOutputSchema},
  prompt: `You are an AI assistant that summarizes RSS feed content.
The content provided might be from a single RSS feed or multiple RSS feeds concatenated together.

Current RSS Feed Content:
{{{currentFeed}}}

{{#if previousFeed}}
(This section applies only if content from a single feed is being compared against its previous version)
Previous RSS Feed Content:
{{{previousFeed}}}
When summarizing, please pay special attention to items that are new or have changed compared to this previous version.
{{else}}
Summarize the key information from the provided RSS feed content. If multiple feeds' content is present, provide a cohesive summary covering all of them.
{{/if}}

Provide a concise summary:`,
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


'use server';
/**
 * @fileOverview Analyzes the sentiment of an article's title and content.
 *
 * - analyzeArticleSentiment - A function that performs sentiment analysis.
 * - ArticleSentimentInput - The input type for the analyzeArticleSentiment function.
 * - ArticleSentimentOutput - The return type for the analyzeArticleSentiment function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ArticleSentimentInputSchema = z.object({
  title: z.string().describe('The title of the article.'),
  content: z.string().describe('The plain text content of the article.'),
});
export type ArticleSentimentInput = z.infer<typeof ArticleSentimentInputSchema>;

const ArticleSentimentOutputSchema = z.object({
  sentiment: z.enum(['positive', 'negative', 'neutral']).describe('The analyzed sentiment of the article.'),
});
export type ArticleSentimentOutput = z.infer<typeof ArticleSentimentOutputSchema>;

export async function analyzeArticleSentiment(input: ArticleSentimentInput): Promise<ArticleSentimentOutput> {
  return analyzeArticleSentimentFlow(input);
}

const prompt = ai.definePrompt({
  name: 'analyzeArticleSentimentPrompt',
  input: {schema: ArticleSentimentInputSchema},
  output: {schema: ArticleSentimentOutputSchema},
  prompt: `Analyze the sentiment of the following news article title and content.
Respond with only one word: 'positive', 'negative', or 'neutral' based on the overall tone.

Title: {{{title}}}

Content:
{{{content}}}

Sentiment:`,
  config: {
    temperature: 0.2, // Lower temperature for more deterministic sentiment classification
  }
});

const analyzeArticleSentimentFlow = ai.defineFlow(
  {
    name: 'analyzeArticleSentimentFlow',
    inputSchema: ArticleSentimentInputSchema,
    outputSchema: ArticleSentimentOutputSchema,
  },
  async input => {
    // Ensure content is not excessively long to avoid issues, truncate if necessary
    const maxContentLength = 4000; // Characters
    const truncatedContent = input.content.length > maxContentLength
      ? input.content.substring(0, maxContentLength)
      : input.content;

    try {
        const {output} = await prompt({title: input.title, content: truncatedContent});
        if (output) {
            return output;
        }
        // Fallback or specific error if output is null
        console.warn('Sentiment analysis returned null output for:', input.title);
        return { sentiment: 'neutral' }; // Default to neutral on null output
    } catch (error) {
        console.error('Error in sentiment analysis flow for:', input.title, error);
        return { sentiment: 'neutral' }; // Default to neutral on error
    }
  }
);

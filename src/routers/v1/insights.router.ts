import { OpenAPIHono } from '@hono/zod-openapi';
import type { Server } from 'bun';
import type { Container } from '@/lib/container';
import { createRoute } from '@/lib/openapi';
import { filterDateToUtc } from '@/lib/timezone';
import type { AuthUser } from '@/middleware/auth';
import { ErrorSchema } from '@/schemas';
import {
  GenerateInsightsQuerySchema,
  GenerateInsightsResponseSchema,
  type InsightSummary,
  LatestInsightQuerySchema,
  LatestInsightResponseSchema,
} from '@/schemas/insights.schema';

type InsightsRouterEnv = {
  Variables: {
    user: AuthUser;
    container: Container;
  };
};

/**
 * Insights router - financial advice generation
 */
export const createInsightsRouter = () => {
  const router = new OpenAPIHono<InsightsRouterEnv>();

  const generateInsightsRoute = createRoute({
    method: 'post',
    path: '/generate',
    summary: 'Generate financial insights',
    description:
      'Manually generate AI-powered financial advice based on transactions in the given period. Uses Gemini 2.5 Flash. Saves the result to the database.',
    tags: ['Insights'],
    security: [{ Bearer: [] }],
    request: {
      query: GenerateInsightsQuerySchema,
    },
    responses: {
      201: {
        description: 'Insights generated and saved successfully',
        content: {
          'application/json': {
            schema: GenerateInsightsResponseSchema,
          },
        },
      },
      400: {
        description: 'No transactions in period',
        content: {
          'application/json': {
            schema: ErrorSchema,
          },
        },
      },
      401: {
        description: 'Unauthorized',
        content: {
          'application/json': {
            schema: ErrorSchema,
          },
        },
      },
      500: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: ErrorSchema,
          },
        },
      },
    },
  });

  const getLatestInsightRoute = createRoute({
    method: 'get',
    path: '/latest',
    summary: 'Get latest insights',
    description:
      'Fetch the most recent financial insights for the authenticated user. Supports pagination via limit and offset.',
    tags: ['Insights'],
    security: [{ Bearer: [] }],
    request: {
      query: LatestInsightQuerySchema,
    },
    responses: {
      200: {
        description: 'Latest insights (array). Returns empty array if none found.',
        content: {
          'application/json': {
            schema: LatestInsightResponseSchema,
          },
        },
      },
      401: {
        description: 'Unauthorized',
        content: {
          'application/json': {
            schema: ErrorSchema,
          },
        },
      },
    },
  });

  router.openapi(getLatestInsightRoute, async (c) => {
    const container = c.get('container');
    const user = c.get('user');
    const query = c.req.valid('query');

    const insights = await container.insightsRepo.findLatestForUser(
      user.id,
      query.limit,
      query.offset
    );

    return c.json(
      {
        insights: insights.map((insight) => ({
          id: insight.id,
          periodStart: insight.periodStart.toISOString(),
          periodEnd: insight.periodEnd.toISOString(),
          content: insight.content,
          summary: insight.summary as InsightSummary | null,
          createdAt: insight.createdAt.toISOString(),
        })),
      },
      200
    );
  });

  router.openapi(generateInsightsRoute, async (c) => {
    const server = typeof Bun !== 'undefined' ? (c.env as unknown as Server<unknown>) : undefined;
    if (server) server.timeout(c.req.raw, 60);
    const container = c.get('container');
    const user = c.get('user');
    const query = c.req.valid('query');

    const userRecord = await container.userRepo.findById(user.id);
    const timezone = query.timezone ?? userRecord?.timezone ?? 'Asia/Kathmandu';

    let periodStart: Date | undefined;
    let periodEnd: Date | undefined;

    if (query.startDate && query.endDate) {
      periodStart = filterDateToUtc(query.startDate, timezone);
      periodEnd = filterDateToUtc(query.endDate, timezone);
    }

    try {
      const insight = await container.insightsService.generateInsights(user.id, {
        periodStart,
        periodEnd,
        timezone,
      });

      return c.json(
        {
          insight: {
            id: insight.id,
            periodStart: insight.periodStart.toISOString(),
            periodEnd: insight.periodEnd.toISOString(),
            content: insight.content,
            summary: insight.summary as InsightSummary | null,
            createdAt: insight.createdAt.toISOString(),
          },
        },
        201
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (message.includes('No transactions')) {
        return c.json({ error: 'No transactions in the selected period', message }, 400);
      }
      return c.json({ error: 'Failed to generate insights', message }, 500);
    }
  });

  return router;
};

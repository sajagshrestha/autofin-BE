# OpenAPI/Swagger Setup

This project uses OpenAPI with Zod for type-safe API documentation and type sharing across a monorepo.

## Features

- ✅ **Zod schemas** for runtime validation and type inference
- ✅ **OpenAPI 3.0** specification generation
- ✅ **Swagger UI** for interactive API documentation
- ✅ **Type sharing** - schemas can be imported in frontend/mobile apps

## Accessing Documentation

### Swagger UI (Interactive Docs)
Visit: `http://localhost:3000/docs`

### OpenAPI JSON Spec
Visit: `http://localhost:3000/openapi.json`

## Generating OpenAPI Spec

To generate the OpenAPI spec as a JSON file for sharing:

```bash
bun run openapi:generate
```

This creates `openapi.json` in the project root that can be:
- Shared with frontend/mobile teams
- Used with code generators (openapi-generator, swagger-codegen)
- Imported into API testing tools (Postman, Insomnia)

## Using Schemas in Monorepo

### Backend (This Project)

```typescript
import { UserSchema, CreateUserSchema } from './schemas';

// Use in routes
const user = await UserSchema.parse(data);
```

### Frontend/Mobile Apps

```typescript
// Option 1: Import schemas directly (if in monorepo)
import { UserSchema, CreateUserSchema } from '@backend/schemas';

// Option 2: Generate types from OpenAPI spec
// Use tools like openapi-typescript or swagger-typescript-api
import { User } from './generated/types';
```

## Schema Structure

Schemas are organized by domain:

- `src/schemas/common.schema.ts` - Common types (errors, pagination)
- `src/schemas/user.schema.ts` - User-related schemas
- `src/schemas/gmail-oauth.schema.ts` - Gmail OAuth schemas
- `src/schemas/gmail.schema.ts` - Gmail API schemas

## Adding OpenAPI to Routes

### Example: Using OpenAPIHono

```typescript
import { OpenAPIHono } from '@hono/zod-openapi';
import { createRoute } from '../../lib/openapi';
import { UserSchema, CreateUserSchema } from '../../schemas';

const router = new OpenAPIHono();

const createUserRoute = createRoute({
  method: 'post',
  path: '/users',
  summary: 'Create a new user',
  tags: ['Users'],
  security: [{ Bearer: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: CreateUserSchema,
        },
      },
    },
  },
  responses: {
    200: {
      description: 'User created',
      content: {
        'application/json': {
          schema: UserSchema,
        },
      },
    },
  },
});

router.openapi(createUserRoute, async (c) => {
  const body = c.req.valid('json'); // Validated by Zod!
  // ... handler logic
});
```

## Type Safety Benefits

1. **Runtime Validation**: Zod validates request/response data
2. **Type Inference**: TypeScript types inferred from Zod schemas
3. **API Documentation**: Automatically generated from schemas
4. **Monorepo Sharing**: Same schemas used across backend/frontend/mobile

## Environment Variables

Set `API_BASE_URL` in `.env` to configure the server URL in OpenAPI spec:

```env
API_BASE_URL=https://api.yourdomain.com
```

## Next Steps

1. Migrate existing routes to use OpenAPI decorators (see `user.router.openapi.ts` as example)
2. Generate TypeScript types for frontend: `npx openapi-typescript openapi.json -o frontend/src/types/api.ts`
3. Use generated types in frontend for type-safe API calls

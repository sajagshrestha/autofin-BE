import { Hono } from 'hono'
import { authMiddleware, type AuthUser } from './middleware/auth'

type Env = {
  Variables: {
    user: AuthUser
  }
}

const app = new Hono<Env>()

// Public route
app.get('/', (c) => {
  return c.text('Hello Hono!')
})

// Protected routes - apply auth middleware
app.use('/api/v1/*', authMiddleware)

app.get('/api/v1/profile', (c) => {
  const user = c.get('user')
  return c.json({ user })
})

export default app

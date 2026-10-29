import type { LoginRequest, LoginResponse } from '@/types'
import { body, httpError, type MockRoute } from '../router'
import { DEFAULT_USER_ID } from '../seed/core'
import { db, demoSession, recordAudit, requireUser, saveSession, sessionFor, userActor } from '../store'

export const routes: MockRoute[] = [
  {
    method: 'POST',
    path: '/auth/login',
    public: true,
    handler: (ctx): LoginResponse => {
      const { email, password } = body<LoginRequest>(ctx)
      const fieldErrors = []
      if (!email || !/^\S+@\S+\.\S+$/.test(email)) fieldErrors.push({ field: 'email', message: 'Enter a valid email address.' })
      if (!password) fieldErrors.push({ field: 'password', message: 'Enter your password.' })
      if (fieldErrors.length) throw httpError.validation(fieldErrors)
      // Demo mode accepts any password. A password of "wrong" demonstrates the failure path.
      if (password === 'wrong') {
        throw httpError.unauthorized('Incorrect email or password.')
      }
      const user = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? db.users.find((u) => u.id === DEFAULT_USER_ID)!
      demoSession.userId = user.id
      saveSession()
      const session = sessionFor(user.id)
      session.memberships.forEach((m) =>
        recordAudit({ workspaceId: m.workspace_id, actor: userActor(user), action: 'auth.login', resource: { type: 'session', id: 'web', name: 'Web session' } }),
      )
      return { session, access_token: null }
    },
  },
  {
    method: 'POST',
    path: '/auth/logout',
    // Public and idempotent: signing out without a valid session still succeeds.
    public: true,
    handler: (ctx) => {
      const user = ctx.session?.user
      demoSession.userId = null
      demoSession.roleOverride = null
      saveSession()
      if (user) {
        ctx.session?.memberships.forEach((m) =>
          recordAudit({ workspaceId: m.workspace_id, actor: userActor(user), action: 'auth.logout', resource: { type: 'session', id: 'web', name: 'Web session' } }),
        )
      }
      return { ok: true }
    },
  },
  {
    method: 'GET',
    path: '/auth/me',
    handler: (ctx) => {
      const user = requireUser(ctx)
      return sessionFor(user.id)
    },
  },
]

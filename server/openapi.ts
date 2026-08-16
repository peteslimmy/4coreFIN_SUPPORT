export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: '4CoreFinSupport API',
    version: '1.0.0',
    description:
      'Payment operations support platform — incident tickets, evidence, comments, audit log, major incidents, notifications, config, and admin endpoints. All endpoints under /api require a session cookie (httpOnly, sameSite=lax) obtained via POST /api/auth/login unless marked public. State-changing endpoints also require the double-submit CSRF token (header X-CSRF-Token) issued by the SPA.',
  },
  servers: [{ url: '/api' }],
  security: [{ sessionAuth: [] }],
  tags: [
    { name: 'Auth', description: 'Session management and password flows' },
    { name: 'Tickets', description: 'Incident ticket CRUD, comments, evidence' },
    { name: 'Audit', description: 'Immutable audit log and chain verification' },
    { name: 'Customers', description: 'Customer records' },
    { name: 'Users', description: 'User management (admin)' },
    { name: 'Major Incidents', description: 'Major incident tracking' },
    { name: 'Notifications', description: 'User notifications' },
    { name: 'Config', description: 'Admin configuration, RBAC, form configs' },
    { name: 'Operations', description: 'Bootstrap, SLA, SSE, storage, executive metrics' },
    { name: 'Public', description: 'Unauthenticated endpoints' },
  ],
  paths: {
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Authenticate a user and create a session',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  password: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Login successful — session cookie set' },
          '401': { description: 'Invalid credentials or account locked' },
          '429': { description: 'Too many login attempts' },
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Destroy the current session',
        responses: { '200': { description: 'Session destroyed' } },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Get the current authenticated user',
        responses: {
          '200': { description: 'Current user profile' },
          '401': { description: 'Not authenticated' },
        },
      },
    },
    '/auth/change-password': {
      post: {
        tags: ['Auth'],
        summary: 'Change the authenticated user password (also clears the forced-change flag)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['currentPassword', 'newPassword'],
                properties: {
                  currentPassword: { type: 'string' },
                  newPassword: { type: 'string', minLength: 8 },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Password changed' },
          '401': { description: 'Current password is incorrect' },
        },
      },
    },
    '/auth/verify-password': {
      post: {
        tags: ['Auth'],
        summary: 'Verify the current password against Supabase Auth',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['password'],
                properties: { password: { type: 'string' } },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Password valid' },
        },
      },
    },
    '/auth/forgot-password': {
      post: {
        tags: ['Auth'],
        summary: 'Request a password reset email via Supabase Auth (always returns success)',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email'],
                properties: { email: { type: 'string', format: 'email' } },
              },
            },
          },
        },
        responses: { '200': { description: 'Reset email sent (if account exists)' } },
      },
    },
    '/auth/reset-password': {
      post: {
        tags: ['Auth'],
        summary: 'Set a new password using the Supabase recovery token from the emailed link',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['token', 'newPassword'],
                properties: {
                  token: { type: 'string' },
                  newPassword: { type: 'string', minLength: 8 },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Password reset' },
          '400': { description: 'Invalid or expired reset token' },
        },
      },
    },
    '/tickets': {
      get: {
        tags: ['Tickets'],
        summary: 'List tickets',
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'priority', in: 'query', schema: { type: 'string' } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer' } },
          { name: 'assignedAgentId', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Paginated ticket list' } },
      },
      post: {
        tags: ['Tickets'],
        summary: 'Create a ticket',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  customerName: { type: 'string' },
                  customerEmail: { type: 'string' },
                  customerPhone: { type: 'string' },
                  customerLastName: { type: 'string' },
                  businessUnit: { type: 'string' },
                  partner: { type: 'string' },
                  category: { type: 'string' },
                  priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
                  status: { type: 'string', enum: ['RECEIPT', 'ASSIGNED', 'INVESTIGATE', 'RESOLVED', 'CLOSED'] },
                  amount: { type: 'number' },
                  transactionId: { type: 'string' },
                  cardPan: { type: 'string' },
                  description: { type: 'string' },
                  submittedBy: { type: 'string', enum: ['BU_SUPPORT', 'PARTNER'] },
                  watchers: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Created ticket' },
          '201': { description: 'Created ticket' },
        },
      },
    },
    '/tickets/{id}': {
      get: {
        tags: ['Tickets'],
        summary: 'Get a ticket by id',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Ticket detail' }, '404': { description: 'Not found' } },
      },
      patch: {
        tags: ['Tickets'],
        summary: 'Update a ticket (status, priority, fields, RCA, escalation)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: { type: 'string', enum: ['RECEIPT', 'ASSIGNED', 'INVESTIGATE', 'RESOLVED', 'CLOSED'] },
                  priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
                  assignedAgentId: { type: 'string' },
                  rootCause: { type: 'string' },
                  correctiveAction: { type: 'string' },
                  isEscalated: { type: 'boolean' },
                  watchers: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Updated ticket' }, '404': { description: 'Not found' } },
      },
      delete: {
        tags: ['Tickets'],
        summary: 'Soft-delete a ticket',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Deleted' } },
      },
    },
    '/tickets/{id}/comments': {
      get: {
        tags: ['Tickets'],
        summary: 'List comments for a ticket',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Comment list' } },
      },
    },
    '/tickets/{id}/evidence': {
      get: {
        tags: ['Tickets'],
        summary: 'List evidence attached to a ticket',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Evidence list' } },
      },
    },
    '/tickets/{id}/feedback': {
      patch: {
        tags: ['Tickets'],
        summary: 'Submit customer satisfaction feedback',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  feedbackScore: { type: 'integer', minimum: 1, maximum: 5 },
                  feedbackComment: { type: 'string', maxLength: 500 },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Feedback recorded' } },
      },
    },
    '/comments': {
      post: {
        tags: ['Tickets'],
        summary: 'Add a comment to a ticket',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['ticketId', 'message'],
                properties: {
                  ticketId: { type: 'string' },
                  message: { type: 'string' },
                  isInternal: { type: 'boolean' },
                  parentCommentId: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { '201': { description: 'Comment created' } },
      },
    },
    '/comments/{id}': {
      patch: {
        tags: ['Tickets'],
        summary: 'Edit a comment',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Comment updated' } },
      },
    },
    '/evidence': {
      get: {
        tags: ['Tickets'],
        summary: 'List evidence (optionally filtered by ticketId)',
        parameters: [{ name: 'ticketId', in: 'query', schema: { type: 'string' } }],
        responses: { '200': { description: 'Evidence list' } },
      },
      post: {
        tags: ['Tickets'],
        summary: 'Register evidence metadata',
        responses: { '201': { description: 'Evidence registered' } },
      },
    },
    '/evidence/{id}': {
      delete: {
        tags: ['Tickets'],
        summary: 'Delete evidence',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Evidence deleted' } },
      },
    },
    '/evidence/upload': {
      post: {
        tags: ['Tickets'],
        summary: 'Upload evidence file (multipart)',
        responses: { '201': { description: 'Uploaded' } },
      },
    },
    '/audit-log': {
      get: {
        tags: ['Audit'],
        summary: 'Query the audit log',
        parameters: [
          { name: 'ticketId', in: 'query', schema: { type: 'string' } },
          { name: 'action', in: 'query', schema: { type: 'string' } },
          { name: 'actorId', in: 'query', schema: { type: 'string' } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer' } },
        ],
        responses: { '200': { description: 'Audit log entries' } },
      },
      post: {
        tags: ['Audit'],
        summary: 'Append an audit log entry (manual)',
        responses: { '201': { description: 'Entry appended' } },
      },
    },
    '/audit-log/verify': {
      get: {
        tags: ['Audit'],
        summary: 'Verify the integrity of the audit chain',
        responses: { '200': { description: 'Chain verification report' } },
      },
    },
    '/customers': {
      get: {
        tags: ['Customers'],
        summary: 'List customers',
        responses: { '200': { description: 'Customer list' } },
      },
      post: {
        tags: ['Customers'],
        summary: 'Create a customer',
        responses: { '201': { description: 'Customer created' } },
      },
    },
    '/customers/{id}': {
      patch: {
        tags: ['Customers'],
        summary: 'Update a customer',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Customer updated' } },
      },
      delete: {
        tags: ['Customers'],
        summary: 'Delete a customer',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Customer deleted' } },
      },
    },
    '/users': {
      get: {
        tags: ['Users'],
        summary: 'List users (admin)',
        responses: { '200': { description: 'User list' } },
      },
      post: {
        tags: ['Users'],
        summary: 'Create a user (admin). Sends a welcome email with temporary credentials.',
        responses: { '201': { description: 'User created' } },
      },
    },
    '/users/generate-password': {
      post: {
        tags: ['Users'],
        summary: 'Generate a secure random temporary password (admin)',
        responses: { '200': { description: 'Generated password' } },
      },
    },
    '/users/{id}': {
      patch: {
        tags: ['Users'],
        summary: 'Update a user (admin)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'User updated' } },
      },
      delete: {
        tags: ['Users'],
        summary: 'Delete a user (super admin)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'User deleted' } },
      },
    },
    '/users/{id}/resend-invite': {
      post: {
        tags: ['Users'],
        summary: 'Re-send the welcome email with a rotated temporary password (super admin)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Welcome email re-sent' } },
      },
    },
    '/major-incidents': {
      get: {
        tags: ['Major Incidents'],
        summary: 'List major incidents',
        responses: { '200': { description: 'Major incident list' } },
      },
      post: {
        tags: ['Major Incidents'],
        summary: 'Create a major incident',
        responses: { '201': { description: 'Major incident created' } },
      },
    },
    '/major-incidents/{id}': {
      get: {
        tags: ['Major Incidents'],
        summary: 'Get a major incident by id',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Major incident detail' } },
      },
      patch: {
        tags: ['Major Incidents'],
        summary: 'Update a major incident (timeline, PIR, status)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Major incident updated' } },
      },
    },
    '/notifications': {
      get: {
        tags: ['Notifications'],
        summary: 'List the current user notifications',
        responses: { '200': { description: 'Notification list' } },
      },
      post: {
        tags: ['Notifications'],
        summary: 'Mark all notifications read (empty body) or create a notification',
        responses: { '200': { description: 'Notifications updated' } },
      },
    },
    '/notifications/{id}/read': {
      patch: {
        tags: ['Notifications'],
        summary: 'Mark a single notification as read',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Notification marked read' } },
      },
    },
    '/bootstrap': {
      get: {
        tags: ['Operations'],
        summary: 'Bootstrap data for the SPA (supports ?scope=...)',
        parameters: [
          { name: 'scope', in: 'query', schema: { type: 'array', items: { type: 'string' }, style: 'form', explode: true } },
        ],
        responses: { '200': { description: 'Role-filtered bootstrap payload' } },
      },
    },
    '/sla/run-check': {
      post: {
        tags: ['Operations'],
        summary: 'Trigger a manual SLA check',
        responses: { '200': { description: 'SLA check executed' } },
      },
    },
    '/events': {
      get: {
        tags: ['Operations'],
        summary: 'Server-sent events stream (realtime updates)',
        responses: { '200': { description: 'SSE stream' } },
      },
    },
    '/executive/metrics': {
      get: {
        tags: ['Operations'],
        summary: 'Executive dashboard metrics',
        responses: { '200': { description: 'Metrics payload' } },
      },
    },
    '/storage/upload': {
      post: {
        tags: ['Operations'],
        summary: 'Upload a file to storage (super admin)',
        responses: { '201': { description: 'Uploaded' } },
      },
    },
    '/config/{name}': {
      get: {
        tags: ['Config'],
        summary: 'Get a config value by name',
        parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Config value' } },
      },
      put: {
        tags: ['Config'],
        summary: 'Upsert a config value by name',
        parameters: [{ name: 'name', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Config updated' } },
      },
    },
    '/roles': {
      get: {
        tags: ['Config'],
        summary: 'List roles (admin)',
        responses: { '200': { description: 'Roles list' } },
      },
      put: {
        tags: ['Config'],
        summary: 'Update roles (super admin)',
        responses: { '200': { description: 'Roles updated' } },
      },
    },
    '/rbac/roles': {
      get: {
        tags: ['Config'],
        summary: 'List RBAC role definitions',
        responses: { '200': { description: 'RBAC roles' } },
      },
    },
    '/settings': {
      get: {
        tags: ['Config'],
        summary: 'Get system settings (admin)',
        responses: { '200': { description: 'Settings' } },
      },
      put: {
        tags: ['Config'],
        summary: 'Update system settings (super admin)',
        responses: { '200': { description: 'Settings updated' } },
      },
    },
    '/form-configs': {
      get: {
        tags: ['Config'],
        summary: 'Get form configurations per business unit',
        responses: { '200': { description: 'Form configs' } },
      },
    },
    '/form-configs/{bu}': {
      put: {
        tags: ['Config'],
        summary: 'Upsert a form config for a business unit',
        parameters: [{ name: 'bu', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Form config updated' } },
      },
    },
    '/business-units': {
      get: {
        tags: ['Config'],
        summary: 'List business units',
        responses: { '200': { description: 'Business units' } },
      },
      put: {
        tags: ['Config'],
        summary: 'Update business units',
        responses: { '200': { description: 'Business units updated' } },
      },
    },
    '/partners': {
      get: {
        tags: ['Config'],
        summary: 'List payment partners',
        responses: { '200': { description: 'Payment partners' } },
      },
      put: {
        tags: ['Config'],
        summary: 'Update payment partners',
        responses: { '200': { description: 'Payment partners updated' } },
      },
    },
    '/categories': {
      get: {
        tags: ['Config'],
        summary: 'List categories',
        responses: { '200': { description: 'Categories' } },
      },
      put: {
        tags: ['Config'],
        summary: 'Update categories',
        responses: { '200': { description: 'Categories updated' } },
      },
    },
    '/saved-replies': {
      get: {
        tags: ['Config'],
        summary: 'List saved replies',
        responses: { '200': { description: 'Saved replies' } },
      },
      put: {
        tags: ['Config'],
        summary: 'Update saved replies',
        responses: { '200': { description: 'Saved replies updated' } },
      },
    },
    '/notification-configs': {
      get: {
        tags: ['Config'],
        summary: 'List notification configs',
        responses: { '200': { description: 'Notification configs' } },
      },
      put: {
        tags: ['Config'],
        summary: 'Update notification configs',
        responses: { '200': { description: 'Notification configs updated' } },
      },
    },
    '/profile': {
      get: {
        tags: ['Config'],
        summary: 'Get the current user profile',
        responses: { '200': { description: 'Profile' } },
      },
      put: {
        tags: ['Config'],
        summary: 'Update the current user profile',
        responses: { '200': { description: 'Profile updated' } },
      },
    },
    '/admin/settings': {
      get: {
        tags: ['Config'],
        summary: 'List admin settings',
        responses: { '200': { description: 'Settings list' } },
      },
      put: {
        tags: ['Config'],
        summary: 'Update admin settings',
        responses: { '200': { description: 'Settings updated' } },
      },
    },
    '/public/settings': {
      get: {
        tags: ['Public'],
        summary: 'Public settings for unauthenticated clients',
        security: [],
        responses: { '200': { description: 'Public settings' } },
      },
    },
  },
  components: {
    securitySchemes: {
      sessionAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'session',
        description: 'HttpOnly session cookie set by POST /api/auth/login',
      },
    },
    responses: {
      Unauthorized: {
        description: 'Not authenticated or session expired',
        content: { 'application/json': { schema: { type: 'object', properties: { error: { type: 'string' } } } } },
      },
      Forbidden: {
        description: 'Authenticated but missing required permission',
        content: { 'application/json': { schema: { type: 'object', properties: { error: { type: 'string' } } } } },
      },
      NotFound: {
        description: 'Resource not found',
        content: { 'application/json': { schema: { type: 'object', properties: { error: { type: 'string' } } } } },
      },
    },
  },
} as const;

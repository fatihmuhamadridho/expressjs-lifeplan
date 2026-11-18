import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = '{{baseUrl}}/api/v1';
const json = (value) => JSON.stringify(value, null, 2);
const assertion = (status, capture) =>
  `pm.test('HTTP ${status}', () => pm.response.to.have.status(${status}));\n${capture ?? ''}`;
const item = (name, method, path, options = {}) => {
  const [pathname, search] = path.split('?');
  const query = options.query ?? (search ? `?${search}` : '');
  return {
    name,
    request: {
      method,
      header: options.body ? [{ key: 'Content-Type', value: 'application/json' }] : [],
      ...(options.auth === false ? { auth: { type: 'noauth' } } : {}),
      ...(options.body
        ? { body: { mode: 'raw', raw: json(options.body), options: { raw: { language: 'json' } } } }
        : {}),
      url: {
        raw: `${base}${pathname}${query}`,
        host: ['{{baseUrl}}'],
        path: ['api', 'v1', ...pathname.split('/').filter(Boolean)],
        ...(query
          ? {
              query: query
                .slice(1)
                .split('&')
                .map((part) => {
                  const [key, value] = part.split('=');
                  return { key, value };
                }),
            }
          : {}),
      },
      ...(options.description ? { description: options.description } : {}),
    },
    response: [],
    ...(options.test
      ? { event: [{ listen: 'test', script: { type: 'text/javascript', exec: options.test.split('\n') } }] }
      : {}),
  };
};

const createCapture = (variable) =>
  assertion(201, `if (pm.response.code === 201) pm.environment.set('${variable}', pm.response.json().data.id);`);
const folders = [
  {
    name: 'Authentication and Profile',
    item: [
      item('Register', 'POST', '/auth/register', {
        auth: false,
        body: { name: 'Postman LifePlan User', email: 'lifeplan-{{$guid}}@example.test', password: '{{testPassword}}' },
        test: assertion(
          201,
          "const result = pm.response.json(); pm.environment.set('token', result.token); pm.environment.set('userId', result.data.id); pm.environment.set('email', result.data.email);"
        ),
      }),
      item('Login', 'POST', '/auth/login', {
        auth: false,
        body: { email: '{{email}}', password: '{{testPassword}}' },
        test: assertion(200, "pm.environment.set('token', pm.response.json().token);"),
      }),
      item('Get My Profile', 'GET', '/me', { test: assertion(200) }),
      item('Update My Profile', 'PATCH', '/me', {
        body: { name: 'Updated Postman User', motto: 'Plan with intent.' },
        test: assertion(200),
      }),
      item('Change Password', 'POST', '/me/password', {
        body: { currentPassword: '{{testPassword}}', newPassword: '{{newTestPassword}}' },
        test: assertion(204),
      }),
    ],
  },
  {
    name: 'Vision and Wishlist',
    item: [
      item('Get Life Vision', 'GET', '/vision', { test: assertion(200) }),
      item('Save Life Vision', 'PUT', '/vision', {
        body: {
          title: 'Financial Freedom at 60',
          description: 'Live comfortably, travel with family, stay healthy, and build a meaningful life.',
          targetAge: 60,
          targetYear: 2056,
          style: 'Horizon Line',
        },
        test: assertion(200),
      }),
      item('List Vision Wishlist', 'GET', '/vision/wishlist', { test: assertion(200) }),
      item('Add Vision Wishlist Item', 'POST', '/vision/wishlist', {
        body: { text: 'Travel to Japan with family' },
        test: createCapture('wishlistItemId'),
      }),
      item('Check Vision Wishlist Item', 'PATCH', '/vision/wishlist/{{wishlistItemId}}', {
        body: { checked: true },
        test: assertion(200),
      }),
      item('Rename Vision Wishlist Item', 'PATCH', '/vision/wishlist/{{wishlistItemId}}', {
        body: { text: 'Travel to Japan with family and friends' },
        test: assertion(200),
      }),
      item('Delete Vision Wishlist Item', 'DELETE', '/vision/wishlist/{{wishlistItemId}}', {
        test: assertion(204),
      }),
    ],
  },
  ...[
    {
      resource: 'goals',
      var: 'goalId',
      body: {
        title: 'Postman Test Goal',
        description: 'Created by the Postman workflow',
        progress: 10,
        color: '#14c8a0',
      },
      patch: { progress: 25 },
    },
    {
      resource: 'plans',
      var: 'planId',
      body: {
        name: 'Postman Test Plan',
        goal: 'Postman Test Goal',
        timeline: '2026',
        progress: 0,
        weeks: 1,
        tasks: 0,
        focus: 'Postman smoke test',
        status: 'Not Started',
      },
      patch: { status: 'In Progress', progress: 20 },
    },
    {
      resource: 'weeks',
      var: 'weekId',
      body: { week: 'Postman Test Week', start: '2026-11-16', end: '2026-11-22' },
      patch: { week: 'Updated Postman Test Week' },
    },
    {
      resource: 'tasks',
      var: 'taskId',
      body: {
        title: 'Postman Test Task',
        plan: 'Postman Test Plan',
        due: '2026-12-31',
        priority: 'Medium',
        current: 0,
        target: 10,
        successThreshold: 40,
        week: 'Updated Postman Test Week',
      },
      patch: { current: 5 },
    },
  ].map(({ resource, var: variable, body, patch: changes }) => ({
    name: resource[0].toUpperCase() + resource.slice(1),
    item: [
      item(`List ${resource}`, 'GET', `/${resource}?page={{page}}&limit={{limit}}`, { test: assertion(200) }),
      item(`Create ${resource.slice(0, -1)}`, 'POST', `/${resource}`, { body, test: createCapture(variable) }),
      item(`Get ${resource.slice(0, -1)}`, 'GET', `/${resource}/{{${variable}}}`, { test: assertion(200) }),
      item(`Update ${resource.slice(0, -1)}`, 'PATCH', `/${resource}/{{${variable}}}`, {
        body: changes,
        test: assertion(200),
      }),
    ],
  })),
  {
    name: 'Linked data integrity',
    item: [
      item('Reject deleting Goal while Plan is linked', 'DELETE', '/goals/{{goalId}}', {
        test: assertion(409),
      }),
      item('Rename Goal with linked Plan', 'PATCH', '/goals/{{goalId}}', {
        body: { title: 'Updated Postman Test Goal' },
        test: assertion(200),
      }),
      item('Verify Plan follows Goal rename', 'GET', '/plans/{{planId}}', {
        test: assertion(
          200,
          "pm.test('Plan follows goal rename', () => pm.expect(pm.response.json().data.goal).to.eql('Updated Postman Test Goal'));"
        ),
      }),
      item('Rename Plan with assigned Task', 'PATCH', '/plans/{{planId}}', {
        body: { name: 'Updated Postman Test Plan' },
        test: assertion(200),
      }),
      item('Verify Task follows Plan rename', 'GET', '/tasks/{{taskId}}', {
        test: assertion(
          200,
          "pm.test('Task follows plan rename', () => pm.expect(pm.response.json().data.plan).to.eql('Updated Postman Test Plan'));"
        ),
      }),
      item('Verify Plan milestone follows rename', 'GET', '/goals/{{goalId}}/milestones', {
        test: assertion(
          200,
          "pm.test('Milestone follows plan rename', () => pm.expect(pm.response.json().data.some((item) => item.title === 'Updated Postman Test Plan')).to.be.true);"
        ),
      }),
    ],
  },
  {
    name: 'Milestones',
    item: [
      item('List Goal Milestones', 'GET', '/goals/{{goalId}}/milestones', { test: assertion(200) }),
      item('Create Goal Milestone', 'POST', '/goals/{{goalId}}/milestones', {
        body: {
          title: 'Postman Test Milestone',
          timeline: '2026',
          progress: 0,
          startDate: '2026-11-16',
          endDate: '2026-12-31',
        },
        test: createCapture('milestoneId'),
      }),
      item('Update Goal Milestone', 'PATCH', '/goals/{{goalId}}/milestones/{{milestoneId}}', {
        body: { progress: 50 },
        test: assertion(200),
      }),
    ],
  },
  {
    name: 'Reports',
    item: [
      item('Get Overview Report', 'GET', '/reports/overview', { test: assertion(200) }),
      item('Get Weekly Report', 'GET', '/reports/weekly?year={{year}}', { test: assertion(200) }),
    ],
  },
  {
    name: 'Validation and Authorization',
    item: [
      item('Protected route without a token', 'GET', '/tasks', {
        auth: false,
        test: assertion(401),
      }),
      item('Reject invalid task priority', 'POST', '/tasks', {
        body: {
          title: 'Invalid Postman Task',
          plan: 'Postman Test Plan',
          priority: 'Urgent',
          current: 0,
          target: 1,
          successThreshold: 100,
        },
        test: assertion(400),
      }),
    ],
  },
  {
    name: 'Cleanup',
    item: [
      item('Delete Goal Milestone', 'DELETE', '/goals/{{goalId}}/milestones/{{milestoneId}}', { test: assertion(204) }),
      item('Delete Week', 'DELETE', '/weeks/{{weekId}}', { test: assertion(204) }),
      item('Verify week deletion unassigns task', 'GET', '/tasks/{{taskId}}', {
        test: assertion(
          200,
          "pm.test('Task no longer references the deleted week', () => pm.expect(pm.response.json().data.week).to.be.oneOf([null, undefined]));"
        ),
      }),
      item('Delete Plan', 'DELETE', '/plans/{{planId}}', { test: assertion(204) }),
      item('Verify plan deletion unassigns task', 'GET', '/tasks/{{taskId}}', {
        test: assertion(
          200,
          "pm.test('Task no longer references the deleted plan', () => pm.expect(pm.response.json().data.plan).to.eql(''));"
        ),
      }),
      item('Delete Task', 'DELETE', '/tasks/{{taskId}}', { test: assertion(204) }),
      item('Reject deleting unarchived Goal', 'DELETE', '/goals/{{goalId}}', { test: assertion(409) }),
      item('Archive Goal', 'PATCH', '/goals/{{goalId}}', { body: { archived: true }, test: assertion(200) }),
      item('List archived Goals', 'GET', '/goals?archived=true', {
        test: assertion(
          200,
          "pm.test('Archived Goal appears in archived results', () => pm.expect(pm.response.json().data.some((item) => item.id === pm.environment.get('goalId'))).to.be.true);"
        ),
      }),
      item('Delete Goal', 'DELETE', '/goals/{{goalId}}', { test: assertion(204) }),
    ],
  },
];

const collection = {
  info: {
    _postman_id: 'd83a7c88-bb4c-44bb-91cb-d8a8d5b554bc',
    name: 'LifePlan API',
    description:
      'Authenticated LifePlan API. Start with Register to save a bearer token, then run resource requests. Resource IDs are captured automatically from create responses.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}', type: 'string' }] },
  item: folders,
  variable: [
    { key: 'baseUrl', value: 'http://localhost:4000', type: 'string' },
    { key: 'token', value: '', type: 'string' },
    { key: 'testPassword', value: 'LifePlan-Postman-2026!', type: 'string' },
    { key: 'newTestPassword', value: 'LifePlan-Postman-2027!', type: 'string' },
    { key: 'email', value: '', type: 'string' },
    { key: 'userId', value: '', type: 'string' },
    { key: 'goalId', value: '', type: 'string' },
    { key: 'planId', value: '', type: 'string' },
    { key: 'weekId', value: '', type: 'string' },
    { key: 'taskId', value: '', type: 'string' },
    { key: 'milestoneId', value: '', type: 'string' },
    { key: 'wishlistItemId', value: '', type: 'string' },
    { key: 'page', value: '1', type: 'string' },
    { key: 'limit', value: '50', type: 'string' },
    { key: 'year', value: String(new Date().getFullYear()), type: 'string' },
  ],
};

await writeFile(
  resolve(dirname(fileURLToPath(import.meta.url)), 'LifePlan API.postman_collection.json'),
  `${JSON.stringify(collection, null, 2)}\n`
);

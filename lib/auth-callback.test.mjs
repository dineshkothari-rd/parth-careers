import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { Module } from 'node:module';
import ts from 'typescript';
import { createHash } from 'node:crypto';
import { createBrowserClient, createServerClient } from '@supabase/ssr';
import { safeInternalPath } from './site-url.ts';
let calls;
let exchangeError = false;
let exchangeClient;
let exchangeOptions;
const route = new Module(import.meta.filename);
route.require = (name) => {
  if (name === '@/lib/site-url') return { getSiteUrl: () => 'https://jobpilot.test', safeInternalPath };
  if (name === 'next/server') return { NextResponse: { redirect: (url) => Response.redirect(url) } };
  if (name === '@/lib/supabase/server') return { createClient: async () => exchangeClient ?? ({
    auth: { exchangeCodeForSession: async (code, options) => { calls.push(code); exchangeOptions = options; return { data: { user: exchangeError ? null : { id: 'owner' } }, error: exchangeError ? Error('expired') : null }; } },
    from(table) { calls.push(table); const query = { select() { return query; }, eq() { return query; }, maybeSingle: async () => ({ data: table === 'profiles' ? { full_name: 'Candidate', target_role: 'Engineer', current_company: 'Company', location: 'City' } : { preferred_roles: ['Engineer'] } }) }; return query; },
  }) };
  throw Error(name);
};
route._compile(ts.transpileModule(readFileSync(new URL('../app/auth/callback/route.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, import.meta.filename);
const get = (query) => route.exports.GET(new Request('https://jobpilot.test/auth/callback?' + query));
test('password recovery exchanges the code and bypasses onboarding redirects', async () => {
  calls = []; exchangeError = false;
  const response = await get('code=valid&next=%2Fauth%2Fupdate-password');
  assert.equal(response.headers.get('location'), 'https://jobpilot.test/auth/update-password');
  assert.deepEqual(calls, ['valid']);
});
test('normal confirmation preserves internal destinations and rejects external/auth destinations', async () => {
  for (const [next, expected] of [['/jobs', '/jobs'], ['//evil.example', '/dashboard'], ['/auth/callback', '/dashboard']]) {
    calls = []; exchangeError = false;
    const response = await get('code=valid&next=' + encodeURIComponent(next));
    assert.equal(response.headers.get('location'), 'https://jobpilot.test' + expected);
    assert.deepEqual(calls, ['valid', 'profiles', 'job_preferences']);
  }
});
test('expired and missing confirmation codes do not reach password update', async () => {
  calls = []; exchangeError = true;
  const original = console.error; console.error = () => {};
  try {
    for (const query of ['code=expired&next=%2Fauth%2Fupdate-password', 'next=%2Fauth%2Fupdate-password']) {
      assert.match((await get(query)).headers.get('location'), /\/auth\/login\?error=oauth_callback_failed$/);
    }
  } finally { console.error = original; exchangeError = false; }
});

test('callback forwards the exact flow selector; legacy callbacks remain supported', async () => {
  for (const flowId of [null, 'flow_A_123456', 'flow_B_123456', '', 'invalid/flow']) {
    calls = []; exchangeError = false; exchangeOptions = undefined;
    await get('code=valid&next=%2Fauth%2Fupdate-password' + (flowId === null ? '' : '&sb_flow_id=' + encodeURIComponent(flowId)));
    assert.deepEqual(exchangeOptions, flowId === null ? undefined : { flowId });
  }
});

test('real cookie-based SDK preserves overlapping login verifiers and fails closed on unknown flows', async () => {
  const jar = new Map();
  const cookies = {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    setAll: values => values.forEach(({ name, value, options }) => {
      if (options?.maxAge === 0) jar.delete(name); else jar.set(name, value);
    }),
  };
  const challenges = new Map();
  let tokenRequests = 0;
  const fetch = async (url, options) => {
    assert.equal(new URL(url).pathname, '/auth/v1/token');
    tokenRequests++;
    const body = JSON.parse(options.body);
    const matches = createHash('sha256').update(body.code_verifier).digest('base64url') === challenges.get(body.auth_code);
    if (!matches) return Response.json({ error: 'invalid_grant', error_description: 'code challenge does not match previously saved code verifier' }, { status: 400 });
    const payload = Buffer.from(JSON.stringify({ sub: 'fixture-user', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
    return Response.json({ access_token: 'eyJhbGciOiJIUzI1NiJ9.' + payload + '.synthetic', refresh_token: 'synthetic-refresh', expires_in: 3600, token_type: 'bearer', user: { id: 'fixture-user', aud: 'authenticated' } });
  };
  const factory = new Module(import.meta.filename);
  factory.require = name => {
    assert.equal(name, '@supabase/ssr');
    return { createBrowserClient: (_url, _key, options) => createBrowserClient('https://auth.fixture.test', 'synthetic-key', {
      ...options, isSingleton: false, cookies, global: { fetch },
      auth: { ...options?.auth, autoRefreshToken: false, detectSessionInUrl: false },
    }) };
  };
  factory._compile(ts.transpileModule(readFileSync(new URL('./supabase/client.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, import.meta.filename);
  const browser = factory.exports.createClient();
  const originalError = console.error;
  try {
    const flows = [];
    for (const code of ['flow-code-A', 'flow-code-B']) {
      const result = await browser.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: 'https://jobpilot.test/auth/callback?next=%2Fauth%2Fupdate-password', skipBrowserRedirect: true } });
      assert.equal(result.error, null);
      const authorize = new URL(result.data.url);
      const callback = new URL(authorize.searchParams.get('redirect_to'));
      assert.equal(callback.searchParams.get('sb_flow_id'), result.data.flowId);
      challenges.set(code, authorize.searchParams.get('code_challenge'));
      flows.push({ code, flowId: result.data.flowId });
    }
    exchangeClient = createServerClient('https://auth.fixture.test', 'synthetic-key', { cookies, global: { fetch } });
    console.error = () => {};
    for (const flowId of ['unknown_flow_123456', 'invalid/flow', '']) {
      const response = await get('code=flow-code-A&next=%2Fauth%2Fupdate-password&sb_flow_id=' + encodeURIComponent(flowId));
      assert.match(response.headers.get('location'), /error=oauth_callback_failed$/);
    }
    assert.equal(tokenRequests, 0, 'unknown selectors must not consume a code using another verifier');
    for (const { code, flowId } of flows) {
      const response = await get('code=' + code + '&next=%2Fauth%2Fupdate-password&sb_flow_id=' + flowId);
      assert.equal(response.headers.get('location'), 'https://jobpilot.test/auth/update-password');
    }
    assert.equal(tokenRequests, 2);
  } finally {
    console.error = originalError;
    exchangeClient = undefined;
    browser.auth.stopAutoRefresh();
  }
});

test('legacy hosts move to Careers before session reads or starting OAuth; old auth credentials are discarded', async () => {
  let sessionReads = 0;
  const middleware = new Module(import.meta.filename);
  middleware.require = name => {
    if (name === '@/lib/site-url') return { safeInternalPath };
    if (name === 'next/server') return { NextResponse: { next: () => new Response(null), redirect: (url, status = 307) => Response.redirect(url, status) } };
    if (name === '@supabase/ssr') return { createServerClient: () => ({ auth: { getUser: async () => { sessionReads++; return { data: { user: null } }; } } }) };
    throw Error(name);
  };
  middleware._compile(ts.transpileModule(readFileSync(new URL('../proxy.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, import.meta.filename);
  const request = (host, path) => { const url = new URL('https://' + host + path); url.clone = () => new URL(url); return { method: 'GET', nextUrl: url, cookies: { getAll: () => [] } }; };
  for (const host of ['jobpilot-murex.vercel.app', 'jobpilot-dineshkothari-rds-projects.vercel.app', 'jobpilot-git-main-dineshkothari-rds-projects.vercel.app']) {
    for (const [path, expected] of [
      ['/', 'https://parth-careers.vercel.app/#'],
      ['/#access_token=synthetic-old-token', 'https://parth-careers.vercel.app/#'],
      ['/jobs?search=engineer', 'https://parth-careers.vercel.app/jobs?search=engineer#'],
      ['//evil.example/phish', 'https://parth-careers.vercel.app//evil.example/phish#'],
      ['/auth/login?next=%2Frecruiter', 'https://parth-careers.vercel.app/auth/login?next=%2Frecruiter#'],
      ['/auth/callback?code=old-code&sb_flow_id=old-flow&next=%2Fjobs', 'https://parth-careers.vercel.app/auth/login?next=%2Fjobs#'],
      ['/auth/login?next=https%3A%2F%2Fevil.example&error=old-error', 'https://parth-careers.vercel.app/auth/login#'],
      ['/?code=old-code', 'https://parth-careers.vercel.app/auth/login#'],
    ]) {
      const response = await middleware.exports.proxy(request(host, path));
      assert.equal(response.status, 307);
      assert.equal(response.headers.get('location'), expected);
    }
  }
  assert.equal(sessionReads, 0, 'old host must redirect before reading or modifying auth cookies');
  for (const host of ['parth-careers.vercel.app', 'feature-preview.vercel.app']) {
    assert.equal((await middleware.exports.proxy(request(host, '/auth/login'))).status, 200);
  }
  assert.equal(sessionReads, 2);
});

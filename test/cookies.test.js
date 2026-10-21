import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCookieInput } from '../src/cookies.js';

test('parseCookieInput parses Cookie-Editor JSON array correctly', () => {
  const jsonInput = [
    {
      name: '__Secure-1PSID',
      value: 'secure_val_123',
      domain: '.google.com',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'no_restriction',
      expirationDate: 1795000000,
    },
    {
      name: 'SID',
      value: 'sid_val_456',
      domain: 'flow.google.com',
      path: '/',
      secure: false,
      sameSite: 'lax',
    },
  ];

  const result = parseCookieInput(jsonInput);
  assert.equal(result.length, 2);
  assert.equal(result[0].name, '__Secure-1PSID');
  assert.equal(result[0].value, 'secure_val_123');
  assert.equal(result[0].sameSite, 'None'); // mapped from no_restriction
  assert.equal(result[0].expires, 1795000000);

  assert.equal(result[1].name, 'SID');
  assert.equal(result[1].domain, 'flow.google.com');
  assert.equal(result[1].sameSite, 'Lax');
});

test('parseCookieInput parses raw header string', () => {
  const headerStr = '__Secure-1PSID=val1; SID=val2; HSID=val3';
  const result = parseCookieInput(headerStr);
  assert.equal(result.length, 3);
  assert.equal(result[0].name, '__Secure-1PSID');
  assert.equal(result[0].value, 'val1');
  assert.equal(result[1].name, 'SID');
  assert.equal(result[1].value, 'val2');
});

test('parseCookieInput parses stringified JSON string', () => {
  const str = JSON.stringify([{ name: 'foo', value: 'bar' }]);
  const result = parseCookieInput(str);
  assert.equal(result.length, 1);
  assert.equal(result[0].name, 'foo');
  assert.equal(result[0].value, 'bar');
});

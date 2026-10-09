import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNumber, formatNumber, NumberError, roundSig } from '../js/core/numbers.js';

test('Zahlen lesen: Komma, Punkt, Exponent', () => {
  assert.equal(parseNumber('0,1'), 0.1);
  assert.equal(parseNumber('0.1'), 0.1);
  assert.equal(parseNumber('1e-3'), 0.001);
  assert.equal(parseNumber('1E3'), 1000);
  assert.equal(parseNumber('−5'), -5);
  assert.ok(Math.abs(parseNumber('2,4·10^-8') - 2.4e-8) < 1e-20);
  assert.ok(Math.abs(parseNumber('2,4·10⁻⁸') - 2.4e-8) < 1e-20);
  assert.ok(Math.abs(parseNumber('2.4×10^-8') - 2.4e-8) < 1e-20);
  assert.ok(Math.abs(parseNumber('10^-3') - 1e-3) < 1e-15);
  assert.equal(parseNumber('1.000,5'), 1000.5);
  assert.equal(parseNumber('1,000.5'), 1000.5);
  assert.equal(parseNumber('1.000.000'), 1000000);
  assert.equal(parseNumber('1 000'), 1000);
});

test('ungültige Zahlen werfen NumberError', () => {
  for (const s of ['', 'abc', '1,2,3', '--5', 'e5']) assert.throws(() => parseNumber(s), NumberError, s);
});

test('Formatierung mit signifikanten Stellen', () => {
  assert.equal(formatNumber(12.0769, 3), '12,1');
  assert.equal(formatNumber(12.0769, 4), '12,08');
  assert.equal(formatNumber(100, 4), '100');
  assert.equal(formatNumber(0.025, 4), '0,025');
  assert.equal(formatNumber(2.41505e-8, 2), '2,4·10⁻⁸');
  assert.equal(formatNumber(2.41505e-8, 4), '2,415·10⁻⁸');
  assert.equal(formatNumber(1234567, 3), '1,23·10⁶');
  assert.equal(formatNumber(9.9996, 4), '10');
  assert.equal(formatNumber(-0.5, 3), '-0,5');
  assert.equal(formatNumber(0, 3), '0');
  assert.equal(formatNumber(2.41505e-8, 3, { ascii: true }), '2,42e-8');
  assert.equal(formatNumber(100, 4, { trim: false }), '100,0');
  assert.equal(roundSig(98.0718, 4), 98.07);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateBankAccountPayload } = require('../src/data/settingsData');

test('requires bank name, account holder and account number', () => {
  assert.throws(() => validateBankAccountPayload({}), /Bank name is required/);
  assert.throws(() => validateBankAccountPayload({ bankName: 'Test Bank' }), /Account holder name is required/);
  assert.throws(() => validateBankAccountPayload({ bankName: 'Test Bank', accountHolderName: 'Jane Doe' }), /Account number is required/);
});

test('accepts valid bank account data and validates file type', () => {
  const validPayload = {
    bankName: 'Test Bank',
    accountHolderName: 'Jane Doe',
    accountNumber: '12345678',
    accountType: 'Savings',
    bankStatement: { name: 'statement.pdf', mimeType: 'application/pdf' }
  };

  assert.doesNotThrow(() => validateBankAccountPayload(validPayload));

  assert.throws(
    () => validateBankAccountPayload({ ...validPayload, bankStatement: { name: 'statement.exe', mimeType: 'application/x-msdownload' } }),
    /Bank statement must be a PDF, JPG, JPEG, or PNG file/
  );
});

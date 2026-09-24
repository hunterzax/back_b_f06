//----- #TC_LocalLogin_001..006
import { test, expect } from '@playwright/test';
import { Sel } from './helpers/selectors';

test.beforeEach(async ({ page }) => {
    await page.goto(`${process.env.WEBS}/en/signin`);
    // await pageXOffset.click(Sel.login.btnLocal);
    await expect(page.locator('body')).toContainText('LOG IN FOR EXTERNAL');
    await page.getByText('Local Login').click();
});

test('TC_LocalLogin_001 First login -> T&C -> Main Menu', async ({ page }) => {
    // await page.getByRole('textbox', { name: 'Email or User ID' }).click();
    await page.getByRole('textbox', { name: 'Email or User ID' }).fill('devk@gmail.com');
    await page.getByRole('textbox', { name: 'Password' }).click();
    await page.getByRole('textbox', { name: 'Password' }).fill('12345');
    //await page.getByRole('textbox', { name: 'Enter the characters' }).click();
    //await page.getByRole('textbox', { name: 'Enter the characters' }).fill('RHXHH');
    //await page.getByRole('button', { name: 'Login' }).click();
});

test('TC_LocalLogin_002 Valid login → Main Menu', async ({ page }) => {
  if (!process.env.TEST_EMAIL || !process.env.TEST_PASS) {
    throw new Error('Environment variables TEST_EMAIL and TEST_PASS must be set');
  }
  await page.fill(Sel.login.username, process.env.TEST_EMAIL);
  await page.fill(Sel.login.password, process.env.TEST_PASS);
  await page.fill(Sel.login.captchaInput, 'ABCD');
  await page.click(Sel.login.btnSubmit);
  await expect(page.locator(Sel.main.menuDashboard)).toBeVisible();
});

test('TC_LocalLogin_003 Empty fields validation', async ({ page }) => {
  await page.fill(Sel.login.captchaInput, 'ABCD');
  await page.click(Sel.login.btnSubmit);
  await expect(page.locator(Sel.login.err)).toContainText(/required/i);
});

test('TC_LocalLogin_004 Valid username + Invalid password', async ({ page }) => {
  await page.fill(Sel.login.username, process.env.TEST_EMAIL!);
  await page.fill(Sel.login.password, 'InvalidPassword!');
  await page.fill(Sel.login.captchaInput, 'ABCD');
  await page.click(Sel.login.btnSubmit);
  await expect(page.locator(Sel.login.err)).toContainText(/invalid username or password/i);
});

test('TC_LocalLogin_005 Invalid username + Valid password', async ({ page }) => {
  await page.fill(Sel.login.username, 'invaliduser@example.com');
  await page.fill(Sel.login.password, process.env.TEST_PASS!);
  await page.fill(Sel.login.captchaInput, 'ABCD');
  await page.click(Sel.login.btnSubmit);
  await expect(page.locator(Sel.login.err)).toContainText(/invalid username or password/i);
});

test('TC_LocalLogin_006 Invalid username + Invalid password', async ({ page }) => {
  await page.fill(Sel.login.username, 'invaliduser@example.com');
  await page.fill(Sel.login.password, 'InvalidPassword!');
  await page.fill(Sel.login.captchaInput, 'ABCD');
  await page.click(Sel.login.btnSubmit);
  await expect(page.locator(Sel.login.err)).toContainText(/invalid username or password/i);
});
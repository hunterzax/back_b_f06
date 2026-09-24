import {test ,expect} from '@playwright/test';
import { Sel } from './helpers/selectors';

test.beforeEach(async ({ page }) => {
    await page.goto(`${process.env.WEBS}/en/signin`);
    // await pageXOffset.click(Sel.login.btnLocal);
    await expect(page.locator('body')).toContainText('LOG IN FOR EXTERNAL');
    await page.getByText('Local Login').click();
});

test('TC_LocalLogin_001 First Open', async ({ page }) => {
    await page.goto(`${process.env.WEBS}/en/signin`);
    // await pageXOffset.click(Sel.login.btnLocal);
    await expect(page.locator('body')).toContainText('LOG IN FOR EXTERNAL');
    await page.getByText('Local Login').click();
    await page.getByRole('textbox', { name: 'Email or User ID' }).click();
    await page.getByRole('textbox', { name: 'Email or User ID' }).fill('devk@gmail.com');
    await page.getByRole('textbox', { name: 'Password' }).click();
    await page.getByRole('textbox', { name: 'Password' }).fill('12345');
    await page.getByRole('textbox', { name: 'Enter the characters' }).click();
    await page.getByRole('textbox', { name: 'Enter the characters' }).fill('RHXHH');
    await page.getByRole('button', { name: 'Login' }).click();
});

test('เรียกดูหน้าล็อกอิน', async ({ page }) => {
    await page.goto(`${process.env.WEBS}/en/signin`);
    // await pageXOffset.click(Sel.login.btnLocal);
    await expect(page.locator('body')).toContainText('LOG IN FOR EXTERNAL');
    await page.getByText('Local Login').click();
});
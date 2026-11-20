import { expect, type Page } from '@playwright/test';

export const MOCK = 'http://127.0.0.1:5199';
export const PASSWORD = 'mat-khau-123';

export const uniqueEmail = (tag: string) =>
  `${tag}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}@example.com`;

export async function control(path: string, body: unknown = {}) {
  const res = await fetch(`${MOCK}/__control/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  expect(res.ok).toBe(true);
}

export async function signUp(page: Page, email: string, name: string, password = PASSWORD) {
  await page.goto('/dang-ky');
  await page.getByTestId('signup-name').fill(name);
  await page.getByTestId('signup-email').fill(email);
  await page.getByTestId('signup-password').fill(password);
  await page.getByTestId('signup-submit').click();
}

export async function signOut(page: Page) {
  await page.getByTestId('signout').click();
  await expect(page).toHaveURL(/\/dang-nhap/);
}

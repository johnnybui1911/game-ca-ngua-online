import { expect, test } from '@playwright/test';
import { PASSWORD, signOut, signUp, uniqueEmail } from './auth-helpers';

test('sign up, keep session on reload, sign out, sign in again', async ({ page }) => {
  const email = uniqueEmail('an');
  await signUp(page, email, 'Bạn An');
  await expect(page).toHaveURL('/');
  await expect(page.getByTestId('greeting')).toHaveText('Xin chào, Bạn An');

  await page.reload();
  await expect(page.getByTestId('greeting')).toHaveText('Xin chào, Bạn An');

  await signOut(page);
  await page.reload();
  await expect(page).toHaveURL(/\/dang-nhap/);
  await page.goto('/');
  await expect(page).toHaveURL(/\/bat-dau\?returnTo=%2F$/);
  await page.goto('/dang-nhap');

  await page.getByTestId('signin-email').fill(email.toUpperCase());
  await page.getByTestId('signin-password').fill(PASSWORD);
  await page.getByTestId('signin-submit').click();
  await expect(page).toHaveURL('/');
  await expect(page.getByTestId('greeting')).toHaveText('Xin chào, Bạn An');
});

test('wrong password and unknown email give the same generic error', async ({ page }) => {
  const email = uniqueEmail('binh');
  await signUp(page, email, 'Bạn Bình');
  await signOut(page);

  await page.getByTestId('signin-email').fill(email);
  await page.getByTestId('signin-password').fill('sai-mat-khau-1');
  await page.getByTestId('signin-submit').click();
  const wrong = await page.getByTestId('signin-error').textContent();
  expect(wrong).toBe('Email hoặc mật khẩu không đúng.');

  await page.getByTestId('signin-email').fill(uniqueEmail('khong-co'));
  await page.getByTestId('signin-submit').click();
  await expect(page.getByTestId('signin-error')).toHaveText(wrong ?? '');
  await expect(page).toHaveURL(/\/dang-nhap/);
});

test('duplicate email is rejected', async ({ page }) => {
  const email = uniqueEmail('trung');
  await signUp(page, email, 'Người Một');
  await signOut(page);

  await signUp(page, email, 'Người Hai');
  await expect(page.getByTestId('signup-error')).toHaveText('Email này đã được đăng ký.');
  await expect(page).toHaveURL(/\/dang-ky/);
});

test('sign-up form validates fields before sending', async ({ page }) => {
  await signUp(page, 'khong-phai-email', 'A', 'ngan');
  await expect(page.getByTestId('signup-name-error')).toBeVisible();
  await expect(page.getByTestId('signup-email-error')).toBeVisible();
  await expect(page.getByTestId('signup-password-error')).toBeVisible();
});

test('returnTo: a signed-out visit comes back after sign-in and after sign-up', async ({ page }) => {
  await page.goto('/r/ABC234');
  await expect(page).toHaveURL(/\/bat-dau\?returnTo=%2Fr%2FABC234/);
  await page.getByTestId('to-signin').click();
  await expect(page).toHaveURL(/\/dang-nhap\?returnTo=%2Fr%2FABC234/);
  await page.getByTestId('to-signup').click();
  await expect(page).toHaveURL(/\/dang-ky\?returnTo=%2Fr%2FABC234/);

  const email = uniqueEmail('rt');
  await page.getByTestId('signup-name').fill('Bạn Về');
  await page.getByTestId('signup-email').fill(email);
  await page.getByTestId('signup-password').fill(PASSWORD);
  await page.getByTestId('signup-submit').click();
  await expect(page).toHaveURL('/r/ABC234');

  await page.evaluate(() => fetch('/api/auth/signout', { method: 'POST' }));
  await page.goto('/dang-nhap?returnTo=%2Fr%2FABC234');
  await page.getByTestId('signin-email').fill(email);
  await page.getByTestId('signin-password').fill(PASSWORD);
  await page.getByTestId('signin-submit').click();
  await expect(page).toHaveURL('/r/ABC234');
});

test('cross-site state-changing requests are rejected', async ({ request }) => {
  const res = await request.post('/api/auth/signin', {
    headers: { Origin: 'https://evil.example' },
    data: { email: 'a@example.com', password: 'whatever12' },
  });
  expect(res.status()).toBe(403);
});

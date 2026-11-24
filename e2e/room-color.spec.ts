import { expect, test, type Page } from '@playwright/test';
import type { RoomClientMessage, RoomServerMessage } from '../shared/protocol';
import { createRoom, newPlayer, openRawSocket, rawLog, rawSend } from './helpers/rooms';

/** The first error the server sends after `msg`. */
async function errorAfter(page: Page, msg: RoomClientMessage) {
  const before = (await rawLog(page)).length;
  await rawSend(page, msg);
  let found: Extract<RoomServerMessage, { t: 'error' }> | undefined;
  await expect
    .poll(async () => {
      found = (await rawLog(page)).slice(before).find((m) => m.t === 'error');
      return found !== undefined;
    }, { timeout: 5000 })
    .toBe(true);
  return found;
}

test('the host changes colour in the waiting room, the guest sees it and cannot take a held colour', async ({ browser }) => {
  const host = await newPlayer(browser, 'Chủ Đổi Màu');
  const guest = await newPlayer(browser, 'Khách Đổi Màu');
  const code = await createRoom(host, { seats: 4 });
  await host.page.goto(`/r/${code}`);
  await guest.page.goto(`/r/${code}`);
  await expect(host.page.getByTestId('seat-1-name')).toContainText('Khách Đổi Màu');
  await host.page.getByTestId('add-cpu-2').click();
  await expect(guest.page.getByTestId('seat-2-name')).toContainText('Máy');

  // Everyone holds a colour: the host's own is checked, the guest's and the CPU's are unavailable to the host.
  await expect(host.page.getByTestId('color-0')).toHaveAttribute('aria-checked', 'true');
  await expect(host.page.getByTestId('color-1')).toBeDisabled();
  await expect(host.page.getByTestId('color-2')).toBeDisabled();
  await expect(host.page.getByTestId('color-3')).toBeEnabled();
  await expect(guest.page.getByTestId('color-2')).toBeDisabled();

  await host.page.getByTestId('color-3').click();
  await expect(host.page.getByTestId('color-3')).toHaveAttribute('aria-checked', 'true');
  await expect(host.page.getByTestId('seat-0-name')).toHaveText('Chỗ trống');
  await expect(guest.page.getByTestId('seat-3-name')).toContainText('Chủ Đổi Màu');
  // The host is still the host: crown, start button, and the freed colour is open to the guest.
  await expect(host.page.getByTestId('seat-3-state')).toContainText('Chủ phòng');
  await expect(host.page.getByTestId('start-button')).toBeEnabled();
  await expect(guest.page.getByTestId('color-0')).toBeEnabled();
  await expect(guest.page.getByTestId('color-3')).toBeDisabled();

  // A guest asking for held colours is refused by the server, even without the button.
  const raw = await openRawSocket(guest, code);
  expect(await errorAfter(raw, { t: 'color', color: 3 })).toMatchObject({ code: 'color_taken' });
  expect(await errorAfter(raw, { t: 'color', color: 2 })).toMatchObject({ code: 'color_taken' });
  await expect(guest.page.getByTestId('seat-1-name')).toContainText('Khách Đổi Màu');

  // The guest can take the freed one.
  await guest.page.getByTestId('color-0').click();
  await expect(host.page.getByTestId('seat-0-name')).toContainText('Khách Đổi Màu');
  await expect(host.page.getByTestId('color-1')).toBeEnabled();
  await host.context.close();
  await guest.context.close();
});

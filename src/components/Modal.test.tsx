import { StrictMode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from './ui';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
  };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('ignores the queued close event from StrictMode cleanup after the dialog reopens', async () => {
  const onClose = vi.fn();
  render(
    <StrictMode>
      <Modal title="Register patient" onClose={onClose}>
        <input aria-label="Patient name" />
      </Modal>
    </StrictMode>,
  );
  const dialog = screen.getByRole('dialog') as HTMLDialogElement;
  expect(dialog.open).toBe(true);
  // Native close() queues a close event. StrictMode has already reopened the same element.
  fireEvent(dialog, new Event('close'));
  expect(onClose).not.toHaveBeenCalled();
  await userEvent.type(screen.getByLabelText('Patient name'), 'Typing still works');
  expect((screen.getByLabelText('Patient name') as HTMLInputElement).value).toBe(
    'Typing still works',
  );
});
it('notifies the parent for an actual closed dialog', () => {
  const onClose = vi.fn();
  render(
    <Modal title="Payment" onClose={onClose}>
      <input aria-label="Amount" />
    </Modal>,
  );
  const dialog = screen.getByRole('dialog') as HTMLDialogElement;
  dialog.close();
  fireEvent(dialog, new Event('close'));
  expect(onClose).toHaveBeenCalledOnce();
});

// Tests for the shared "Delete X?" dialog.
//
// There is no host component to render here: the dialog is only ever created
// by `MatDialog.open()`, so the tests do exactly that. Material renders the
// dialog into an overlay attached to <body>, which is why elements are looked
// up on `document`. `afterClosed()` is an Observable that emits once, after
// the close animation; `firstValueFrom` turns it into an awaitable Promise.
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { ConfirmDelete } from './confirm-delete';

async function open(name = 'Amina Okafor'): Promise<MatDialogRef<ConfirmDelete, boolean>> {
  // Same options the list pages pass.
  const ref = TestBed.inject(MatDialog).open<ConfirmDelete, unknown, boolean>(ConfirmDelete, {
    data: { name },
    autoFocus: 'first-tabbable',
  });
  await TestBed.inject(ApplicationRef).whenStable();
  return ref;
}

function container(): HTMLElement {
  const element = document.querySelector<HTMLElement>('mat-dialog-container');
  if (!element) throw new Error('Dialog not open');
  return element;
}

function button(label: string): HTMLButtonElement {
  const match = [...container().querySelectorAll('button')].find(
    (node) => node.textContent?.trim() === label,
  );
  if (!match) throw new Error(`Missing ${label} button`);
  return match;
}

describe('ConfirmDelete', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ConfirmDelete] }).compileComponents();
  });

  it('names the item, labels the dialog by its title, and focuses Cancel', async () => {
    const ref = await open('Maya Chen');
    const dialog = container();
    const title = dialog.querySelector('h2')!;

    expect(title.textContent?.trim()).toBe('Delete Maya Chen?');
    expect(dialog.textContent).toContain('This action cannot be undone.');
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-labelledby')).toBe(title.id);
    // The safe choice must receive initial focus, so Enter by reflex cannot
    // delete. `document.activeElement` cannot be asserted here: jsdom has no
    // layout, so the CDK's focusability check (which needs the button to have
    // a size) fails and Material falls back to focusing the container. Assert
    // the mechanism instead: Cancel carries `cdkFocusInitial` and comes first.
    const buttons = [...dialog.querySelectorAll('button')];
    expect(buttons.map((node) => node.textContent?.trim())).toEqual(['Cancel', 'Delete']);
    expect(button('Cancel').hasAttribute('cdkFocusInitial')).toBe(true);
    expect(button('Delete').hasAttribute('cdkFocusInitial')).toBe(false);

    ref.close();
    await firstValueFrom(ref.afterClosed());
  });

  it('resolves true when Delete is clicked', async () => {
    const ref = await open();
    const result = firstValueFrom(ref.afterClosed());

    button('Delete').click();

    expect(await result).toBe(true);
    expect(document.querySelector('mat-dialog-container')).toBeNull();
  });

  it('resolves a falsy result when Cancel is clicked', async () => {
    const ref = await open();
    const result = firstValueFrom(ref.afterClosed());

    button('Cancel').click();

    // A bare `mat-dialog-close` attribute closes with an empty string, which
    // is what callers rely on: they only ever check for a truthy `true`.
    expect(await result).toBeFalsy();
    expect(document.querySelector('mat-dialog-container')).toBeNull();
  });

  it('resolves undefined when dismissed with Escape', async () => {
    const ref = await open();
    const result = firstValueFrom(ref.afterClosed());

    // Material's Escape handling still reads the legacy `keyCode`, so set both.
    container().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }),
    );

    expect(await result).toBeUndefined();
  });
});

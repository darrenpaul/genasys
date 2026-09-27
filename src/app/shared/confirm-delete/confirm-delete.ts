import { Component, inject } from '@angular/core';
import {
  MAT_DIALOG_DATA,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
  MatDialogActions,
} from '@angular/material/dialog';
import { MatButton } from '@angular/material/button';

/** What callers pass as `data` when opening the dialog. */
export interface ConfirmDeleteData {
  /** Shown in the title: "Delete <name>?" */
  name: string;
}

// The "Delete X?" modal, shared by the customers and quotes list pages. It is
// opened programmatically:
//
//   this.dialog
//     .open(ConfirmDelete, { data: { name: 'Amina Okafor' } })
//     .afterClosed()
//     .subscribe((confirmed) => { if (confirmed) ... });
//
// so it is never placed in a template and has no `<app-confirm-delete>` usage
// anywhere. `afterClosed()` resolves with `true` for Delete, and with a falsy
// value otherwise: an empty string for Cancel, `undefined` for Escape or a
// backdrop click. Callers should test for `true`, never for `undefined`.
//
// Coming from Vue: the closest analogue is a dialog component you mount via a
// `useDialog()` composable. Instead of props, data arrives through DI (see
// `MAT_DIALOG_DATA` below), and instead of emitting `close`, the buttons carry
// the result back to whoever called `open()`.
@Component({
  selector: 'app-confirm-delete',
  // Standalone components list every directive/component the template uses,
  // much like the `components:` option in a Vue SFC. Only the Material dialog
  // pieces this template touches are imported.
  imports: [MatDialogClose, MatDialogContent, MatDialogTitle, MatDialogActions, MatButton],
  templateUrl: './confirm-delete.html',
})
export class ConfirmDelete {
  // `MAT_DIALOG_DATA` is an injection token: a key Material registers when it
  // opens the dialog, holding whatever was passed as `data`. The generic tells
  // TypeScript the shape. `protected` keeps it out of the public API while
  // still letting the template read it.
  protected readonly data = inject<ConfirmDeleteData>(MAT_DIALOG_DATA);
}

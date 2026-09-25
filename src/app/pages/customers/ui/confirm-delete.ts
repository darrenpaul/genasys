import { Component, inject } from '@angular/core';
import {
  MAT_DIALOG_DATA,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
  MatDialogActions,
} from '@angular/material/dialog';
import { MatButton } from '@angular/material/button';

// The body of the "Delete X?" modal. It is opened programmatically from the
// list page with `MatDialog.open(ConfirmDelete, { data: { name } })`, so it is
// never placed in a template and has no `<app-confirm-delete>` usage anywhere.
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
  // Inline template, preferred for small components.
  template: `
    <h2 mat-dialog-title>Delete {{ data.name }}?</h2>
    <mat-dialog-content>This action cannot be undone.</mat-dialog-content>
    <mat-dialog-actions align="end">
      <!--
        mat-dialog-close with no value closes the dialog with undefined.
        cdkFocusInitial puts keyboard focus on Cancel when the dialog opens,
        so pressing Enter by reflex never deletes anything.
      -->
      <button mat-button mat-dialog-close cdkFocusInitial>Cancel</button>
      <!-- [mat-dialog-close]="true" closes and resolves afterClosed() with true. -->
      <button mat-button [mat-dialog-close]="true">Delete</button>
    </mat-dialog-actions>
  `,
})
export class ConfirmDelete {
  // `MAT_DIALOG_DATA` is an injection token: a key Material registers when it
  // opens the dialog, holding whatever was passed as `data`. The generic tells
  // TypeScript the shape. `protected` keeps it out of the public API while
  // still letting the template read it.
  protected readonly data = inject<{ name: string }>(MAT_DIALOG_DATA);
}

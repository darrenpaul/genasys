import { Service, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

@Service()
export class NotificationService {
  private readonly snackBar = inject(MatSnackBar);

  announce(message: string): void {
    this.snackBar.open(message, 'Dismiss');
  }
}

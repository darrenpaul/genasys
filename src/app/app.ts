import { Component } from '@angular/core';
import { AppShell } from '@app/shell/app-shell';

@Component({
  imports: [AppShell],
  selector: 'app-root',
  templateUrl: './app.html',
})
export class App {}

import { Component, ElementRef, ViewEncapsulation, input, viewChild } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { Params, RouterLink } from '@angular/router';

@Component({
  selector: 'app-page-toolbar',
  encapsulation: ViewEncapsulation.None,
  imports: [MatButton, MatIcon, RouterLink],
  templateUrl: './page-toolbar.html',
  styleUrl: './page-toolbar.css',
})
export class PageToolbar {
  readonly title = input.required<string>();
  readonly action = input<{ label: string; link: string; queryParams?: Params } | null>(null);

  private readonly heading = viewChild.required<ElementRef<HTMLHeadingElement>>('heading');

  focusHeading(): void {
    this.heading().nativeElement.focus();
  }
}

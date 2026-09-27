import { Component, signal, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Params, provideRouter } from '@angular/router';
import { PageToolbar } from './page-toolbar';

@Component({
  imports: [PageToolbar],
  template: `
    <app-page-toolbar [title]="title()" [action]="action()">
      @if (showCustomAction()) {
        <button type="button">Save</button>
      }
    </app-page-toolbar>
  `,
})
class TestHost {
  readonly toolbar = viewChild.required(PageToolbar);
  readonly title = signal('Quotes');
  readonly action = signal<{ label: string; link: string; queryParams?: Params } | null>(null);
  readonly showCustomAction = signal(false);
}

describe('PageToolbar', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHost],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('renders required focusable heading without optional actions', () => {
    const fixture = TestBed.createComponent(TestHost);
    fixture.detectChanges();
    const toolbar = (fixture.nativeElement as HTMLElement).querySelector('app-page-toolbar')!;
    const content = toolbar.querySelector('.toolbar-content')!;
    const heading = content.querySelector('h1')!;

    expect([...content.children]).toEqual([heading]);
    expect(heading.textContent).toBe('Quotes');
    expect(heading.tabIndex).toBe(-1);
    fixture.componentInstance.toolbar().focusHeading();
    expect(document.activeElement).toBe(heading);
    fixture.componentInstance.title.set('Customers');
    fixture.detectChanges();
    expect(heading.textContent).toBe('Customers');
    expect(getComputedStyle(toolbar).position).toBe('sticky');
    expect(getComputedStyle(content).display).toBe('flex');
  });

  it('renders optional Add link with query params and projected actions', () => {
    const fixture = TestBed.createComponent(TestHost);
    fixture.componentInstance.action.set({
      label: 'Add quote',
      link: '/quotes/new',
      queryParams: { customerId: 'c1', status: 'approved' },
    });
    fixture.componentInstance.showCustomAction.set(true);
    fixture.detectChanges();
    const content = (fixture.nativeElement as HTMLElement).querySelector('.toolbar-content')!;
    const link = content.querySelector<HTMLAnchorElement>('a')!;
    const save = content.querySelector('button')!;

    expect([...content.children]).toEqual([content.querySelector('h1'), link, save]);
    expect(link.getAttribute('href')).toBe('/quotes/new?customerId=c1&status=approved');
    expect(link.textContent).toContain('Add quote');
    expect(link.querySelector('mat-icon[aria-hidden="true"]')?.textContent).toBe('add');
    expect(getComputedStyle(link).getPropertyValue('--mat-button-filled-container-color')).toBe(
      '#007f7e',
    );
    expect(save.textContent).toBe('Save');

    fixture.componentInstance.action.set({ label: 'Add quote', link: '/quotes/new' });
    fixture.detectChanges();
    expect(link.getAttribute('href')).toBe('/quotes/new');
  });
});

import { DOCUMENT } from '@angular/common';
import { Component, ViewEncapsulation, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { loadBrandFont } from '../../shared/brand-font';

/**
 * Shared layout for every signed-out page (sign in, create account, reset password, invitations):
 * the form on the left, a brand panel on the right. Styles are global and prefixed `au-` so the
 * projected forms can use them.
 */
@Component({
  selector: 'px-auth-shell',
  imports: [RouterLink],
  encapsulation: ViewEncapsulation.None,
  templateUrl: './auth-shell.html',
  styleUrl: './auth-shell.scss',
})
export class AuthShell {
  readonly title = input.required<string>();
  readonly subtitle = input('');
  readonly year = new Date().getFullYear();

  constructor() {
    loadBrandFont(inject(DOCUMENT));
  }
}

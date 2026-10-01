import { Component, input } from '@angular/core';
import { initials } from '../utils/format';

@Component({
  selector: 'px-avatar',
  template: `<span class="av" [style.width.px]="size()" [style.height.px]="size()" [style.font-size.px]="size() * 0.4"
    [style.background]="color()" [title]="name()">{{ ini() }}</span>`,
  styles: `.av { display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; color: #fff; font-weight: 650; flex: none; border: 2px solid #fff; }`,
})
export class Avatar {
  name = input<string>('');
  size = input(26);
  ini = () => initials(this.name());
  color = () => {
    let h = 0; for (const c of this.name()) h = (h * 31 + c.charCodeAt(0)) % 360;
    return `hsl(${h} 45% 45%)`;
  };
}

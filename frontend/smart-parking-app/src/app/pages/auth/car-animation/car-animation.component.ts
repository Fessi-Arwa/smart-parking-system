import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-car-animation',
  templateUrl: './car-animation.component.html',
  styleUrls: ['./car-animation.component.scss'],
  standalone: false,
})
export class CarAnimationComponent {
  @Input() run = false;
  @Input() elementId?: string;
  @Input() durationMs = 4200;
}

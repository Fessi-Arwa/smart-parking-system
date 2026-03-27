import { AfterViewInit, Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-signin-intro',
  templateUrl: './signin-intro.component.html',
  styleUrls: ['./signin-intro.component.scss'],
  standalone: false,
})
export class SigninIntroComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly introSeenKey = 'signin_intro_seen';
  private animationFrame: number | null = null;

  constructor(private authService: AuthService, private router: Router) {}

  ngOnInit(): void {
    if (this.authService.isAuthenticated()) {
      this.router.navigate(['/dashboard']);
      return;
    }

    localStorage.setItem(this.introSeenKey, 'true');
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.startAnimation(), 100);
  }

  private startAnimation(): void {
    const revealLayer = document.getElementById('revealLayer');
    const carZipper = document.getElementById('carZipper');

    if (!revealLayer || !carZipper) {
      this.router.navigate(['/pages/auth/signin/form']);
      return;
    }

    revealLayer.style.width = '100%';
    carZipper.style.opacity = '1';
    const startX = window.innerWidth;
    const endX = -200;
    const duration = 3000;
    const startTime = performance.now();

    carZipper.style.transform = `translateX(${startX}px) translateY(-50%)`;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      const currentX = startX + (endX - startX) * easeProgress;

      carZipper.style.transform = `translateX(${currentX}px) translateY(-50%)`;

      const windowWidth = window.innerWidth;
      const carRightEdge = currentX + 140;
      let coverPercent = (carRightEdge / windowWidth) * 100;
      coverPercent = Math.min(Math.max(coverPercent, 0), 100);
      revealLayer.style.width = `${coverPercent}%`;

      if (progress < 1) {
        this.animationFrame = requestAnimationFrame(animate);
      } else {
        revealLayer.style.width = '0%';
        carZipper.style.opacity = '0';
        if (this.animationFrame) {
          cancelAnimationFrame(this.animationFrame);
          this.animationFrame = null;
        }
        this.router.navigate(['/pages/auth/signin/form']);
      }
    };

    this.animationFrame = requestAnimationFrame(animate);
  }

  ngOnDestroy(): void {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
  }
}

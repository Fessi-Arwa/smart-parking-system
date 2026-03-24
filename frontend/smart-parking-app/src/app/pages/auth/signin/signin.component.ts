import { Component, OnInit, Renderer2, ElementRef, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-signin',
  templateUrl: './signin.component.html',
  styleUrls: ['./signin.component.scss'],
  standalone: false,
})
export class SigninComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('revealLayer') revealLayer!: ElementRef;
  @ViewChild('carZipper') carZipper!: ElementRef;
  @ViewChild('trail') trail!: ElementRef;
  @ViewChild('leftContent') leftContent!: ElementRef;
  @ViewChild('rightContent') rightContent!: ElementRef;

  signinForm: FormGroup;
  isLoading = false;
  private animationStarted = false;
  private animationFrame: number | null = null;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private toastService: ToastService,
    private renderer: Renderer2
  ) {
    this.signinForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  ngOnInit() {
    if (this.authService.isAuthenticated()) {
      this.router.navigate(['/dashboard']);
    }
  }

  ngAfterViewInit() {
    setTimeout(() => {
      this.startZipperEffect();
    }, 300);
  }

  private updateReveal(carX: number) {
    const windowWidth = window.innerWidth;
    const carRightEdge = carX + 140;
    let revealPercent = (carRightEdge / windowWidth) * 100;
    revealPercent = Math.min(Math.max(revealPercent, 0), 100);

    this.renderer.setStyle(
      this.revealLayer.nativeElement,
      'clipPath',
      `inset(0 ${100 - revealPercent}% 0 0)`
    );

    if (this.trail) {
      this.renderer.setStyle(this.trail.nativeElement, 'left', `${carX + 100}px`);
      this.renderer.setStyle(this.trail.nativeElement, 'width', '80px');
    }

    // Révéler le contenu progressivement
    if (revealPercent > 55 && !this.leftContent.nativeElement.classList.contains('revealed')) {
      this.renderer.addClass(this.leftContent.nativeElement, 'revealed');
      this.renderer.addClass(this.rightContent.nativeElement, 'revealed');
      this.createSparkEffect();
    }
  }

  private createSparkEffect() {
    const carRect = this.carZipper.nativeElement.getBoundingClientRect();
    for (let i = 0; i < 30; i++) {
      const spark = this.renderer.createElement('div');
      this.renderer.setStyle(spark, 'position', 'fixed');
      this.renderer.setStyle(spark, 'width', '6px');
      this.renderer.setStyle(spark, 'height', '6px');
      this.renderer.setStyle(spark, 'backgroundColor', `hsl(${Math.random() * 60 + 30}, 100%, 60%)`);
      this.renderer.setStyle(spark, 'borderRadius', '50%');
      this.renderer.setStyle(spark, 'left', `${carRect.left + Math.random() * 100}px`);
      this.renderer.setStyle(spark, 'top', `${carRect.top + Math.random() * 60}px`);
      this.renderer.setStyle(spark, 'pointerEvents', 'none');
      this.renderer.setStyle(spark, 'zIndex', '2000');
      this.renderer.setStyle(spark, 'animation', `sparkle ${Math.random() * 0.6 + 0.3}s ease-out forwards`);
      this.renderer.appendChild(document.body, spark);
      setTimeout(() => this.renderer.removeChild(document.body, spark), 600);
    }
  }

  private animateCar() {
    const startTime = performance.now();
    const duration = 4000;
    const startX = window.innerWidth;
    const endX = -200;

    const step = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      let progress = Math.min(elapsed / duration, 1);
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      const currentX = startX + (endX - startX) * easeProgress;

      this.renderer.setStyle(this.carZipper.nativeElement, 'transform', `translateX(${currentX}px) translateY(-50%)`);
      this.renderer.setStyle(this.carZipper.nativeElement, 'top', '50%');

      this.updateReveal(currentX);

      if (progress < 1) {
        this.animationFrame = requestAnimationFrame(step);
      } else {
        // Fin de l'animation : révéler complètement et faire disparaître la voiture
        this.cancelAnimation();
        this.renderer.setStyle(this.revealLayer.nativeElement, 'clipPath', 'inset(0 0 0 0)');
        this.renderer.setStyle(this.carZipper.nativeElement, 'opacity', '0');
        if (this.trail) {
          this.renderer.setStyle(this.trail.nativeElement, 'opacity', '0');
        }
        // S'assurer que le contenu est visible
        if (!this.leftContent.nativeElement.classList.contains('revealed')) {
          this.renderer.addClass(this.leftContent.nativeElement, 'revealed');
          this.renderer.addClass(this.rightContent.nativeElement, 'revealed');
        }
      }
    };

    this.animationFrame = requestAnimationFrame(step);
  }

  private cancelAnimation() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  private startZipperEffect() {
    if (this.animationStarted) return;
    this.animationStarted = true;

    this.renderer.setStyle(this.carZipper.nativeElement, 'transform', `translateX(${window.innerWidth}px) translateY(-50%)`);
    this.renderer.setStyle(this.carZipper.nativeElement, 'top', '50%');
    this.renderer.setStyle(this.carZipper.nativeElement, 'opacity', '1');

    setTimeout(() => {
      this.animateCar();
    }, 100);
  }

  async onSubmit() {
    if (this.signinForm.valid) {
      this.isLoading = true;
      try {
        const { email, password } = this.signinForm.value;
        await this.authService.signin(email, password).toPromise();
        this.toastService.show('Connexion réussie ! Bienvenue sur PARKINI 🚗', 'success');
        this.router.navigate(['/dashboard']);
      } catch (error: any) {
        this.toastService.show(error.error?.error || 'Erreur de connexion', 'error');
      } finally {
        this.isLoading = false;
      }
    }
  }

  goToSignup() {
    this.router.navigate(['/pages/auth/signup']);
  }

  ngOnDestroy() {
    this.cancelAnimation();
  }
}
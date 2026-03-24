import { Component, OnInit, Renderer2, ElementRef, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { AbstractControl, FormBuilder, FormGroup, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../services/auth';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-signup',
  templateUrl: './signup.component.html',
  styleUrls: ['./signup.component.scss'],
  standalone: false,
})
export class SignupComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('revealLayer') revealLayer!: ElementRef;
  @ViewChild('carZipper') carZipper!: ElementRef;
  @ViewChild('trail') trail!: ElementRef;
  @ViewChild('leftContent') leftContent!: ElementRef;
  @ViewChild('rightContent') rightContent!: ElementRef;

  signupForm: FormGroup;
  isLoading = false;
  private animationStarted = false;
  private animationCompleted = false;
  private animationFrame: number | null = null;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private toastService: ToastService,
    private renderer: Renderer2
  ) {
    this.signupForm = this.fb.group(
      {
        username: ['', [Validators.required, Validators.minLength(3)]],
        email: ['', [Validators.required, Validators.email]],
        password: ['', [Validators.required, Validators.minLength(6)]],
        confirmPassword: ['', [Validators.required]],
      },
      { validators: this.passwordMatchValidator }
    );
  }

  passwordMatchValidator(g: AbstractControl): ValidationErrors | null {
    return g.get('password')?.value === g.get('confirmPassword')?.value ? null : { mismatch: true };
  }

  ngOnInit() {
    if (this.authService.isAuthenticated()) {
      this.router.navigate(['/dashboard']);
    }
  }

  ngAfterViewInit() {
    if (!this.animationCompleted) {
      setTimeout(() => {
        this.startZipperEffect();
      }, 300);
    } else {
      this.renderer.addClass(this.leftContent.nativeElement, 'revealed');
      this.renderer.addClass(this.rightContent.nativeElement, 'revealed');
      this.renderer.setStyle(this.revealLayer.nativeElement, 'clipPath', 'inset(0 0 0 0)');
      this.renderer.setStyle(this.carZipper.nativeElement, 'opacity', '0');
    }
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
        this.cancelAnimation();
        this.renderer.setStyle(this.revealLayer.nativeElement, 'clipPath', 'inset(0 0 0 0)');
        this.renderer.setStyle(this.carZipper.nativeElement, 'opacity', '0');
        if (this.trail) {
          this.renderer.setStyle(this.trail.nativeElement, 'opacity', '0');
        }
        this.animationCompleted = true;
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

  async onSubmit(): Promise<void> {
    if (this.signupForm.invalid) {
      this.signupForm.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    try {
      const { username, email, password } = this.signupForm.value;
      await firstValueFrom(this.authService.signup(username, email, password));
      this.toastService.show('Inscription réussie ! Bienvenue sur PARKINI 🚗', 'success');
      await this.router.navigate(['/dashboard']);
    } catch (error: any) {
      this.toastService.show(error.error?.error || "Erreur d'inscription", 'error');
    } finally {
      this.isLoading = false;
    }
  }

  goToSignin(): void {
    this.router.navigate(['/pages/auth/signin']);
  }

  ngOnDestroy() {
    this.cancelAnimation();
  }
}
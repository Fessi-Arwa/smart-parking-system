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
  @ViewChild('leftContent') leftContent!: ElementRef;
  @ViewChild('rightContent') rightContent!: ElementRef;

  signupForm: FormGroup;
  isLoading = false;
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
      this.router.navigate(['/owner/dashboard']);
    }
  }

  ngAfterViewInit() {
    setTimeout(() => {
      this.startAnimation();
    }, 500);
  }

  private startAnimation() {
    this.renderer.setStyle(this.carZipper.nativeElement, 'transform', `translateX(${window.innerWidth}px) translateY(-50%)`);
    this.renderer.setStyle(this.carZipper.nativeElement, 'top', '50%');
    this.renderer.setStyle(this.carZipper.nativeElement, 'opacity', '1');

    const startTime = performance.now();
    const duration = 4000;
    const startX = window.innerWidth;
    const endX = -200;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      let progress = Math.min(elapsed / duration, 1);
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      const currentX = startX + (endX - startX) * easeProgress;

      this.renderer.setStyle(this.carZipper.nativeElement, 'transform', `translateX(${currentX}px) translateY(-50%)`);

      const windowWidth = window.innerWidth;
      const carRightEdge = currentX + 140;
      let revealPercent = (carRightEdge / windowWidth) * 100;
      revealPercent = Math.min(Math.max(revealPercent, 0), 100);

      this.renderer.setStyle(
        this.revealLayer.nativeElement,
        'clipPath',
        `inset(0 ${100 - revealPercent}% 0 0)`
      );

      if (revealPercent > 60) {
        this.renderer.addClass(this.leftContent.nativeElement, 'revealed');
        this.renderer.addClass(this.rightContent.nativeElement, 'revealed');
      }

      if (progress < 1) {
        this.animationFrame = requestAnimationFrame(animate);
      } else {
        if (this.animationFrame) {
          cancelAnimationFrame(this.animationFrame);
          this.animationFrame = null;
        }
        this.renderer.setStyle(this.revealLayer.nativeElement, 'clipPath', 'inset(0 100% 0 0)');
        this.renderer.setStyle(this.carZipper.nativeElement, 'opacity', '0');
        this.renderer.addClass(this.leftContent.nativeElement, 'revealed');
        this.renderer.addClass(this.rightContent.nativeElement, 'revealed');
      }
    };

    this.animationFrame = requestAnimationFrame(animate);
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
      await this.router.navigate(['/owner/dashboard']);
    } catch (error: any) {
      this.toastService.show(error.error?.error || "Erreur d'inscription", 'error');
    } finally {
      this.isLoading = false;
    }
  }

  goToSignin(): void {
    this.router.navigate(['/auth/signin']);
  }

  ngOnDestroy() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
  }
}

import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  private readonly containerId = 'app-toast-container';
  private readonly stylesId = 'app-toast-styles';

  show(message: string, type: 'success' | 'error' | 'info' = 'info') {
    const container = this.ensureContainer();
    this.ensureStyles();

    const toast = document.createElement('div');
    toast.className = `toast-message toast-${type}`;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-message--hide');
      setTimeout(() => toast.remove(), 340);
    }, 3200);
  }

  private ensureContainer(): HTMLDivElement {
    let container = document.getElementById(this.containerId) as HTMLDivElement | null;
    if (container) {
      return container;
    }

    container = document.createElement('div');
    container.id = this.containerId;
    container.className = 'toast-container';
    document.body.appendChild(container);
    return container;
  }

  private ensureStyles(): void {
    if (document.getElementById(this.stylesId)) {
      return;
    }

    const style = document.createElement('style');
    style.id = this.stylesId;
    style.textContent = `
      .toast-container {
        position: fixed;
        left: 50%;
        bottom: calc(22px + env(safe-area-inset-bottom, 0px));
        transform: translateX(-50%);
        display: grid;
        justify-items: center;
        gap: 12px;
        width: min(100vw - 24px, 420px);
        z-index: 3000;
        pointer-events: none;
      }

      .toast-message {
        --toast-accent: #38bdf8;
        --toast-accent-soft: rgba(56, 189, 248, 0.22);
        position: relative;
        width: 100%;
        padding: 16px 18px;
        border-radius: 22px;
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.22);
        background:
          linear-gradient(135deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0.08)),
          linear-gradient(135deg, rgba(15, 23, 42, 0.82), rgba(15, 23, 42, 0.6));
        box-shadow:
          0 22px 54px rgba(15, 23, 42, 0.26),
          0 0 0 1px rgba(255, 255, 255, 0.06) inset,
          0 0 36px var(--toast-accent-soft);
        backdrop-filter: blur(18px) saturate(160%);
        -webkit-backdrop-filter: blur(18px) saturate(160%);
        color: #ffffff;
        font-size: 14px;
        font-weight: 700;
        line-height: 1.5;
        pointer-events: auto;
        animation: toastSlideIn 0.38s cubic-bezier(0.22, 1, 0.36, 1);
      }

      .toast-message::before {
        content: '';
        position: absolute;
        inset: 0;
        background:
          linear-gradient(115deg, rgba(255, 255, 255, 0.26) 0%, rgba(255, 255, 255, 0.06) 28%, transparent 55%),
          radial-gradient(circle at top left, var(--toast-accent-soft), transparent 54%);
        pointer-events: none;
      }

      .toast-message::after {
        content: '';
        position: absolute;
        left: 18px;
        right: 18px;
        top: 0;
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.75), transparent);
        opacity: 0.9;
        pointer-events: none;
      }

      .toast-success {
        --toast-accent: #22c55e;
        --toast-accent-soft: rgba(34, 197, 94, 0.3);
      }

      .toast-error {
        --toast-accent: #ef4444;
        --toast-accent-soft: rgba(239, 68, 68, 0.32);
      }

      .toast-info {
        --toast-accent: #38bdf8;
        --toast-accent-soft: rgba(56, 189, 248, 0.28);
      }

      .toast-message--hide {
        opacity: 0;
        transform: translateY(18px) scale(0.96);
        transition: opacity 0.32s ease, transform 0.32s ease;
      }

      @keyframes toastSlideIn {
        from {
          opacity: 0;
          transform: translateY(38px) scale(0.92);
        }
        60% {
          opacity: 1;
          transform: translateY(-3px) scale(1.01);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @media (max-width: 480px) {
        .toast-container {
          width: min(100vw - 20px, 360px);
          bottom: calc(16px + env(safe-area-inset-bottom, 0px));
        }

        .toast-message {
          padding: 15px 16px;
          border-radius: 20px;
          font-size: 13px;
        }
      }
    `;

    document.head.appendChild(style);
  }
}

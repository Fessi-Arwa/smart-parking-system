import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

import {
  DEFAULT_OWNER_WORKFLOW_STATE,
  OwnerWorkflowState,
} from '../models/owner-workflow.model';

@Injectable({
  providedIn: 'root',
})
export class OwnerWorkflowService {
  private readonly storageKey = 'owner_workflow_state';
  private readonly stateSubject = new BehaviorSubject<OwnerWorkflowState>(this.loadState());

  readonly state$ = this.stateSubject.asObservable();

  getSnapshot(): OwnerWorkflowState {
    return this.stateSubject.value;
  }

  refresh(): OwnerWorkflowState {
    const state = this.loadState();
    this.stateSubject.next(state);
    return state;
  }

  approveOwner(): void {
    this.updateState({
      ownerStatus: 'accepte',
      parkingStatus: 'valide',
      subscriptionStatus: 'en_attente_paiement',
    });
  }

  activateSubscription(): void {
    this.updateState({
      subscriptionStatus: 'actif',
      parkingSetupStatus: 'en_cours',
    });
  }

  completeParkingSetup(): void {
    this.updateState({
      parkingSetupStatus: 'terminee',
      aiSetupStatus: 'en_cours',
    });
  }

  activateAiSetup(): void {
    this.updateState({
      aiSetupStatus: 'active',
    });
  }

  resetDemo(): void {
    this.persistState(DEFAULT_OWNER_WORKFLOW_STATE);
  }

  getNextRoute(state: OwnerWorkflowState = this.getSnapshot()): string {
    if (state.ownerStatus !== 'accepte' || state.parkingStatus !== 'valide') {
      return '/owner/pending';
    }

    if (state.subscriptionStatus !== 'actif') {
      return '/owner/subscription';
    }

    if (state.parkingSetupStatus !== 'terminee') {
      return '/owner/parking-setup';
    }

    if (state.aiSetupStatus !== 'active') {
      return '/owner/ai-setup';
    }

    return '/owner/overview';
  }

  private updateState(patch: Partial<OwnerWorkflowState>): void {
    this.persistState({
      ...this.getSnapshot(),
      ...patch,
    });
  }

  private persistState(state: OwnerWorkflowState): void {
    localStorage.setItem(this.storageKey, JSON.stringify(state));
    this.stateSubject.next(state);
  }

  private loadState(): OwnerWorkflowState {
    const rawState = localStorage.getItem(this.storageKey);
    if (!rawState) {
      return DEFAULT_OWNER_WORKFLOW_STATE;
    }

    try {
      return {
        ...DEFAULT_OWNER_WORKFLOW_STATE,
        ...(JSON.parse(rawState) as Partial<OwnerWorkflowState>),
      };
    } catch {
      return DEFAULT_OWNER_WORKFLOW_STATE;
    }
  }
}
